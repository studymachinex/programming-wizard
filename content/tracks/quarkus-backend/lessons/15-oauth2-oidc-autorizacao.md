> **Em uma frase:** OAuth2 delega acesso, OIDC autentica pessoas e a autorização fina continua sendo sua — scope, role e “dono do recurso” respondem perguntas diferentes.

## O problema

O time precisa integrar com o SSO da empresa. A primeira tentativa é guardar usuário e senha no próprio banco e sincronizar com o provedor por um job. A segunda é aceitar o token do provedor, ler o e-mail e liberar tudo para quem tem `role=user`. A terceira é descobrir, em produção, que `role=user` inclui todos os clientes e que qualquer usuário autenticado consegue ler o pedido de outro trocando o id na URL.

OAuth2 resolve delegação: como um cliente obtém acesso limitado a um recurso em nome do usuário. OIDC adiciona uma camada de identidade sobre OAuth2: quem é o usuário, como ele se autenticou e por quanto tempo. Nenhum dos dois resolve sozinho a pergunta “este usuário pode agir sobre este recurso específico?”. Essa resposta é autorização da sua aplicação.

O erro clássico é confundir os três conceitos. **Scope** é o que o usuário delegou ao cliente (`pedidos:read`). **Role** é o papel do usuário no sistema (`gerente`). **Permissão** é a ação concreta sobre um recurso (`pedidos:42:read`). Um token com o scope certo e a role certa ainda pode pertencer a alguém que não é dono do pedido 42.

## Como funciona

**Fluxos que ainda fazem sentido.** O authorization code com PKCE é o padrão para SPA e aplicativo móvel: o cliente não guarda segredo, redireciona o usuário ao provedor, recebe um código de curta duração e o troca usando um `code_verifier`. O client credentials serve para serviço-a-serviço, sem usuário. O device code atende TVs e CLIs. Implicit flow e resource owner password credentials estão obsoletos: o primeiro expõe tokens na URL; o segundo ensina o cliente a manipular a senha.

**Papéis no fluxo.**

| Ator | Responsabilidade |
|---|---|
| Resource owner | O usuário que delega acesso |
| Client | A aplicação que pede o token |
| Authorization server | Autentica, emite e assina tokens |
| Resource server | Sua API, que valida o token e autoriza |

**OIDC na prática.** O provedor publica `/.well-known/openid-configuration` com endpoints e chaves. O ID token é um JWT com `iss`, `sub`, `aud`, `exp` e claims de identidade. O access token é para a API; ele não precisa ser um JWT — pode ser opaco, e nesse caso a API introspecciona no provedor. Em Quarkus, `quarkus.oidc.application-type=service` configura um resource server que aceita bearer token; `web-app` configura um cliente confidencial com code flow e sessão de servidor. Uma SPA hospedada separadamente normalmente usa uma biblioteca OIDC no navegador e a API fica como `service`.

**Validação no resource server.** Valide assinatura, `iss`, `aud`, `exp` e algoritmo. O Quarkus descobre o issuer pelo documento de configuração; se o provedor não publicar metadados ou usar hosts diferentes, fixe `quarkus.oidc.token.issuer`. A audience de access token não é padronizada; configure `quarkus.oidc.token.audience` quando o provedor a define. Tokens opacos exigem introspecção e `client-id`; tokens JWT locais não exigem segredo do cliente.

**Autorização fina.** Roles e scopes são grossos demais para “meu pedido”. O Quarkus oferece `@PermissionsAllowed("pedidos:read")` e `@PermissionChecker`, que transforma uma permissão nomeada em um método CDI com acesso à `SecurityIdentity` e aos parâmetros da requisição. É onde você verifica posse, tenant, estado do recurso e qualquer regra que não cabe em uma role.

**Scope não é role.** Scope é delegado pelo usuário ao cliente; se o cliente é confiável e o usuário aprovou `pedidos:read`, o token tem esse scope. Role é atributo do usuário no provedor. Usar scope como se fosse role deixa qualquer cliente que peça o scope certo acessar tudo. Use scope para limitar o cliente e role/permissão para limitar o usuário.

## Na prática

O resource server valida o token do provedor e mapeia o claim `groups` para roles:

```properties
quarkus.oidc.auth-server-url=${OIDC_AUTH_SERVER_URL}
quarkus.oidc.application-type=service
quarkus.oidc.client-id=pedidos-api
quarkus.oidc.token.audience=${quarkus.oidc.client-id}
quarkus.oidc.token.issuer=${OIDC_ISSUER}
quarkus.oidc.token.signature-algorithm=RS256
quarkus.oidc.token.subject-required=true
quarkus.oidc.roles.role-claim-path=groups
```

O endpoint exige a permissão e o checker valida o scope e a posse do pedido:

