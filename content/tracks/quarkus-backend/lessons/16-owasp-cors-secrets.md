> **Em uma frase:** as falhas que derrubam uma API raramente são criptografia quebrada — são um id trocado na URL, um campo extra no JSON, uma origem `*` no CORS e um segredo que vazou junto com a imagem.

## O problema

O relatório de pentest chega com cinco achados que parecem independentes. Um usuário comum lê o pedido de outro trocando `/api/pedidos/42` por `/api/pedidos/43`. O cadastro aceita `{"nome":"Ana","role":"admin"}` e a conta nasce administradora. O CORS aceita qualquer origem com credenciais. A senha do banco está no `application.properties` e foi para a imagem. O endpoint de login aceita mil tentativas por minuto.

Todos são o mesmo tipo de erro: a aplicação confia em algo que o cliente controla. Id, campos do JSON, header `Origin`, volume de requisições. Segurança de API é definir explicitamente o que o cliente pode escolher e validar o resto no servidor.

OWASP API Security Top 10 (2023) organiza esses erros:

| Risco | O que acontece na prática |
|---|---|
| API1 BOLA | Trocar o id e acessar recurso de outro usuário |
| API2 Broken Authentication | Token fraco, login sem limite, recuperação de senha enumerável |
| API3 BOPLA | Mass assignment e resposta com campos demais |
| API4 Resource Consumption | Upload sem limite, consulta cara, ausência de paginação |
| API5 BFLA | Usuário comum chama função administrativa |
| API7 SSRF | API busca URL arbitrária e alcança a rede interna |
| API8 Misconfiguration | CORS amplo, debug ligado, segredo no repositório |

## Como funciona

**BOLA (Broken Object Level Authorization).** A role diz que o usuário pode ler pedidos; não diz qual pedido. A consulta precisa incluir o vínculo com o sujeito, não apenas o id:

```java
var pedido = Pedido.<Pedido>find("id = ?1 and cliente.email = ?2", id, email)
        .firstResult();
if (pedido == null) {
    throw new NotFoundException(); // 404 evita confirmar a existência
}
```

Filtrar depois de carregar (`if (!pedido.cliente.email.equals(email))`) funciona, mas é fácil esquecer em um endpoint novo. Prefira a consulta já escopada e um teste que tente acessar o recurso de outro usuário.

**Mass assignment e exposição excessiva.** Se o JSON é desserializado direto na entidade, todo campo público vira entrada. Um `role`, `saldo`, `ativo` ou `tenantId` aceito sem intenção é escalada de privilégio. Use um DTO de entrada com apenas os campos permitidos e um DTO de saída com apenas os campos que o cliente deve ver:

```java
public record CriarUsuario(String nome, String email, String senha) {
}

public record UsuarioResponse(Long id, String nome, String email) {
}
```

Não confie em `@JsonIgnore` como única barreira: ele protege a serialização, não necessariamente a desserialização, e é fácil remover sem perceber. O DTO é a fronteira explícita.

**CORS.** CORS é uma proteção do navegador, não autenticação. A configuração correta lista origens explícitas, métodos e headers necessários:

```properties
quarkus.http.cors.enabled=true
quarkus.http.cors.origins=https://app.exemplo.com,https://admin.exemplo.com
quarkus.http.cors.methods=GET,POST,PUT,PATCH,DELETE
quarkus.http.cors.headers=accept,authorization,content-type,idempotency-key
quarkus.http.cors.exposed-headers=Location,Retry-After
quarkus.http.cors.access-control-max-age=24H
quarkus.http.cors.access-control-allow-credentials=true
```

`origins=*` com `allow-credentials=true` é inválido e inseguro: qualquer site faria requisições autenticadas em nome do usuário. Refletir o header `Origin` sem validação é a mesma coisa com outro nome. CORS não substitui CSRF: se você usa cookie, o navegador envia o cookie em requisições de outro site; `SameSite` e token CSRF são necessários.

**Segredos.** Segredo não entra no repositório, na imagem, no log nem no histórico do shell. A configuração lê de variável de ambiente ou arquivo montado:

```properties
quarkus.datasource.username=${DB_USER}
quarkus.datasource.password=${DB_PASSWORD}
quarkus.oidc.credentials.secret=${OIDC_CLIENT_SECRET}
```

Sem valor padrão, a aplicação falha na inicialização se a variável não existir — o que é melhor do que subir com `admin/admin`. Em Kubernetes, use `Secret` montado como arquivo ou um operador de segredos (External Secrets, Vault, Sealed Secrets); em Docker Compose local, `.env` fora do controle de versão. Rotacione segredos e tenha um plano para duas versões válidas durante a troca. Cuidado com `docker history`, camadas de imagem e logs de build: uma variável passada em `ARG` fica na imagem.

**Rate limiting.** Limitar protege disponibilidade e custo, mas um limite mal escolhido vira negação de serviço. Decida a chave: identidade do token (`sub`) + rota é mais justa que IP; IP é fallback para tráfego anônimo e proteção contra varredura. NAT corporativo compartilha IP, então limitar só por IP pune muitos usuários de uma vez. Limites diferentes para login, OTP, busca cara e escrita.

O `@RateLimit` do SmallRye Fault Tolerance é local ao processo: em três réplicas, o limite efetivo é três vezes o configurado. Ele serve para proteger um método dentro da instância, não para uma cota global. Para cota distribuída, use Redis com `INCR` + `PEXPIRE` atômicos ou um gateway de API.

