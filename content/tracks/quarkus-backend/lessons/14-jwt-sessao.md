> **Em uma frase:** JWT não é uma sessão sem estado — é uma credencial assinada com prazo curto e um refresh token que você precisa saber revogar antes que alguém o copie.

## O problema

A primeira versão do login devolve um JWT com validade de 24 horas e o guarda no `localStorage`. Funciona. Meses depois, um usuário é desligado, o token continua válido até o fim do dia, e não existe botão de “sair de todos os dispositivos” que realmente funcione. Um XSS rouba o token e o atacante o usa de outra máquina; o servidor não tem como distinguir os dois.

O time então aumenta a expiração para 30 dias “para não deslogar o usuário” e cria um endpoint de logout que só apaga o token do navegador. A credencial continua aceita. O problema não é o formato JWT; é tratar o token como se fosse uma sessão revogável quando ele foi desenhado para ser autocontido.

A solução tem três peças: access token curto e verificado corretamente, refresh token opaco e rotativo, e um ponto de revogação que o access token consulta ou que o força a expirar rápido. Stateless é uma escolha sobre onde guardar estado, não uma promessa de que não existe estado.

## Como funciona

**Anatomia.** Um JWT tem três partes em Base64URL: header, payload e assinatura. O payload é legível por qualquer um — JWT não é criptografia. A assinatura garante integridade e origem, desde que você valide a chave certa. Colocar dado sensível no payload é publicá-lo.

As claims que importam:

| Claim | Papel |
|---|---|
| `iss` | Quem emitiu; precisa ser exatamente o esperado |
| `sub` | Quem é o usuário; use um identificador estável, não o e-mail que muda |
| `aud` | Para qual API o token vale; evita replay entre serviços |
| `exp` / `nbf` / `iat` | Expiração, início de validade e emissão; aceite pouco skew de relógio |
| `jti` | Identificador do token, útil para denylist |
| `sid` | Identificador da sessão, útil para revogar todos os tokens dela |
| `groups` / `roles` | Autorização; cuidado com token grande e claim não confiável |

**Validação.** Assinatura sozinha não basta. Fixe o algoritmo (`RS256`, `ES256`) para impedir `alg: none` e confusão entre HMAC e RSA. Valide `iss`, `aud` e `exp`. Se a chave pública vier de um JWKS, selecione pelo `kid` e trate rotação: mantenha a chave antiga publicada até o último token emitido com ela expirar. Relógios desalinhados são reais; uma tolerância de 30 a 60 segundos evita 401 intermitente, mas não justifique horas.

**Access e refresh.** O access token é enviado em toda requisição e, portanto, tem mais chance de vazar em log, proxy ou extensão. Ele deve durar minutos — 5 a 15 — e carregar só o necessário. O refresh token é enviado raramente, dura dias, é opaco (não um JWT) e fica armazenado no servidor apenas como hash. Cada uso do refresh gera um novo refresh e invalida o anterior: rotação. Se um refresh já rotacionado aparecer de novo, ou o cliente sofreu roubo ou o token vazou; revogue a família inteira.

**Revogação.** Com access token curto, você tem três opções:

1. **Aceitar a janela.** Logout invalida o refresh; o access expira em minutos. Simples, mas o token roubado vale até o `exp`.
2. **Denylist por `jti`.** Guarde os tokens revogados em Redis com TTL igual ao tempo restante. Custa uma consulta por requisição.
3. **Versão de sessão.** O token carrega `sid`; o servidor mantém a sessão ativa e recusa `sid` revogado. Custa uma consulta, mas permite “sair de todos os dispositivos” e revogação imediata.

Para a maioria das APIs, a opção 1 combinada com access de 10 minutos é suficiente. Para dados sensíveis, use 2 ou 3.

**Onde guardar no navegador.** `localStorage` é acessível a qualquer JavaScript injetado: um XSS lê o token. Cookie `HttpOnly`, `Secure` e `SameSite` reduz o roubo por script, mas exige proteção CSRF e atenção a subdomínios. Nenhuma opção é gratuita; escolha com o modelo de ameaça explícito.

## Na prática

A configuração do resource server valida a chave pública, o emissor, a audiência e o algoritmo:

```properties
mp.jwt.verify.publickey.location=classpath:publicKey.pem
mp.jwt.verify.publickey.algorithm=RS256
mp.jwt.verify.issuer=https://api.exemplo.com
mp.jwt.verify.audiences=pedidos-api

smallrye.jwt.sign.key.location=classpath:privateKey.pem
smallrye.jwt.sign.key.id=kid-2026-01
```

Em produção, a chave privada não fica no classpath: vem de um secret montado ou de um KMS. A pública pode vir de `https://.../.well-known/jwks.json`, o que facilita rotação por `kid`.

A sessão guarda o `sid` e o hash do refresh. O access token nunca é persistido:

```java
package com.exemplo.auth;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "sessao")
public class Sessao extends PanacheEntity {

    @Column(nullable = false, unique = true)
    public String sid;

    @Column(nullable = false, unique = true)
    public String refreshHash;

    @Column(nullable = false)
    public String usuarioEmail;

    @Column(nullable = false)
    public Instant expiraEm;

    public Instant revogadaEm;
}
```

O serviço emite o access com `sid` e devolve um refresh aleatório cujo hash é o único dado persistido:

```java
package com.exemplo.auth;

import io.smallrye.jwt.build.Jwt;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

@ApplicationScoped
public class TokenService {

    private static final Duration ACCESS = Duration.ofMinutes(10);
    private static final Duration REFRESH = Duration.ofDays(30);
    private static final SecureRandom RANDOM = new SecureRandom();

    @Transactional
    public Tokens iniciarSessao(Usuario usuario) {
        var sid = UUID.randomUUID().toString();
        var refresh = aleatorio();
        var sessao = new Sessao();
        sessao.sid = sid;
        sessao.refreshHash = hash(refresh);
        sessao.usuarioEmail = usuario.email;
        sessao.expiraEm = Instant.now().plus(REFRESH);
        sessao.persist();
        return new Tokens(access(usuario.email, sid), refresh);
    }

    @Transactional
    public Tokens renovar(String refreshRecebido) {
        var sessao = Sessao.<Sessao>find("refreshHash", hash(refreshRecebido)).firstResult();
        if (sessao == null) {
            throw new CredencialInvalidaException();
        }
        if (sessao.revogadaEm != null) {
            // Reuso de refresh já rotacionado: derruba a família inteira.
            revogarSessao(sessao.sid);
            throw new CredencialInvalidaException();
        }
        if (sessao.expiraEm.isBefore(Instant.now())) {
            throw new CredencialInvalidaException();
        }
        var novoRefresh = aleatorio();
        sessao.refreshHash = hash(novoRefresh);
        sessao.expiraEm = Instant.now().plus(REFRESH);
        return new Tokens(access(sessao.usuarioEmail, sessao.sid), novoRefresh);
    }

    @Transactional
    public void revogarSessao(String sid) {
        Sessao.update("revogadaEm = ?1 where sid = ?2 and revogadaEm is null",
                Instant.now(), sid);
    }

    private String access(String email, String sid) {
        return Jwt.issuer("https://api.exemplo.com")
                .audience("pedidos-api")
                .subject(email)
                .claim("sid", sid)
                .expiresIn(ACCESS)
                .sign();
    }

    private static String aleatorio() {
        var bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String hash(String valor) {
        try {
            var digest = MessageDigest.getInstance("SHA-256")
                    .digest(valor.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public record Tokens(String accessToken, String refreshToken) {
    }
}
```

Um filtro consulta o `sid` e recusa tokens de sessões revogadas. Ele roda depois da autenticação, então `JsonWebToken` já está validado:

```java
package com.exemplo.auth;

import io.smallrye.jwt.auth.principal.JsonWebToken;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

@Provider
@Priority(Priorities.AUTHENTICATION + 1)
public class SessaoRevogadaFilter implements ContainerRequestFilter {

    @Inject
    JsonWebToken jwt;

    @Inject
    SessaoService sessoes;

    @Override
    public void filter(ContainerRequestContext ctx) {
        if (ctx.getHeaderString("Authorization") == null || jwt == null) {
            return; // rota pública ou desafio tratado pelo mecanismo
        }
        var sid = jwt.getClaim("sid");
        if (sid != null && sessoes.estaRevogada(sid.toString())) {
            ctx.abortWith(Response.status(401)
                    .header("WWW-Authenticate", "Bearer error=\"invalid_token\"")
                    .build());
        }
    }
}
```

Logout chama `revogarSessao` e apaga o cookie/refresh do cliente. Trocar a senha revoga todas as sessões do usuário. “Sair de todos os dispositivos” lista e revoga por `usuarioEmail`. Nada disso exige esperar o access token expirar.

## Armadilhas comuns

- **Não validar `aud` e `iss`.** Um token emitido para outro serviço do mesmo provedor pode ser aceito na sua API. Valide o contexto, não só a assinatura.
- **Aceitar o algoritmo do header.** Fixar `RS256` evita `alg: none` e confusão HMAC/RSA. A chave pública nunca deve ser usada como segredo HMAC.
- **Refresh sem rotação.** O mesmo refresh vale para sempre; se vazar, o atacante renova indefinidamente. Rotacione e detecte reuso.
- **Guardar o refresh em texto claro.** O banco vaza e todos os refresh vazam junto. Guarde hash; o token original só existe no cliente.
- **Logout que só apaga o cliente.** Sem revogação, o token continua válido. Se o requisito é logout imediato, implemente `sid`/denylist.
- **Token em URL ou log.** `?token=` vaza em access log, Referer e histórico. Use header `Authorization` e nunca logue o valor.
- **Access token com dados demais.** Claims crescem, o header fica grande e a autorização fica velha. Mantenha o token pequeno e consulte o estado quando a decisão exigir.
- **Relógio ignorado.** `exp` no passado por segundos derruba requisições legítimas; `nbf` no futuro idem. Configure skew pequeno e monitore.

## Checklist de domínio

- [ ] Você valida assinatura, algoritmo, `iss`, `aud` e `exp` — não apenas a assinatura
- [ ] Você explica por que o payload do JWT é público e não coloca segredo nele
- [ ] Você separa access token curto de refresh token opaco, rotativo e armazenado como hash
- [ ] Você detecta reuso de refresh e revoga a família de sessões
- [ ] Você implementa logout com revogação por `sid` ou aceita explicitamente a janela de expiração
- [ ] Você escolhe entre cookie `HttpOnly` e `localStorage` conhecendo XSS e CSRF

## Para ir além

- [Quarkus — JWT](https://quarkus.io/guides/security-jwt)
- [Quarkus — JWT Build](https://quarkus.io/guides/security-jwt-build)
- [RFC 7519 — JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
- [OWASP — JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