```java
package com.exemplo.pedidos;

import io.quarkus.security.PermissionChecker;
import io.quarkus.security.PermissionsAllowed;
import io.quarkus.security.identity.SecurityIdentity;
import io.smallrye.jwt.auth.principal.JsonWebToken;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.Arrays;

@Path("/api/pedidos")
@Produces(MediaType.APPLICATION_JSON)
public class PedidoResource {

    @Inject
    JsonWebToken jwt;

    @GET
    @Path("/{id}")
    @PermissionsAllowed("pedidos:read")
    public PedidoResponse buscar(@PathParam("id") Long id) {
        var email = jwt.getName();
        var pedido = Pedido.<Pedido>find("id = ?1 and cliente.email = ?2", id, email)
                .firstResult();
        if (pedido == null) {
            throw new NotFoundException(); // não revela se existe para outro usuário
        }
        return PedidoResponse.de(pedido);
    }

    @PermissionChecker("pedidos:read")
    boolean podeLer(SecurityIdentity identity, Long id) {
        if (!temEscopo("pedidos:read")) {
            return false;
        }
        var email = identity.getPrincipal().getName();
        return Pedido.count("id = ?1 and cliente.email = ?2", id, email) == 1;
    }

    private boolean temEscopo(String esperado) {
        var bruto = jwt.getClaim("scope");
        if (bruto == null) {
            return false;
        }
        return Arrays.asList(bruto.toString().split(" ")).contains(esperado);
    }
}
```

O checker e o endpoint fazem a mesma consulta; em código real, extraia para um `PedidoService` e reuse. O importante é que a decisão não depende de um `if` no meio da regra de negócio nem de dados que o cliente enviou.

Para uma aplicação server-side com login no provedor, o Quarkus assume o code flow:

```properties
quarkus.oidc.auth-server-url=${OIDC_AUTH_SERVER_URL}
quarkus.oidc.application-type=web-app
quarkus.oidc.client-id=portal-web
quarkus.oidc.credentials.secret=${OIDC_CLIENT_SECRET}
quarkus.oidc.authentication.scopes=openid,profile,email
quarkus.oidc.authentication.redirect-path=/callback
```

Nesse modo, o navegador recebe um cookie de sessão do Quarkus, não o access token. A API interna pode propagar o token para outro serviço; para chamadas serviço-a-serviço, prefira client credentials com um cliente dedicado, não o token do usuário.

Um teste de autorização fina pode usar `@TestSecurity` para o caso base e um teste de integração com o provedor para o fluxo completo:

```java
@QuarkusTest
class PedidoResourceTest {

    @Test
    @TestSecurity(user = "ana@exemplo.com", roles = {"user"})
    void naoAcessaPedidoDeOutroCliente() {
        given().when().get("/api/pedidos/99")
                .then().statusCode(403); // ou 404, se o serviço optar por não revelar existência
    }
}
```

`@TestSecurity` não valida assinatura nem OIDC; ele testa a camada de autorização. Para o fluxo real, use `quarkus-test-oidc-server` ou um provedor em Testcontainers.

## Armadilhas comuns

- **Usar scope como role.** Scope é delegado pelo usuário ao cliente; não descreve o papel dele. Um cliente confiável com `pedidos:read` não deve ler pedidos de qualquer usuário.
- **Confiar no `groups` sem validar a origem.** O claim só vale depois que assinatura, issuer e audience foram verificados. Não aceite token de outro tenant só porque o `groups` parece certo.
- **Ignorar a audience.** Um token emitido para outro serviço do mesmo provedor pode ser aceito se a API não restringir `aud`. Configure `quarkus.oidc.token.audience`.
- **Autorizar só por role.** `@RolesAllowed("user")` não responde “este pedido é do usuário”. A posse e o tenant precisam entrar na decisão.
- **Devolver 403 para recurso inexistente.** Isso confirma a existência. Para dados sensíveis, prefira 404 quando o usuário não tem vínculo com o recurso.
- **Token opaco sem introspecção.** Se o provedor emite token opaco, a API precisa chamar o endpoint de introspecção; validar localmente não funciona. Configure `client-id` e credencial quando exigido.
- **PKCE sem verifier.** O `code_challenge` sozinho não protege; o `code_verifier` precisa ser aleatório, de uso único e nunca ir para logs.
- **Confundir `web-app` com SPA.** `web-app` é cliente confidencial server-side. Uma SPA pública deve usar PKCE no navegador e a API como resource server.

## Checklist de domínio

- [ ] Você escolhe authorization code + PKCE para usuário e client credentials para serviço
- [ ] Você configura um resource server Quarkus validando issuer, audience e algoritmo
- [ ] Você diferencia scope, role e permissão e sabe qual usar em cada decisão
- [ ] Você implementa `@PermissionsAllowed` com um `@PermissionChecker` que verifica posse ou tenant
- [ ] Você trata 401, 403 e 404 sem revelar a existência de recursos de outros usuários
- [ ] Você testa a autorização fina sem depender do provedor real

## Para ir além

- [Quarkus — OpenID Connect Bearer Token Authentication](https://quarkus.io/guides/security-oidc-bearer-token-authentication)
- [Quarkus — Authorization of Web Endpoints](https://quarkus.io/guides/security-authorize-web-endpoints-reference)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