```java
import io.smallrye.faulttolerance.api.RateLimit;
import java.time.temporal.ChronoUnit;

@RateLimit(value = 5, window = 1, windowUnit = ChronoUnit.MINUTES)
public Tokens login(Credenciais credenciais) {
    return autenticar(credenciais);
}
```

O script Lua abaixo implementa a janela fixa de forma atômica. A chave deve incluir a rota e o sujeito, e o TTL garante que chaves antigas desapareçam:

```lua
local atual = redis.call('INCR', KEYS[1])
if atual == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return atual
```

Se o retorno for maior que o limite, responda `429 Too Many Requests` com `Retry-After`. Não devolva `200` com corpo vazio: o cliente precisa saber que foi limitado. Em caso de falha do Redis, decida se o sistema falha aberto (aceita) ou fechado (rejeita). Para login, falhar fechado é defensável; para catálogo público, falhar aberto com log e alerta evita derrubar a loja.

## Na prática

Um filtro aplica a cota por sujeito e rota, com fallback para IP anônimo:

```java
package com.exemplo.seguranca;

import io.vertx.ext.web.RoutingContext;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

@Provider
@Priority(Priorities.AUTHORIZATION)
public class RateLimitFilter implements ContainerRequestFilter {

    @Inject
    RateLimiter limiter;

    @Inject
    SecurityIdentity identity;

    @Inject
    RoutingContext routing;

    @Override
    public void filter(ContainerRequestContext ctx) {
        var rota = ctx.getUriInfo().getMatchedURIs().stream()
                .findFirst().orElse(ctx.getUriInfo().getPath());
        var sujeito = identity.isAnonymous()
                ? "ip:" + routing.request().remoteAddress().host()
                : "sub:" + identity.getPrincipal().getName();

        var decisao = limiter.tentar(sujeito, rota);
        if (!decisao.permitido()) {
            ctx.abortWith(Response.status(429)
                    .header("Retry-After", decisao.segundos())
                    .type("application/problem+json")
                    .entity("""
                            {"type":"https://api.exemplo.com/errors/rate-limit",
                             "title":"Limite de requisições excedido",
                             "status":429}
                            """)
                    .build());
        }
    }
}
```

O `RateLimiter` é a fronteira testável: em teste, use uma implementação em memória; em produção, a versão Redis com o script acima. Se a aplicação está atrás de proxy, o IP remoto é o do proxy. Só confie em `X-Forwarded-For` quando o proxy remove o header do cliente e o reescreve; caso contrário, o atacante escolhe o próprio IP.

Para headers de segurança, o Quarkus permite configurar respostas sem um filtro:

```properties
quarkus.http.header."X-Content-Type-Options".value=nosniff
quarkus.http.header."X-Frame-Options".value=DENY
quarkus.http.header."Referrer-Policy".value=no-referrer
quarkus.http.header."Content-Security-Policy".value=default-src 'none'; frame-ancestors 'none'
```

Esses headers não corrigem BOLA nem mass assignment, mas reduzem a superfície de XSS, clickjacking e vazamento de URL. Ajuste a CSP ao seu front-end; uma CSP genérica quebrada é pior que nenhuma.

## Armadilhas comuns

- **Checar posse só na listagem.** O detalhe, o update e o delete também precisam do vínculo com o usuário. BOLA costuma aparecer no endpoint que você esqueceu.
- **Binding direto na entidade.** Campos extras alteram estado interno. DTO de entrada com allowlist resolve; valide também no serviço, não só no JSON.
- **CORS como controle de acesso.** CORS impede leitura por outro site, mas não impede chamadas server-side nem protege contra CSRF. A autorização continua na API.
- **Wildcard com credenciais.** `*` + `allow-credentials=true` é inválido e abre a porta para qualquer origem. Liste origens e revise a cada novo front-end.
- **Segredo no repositório ou na imagem.** Trocar depois é caro; o histórico e as camadas guardam o valor. Use variável/secret e rotacione.
- **Rate limit só por IP.** NAT compartilhado e proxies derrubam usuários legítimos; IP forjado contorna. Combine sujeito, rota e IP com limites distintos.
- **Rate limit sem `Retry-After`.** O cliente não sabe quando voltar e entra em retry agressivo, piorando o pico.
- **Confiar em `X-Forwarded-For` sem proxy confiável.** O cliente escolhe o valor e escapa do limite.
- **SSRF em “buscar URL”.** Se a API busca uma URL arbitrária, bloqueie esquemas, IPs privados, loopback e o endpoint de metadata da nuvem; prefira allowlist de hosts.
- **Logar PII e tokens.** Log de requisição com corpo e header é vazamento permanente. Masque `Authorization`, senha e documentos.

## Checklist de domínio

- [ ] Você escopa toda consulta por dono ou tenant, não só a listagem
- [ ] Você usa DTOs de entrada e saída e rejeita campos não previstos
- [ ] Você configura CORS com origens explícitas e entende por que CORS não é autorização
- [ ] Você mantém segredos fora do repositório e da imagem, com falha rápida quando faltam
- [ ] Você aplica rate limit por sujeito + rota, com fallback para IP e `Retry-After`
- [ ] Você sabe quando o limite local do `@RateLimit` não basta e precisa de Redis ou gateway
- [ ] Você considera SSRF e headers de segurança na revisão de endpoints

## Para ir além

- [OWASP — API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [Quarkus — CORS](https://quarkus.io/guides/security-cors)
- [OWASP — Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP — Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
