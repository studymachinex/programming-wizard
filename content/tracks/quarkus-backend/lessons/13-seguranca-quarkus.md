> **Em uma frase:** segurança no Quarkus não é um filtro que você esquece de registrar — é uma decisão de identidade aplicada antes de o método rodar, com política no caminho e autorização no método.

## O problema

Um painel administrativo nasce com uma verificação no front-end: o menu “Relatórios” só aparece para quem tem `role=admin`. O endpoint por trás, porém, aceita qualquer requisição. Alguém descobre a URL, copia o token de um usuário comum e acessa dados de toda a base. O relatório de pentest classifica como *broken function level authorization*; o time responde que “o botão estava escondido”.

O problema oposto também aparece. O time protege tudo com uma role `admin`, e a primeira necessidade real — um gerente que pode ver pedidos do seu time, mas não de outro — vira uma explosão de roles: `admin`, `admin_relatorio`, `gerente`, `gerente_relatorio`. Cada combinação exige deploy, e a regra de negócio fica espalhada em `if` dentro dos resources.

Segurança de API é separar três perguntas: **quem é você** (autenticação), **o que você pode fazer** (autorização) e **qual identidade chega ao seu código** (propagação). O Quarkus responde às três com um modelo só, aplicado antes da invocação e sem uma filter chain que você monta à mão.

## Como funciona

**Autenticação.** Um mecanismo HTTP (Basic, Bearer JWT, OIDC, mTLS) transforma a credencial em um `AuthenticationRequest`. Um `IdentityProvider` valida e produz uma `SecurityIdentity`: principal, roles, credenciais e atributos. Se nada for apresentado, existe uma identidade anônima — não um `null` que explode longe da origem.

O Quarkus faz autenticação **proativa** por padrão: autentica antes de chamar o endpoint, mesmo que ele seja público. Isso deixa o comportamento previsível e permite que a identidade esteja disponível em filtros. A desvantagem é pagar o custo de validar um token em rotas que não precisam dele; para caminhos de altíssimo volume e acesso anônimo, avalie `quarkus.http.auth.proactive=false`.

**Autorização em duas camadas.** Primeiro, as permissões HTTP configuradas em `application.properties` decidem por caminho e método. Depois, as anotações no resource decidem por método. A regra de precedência importa:

- As permissões HTTP rodam **antes** das anotações.
- `@PermitAll` não consegue liberar um caminho que a configuração HTTP já bloqueou.
- Entre permissões HTTP, o caminho mais específico vence. `/api/admin/*` vence `/api/*`.
- Se nenhum caminho casar e nenhuma anotação existir, o endpoint fica aberto — a menos que você ative o modo fail-closed.

As anotações padrão são:

| Anotação | Efeito |
|---|---|
| `@PermitAll` | Libera, inclusive sem autenticação |
| `@Authenticated` | Exige identidade válida, sem role específica |
| `@RolesAllowed({"admin"})` | Exige ao menos uma das roles listadas |
| `@DenyAll` | Bloqueia tudo; útil como padrão de classe |
| `@PermissionsAllowed` | Exige permissão nomeada; veja a aula 15 |

`@RolesAllowed` aceita expressões de configuração, como `@RolesAllowed("${app.role.admin}")`. Isso evita recompilar quando o nome da role muda entre ambientes — mas também significa que um erro de configuração só aparece em runtime.

**Identidade no código.** Você injeta `SecurityIdentity` e lê `getPrincipal().getName()`, `getRoles()` e `hasRole()`. Em Jakarta REST, `@Context SecurityContext` também funciona. A identidade é um bean com escopo de requisição; em código assíncrono, ela só continua disponível se o contexto for propagado.

**Senhas.** O `quarkus-security-jpa` lê usuários de uma entidade anotada com `@UserDefinition`. Por padrão, espera bcrypt no formato modular (`$2a$...`), o que permite guardar algoritmo, custo e salt na própria string. `BcryptUtil.bcryptHash` gera o hash; a verificação é feita pelo provider. Argon2id é preferível quando disponível, mas exige um `PasswordProvider` customizado. O importante é nunca guardar senha em texto claro nem usar SHA-256 simples.

**Fail-closed.** `quarkus.security.jaxrs.deny-unannotated-endpoints=true` faz todo endpoint sem anotação responder como `@DenyAll`. É a configuração que transforma “esqueci de anotar” em `403`, não em vazamento. Em times grandes, ela deveria ser o padrão.

## Na prática

A entidade de usuário guarda o hash bcrypt e as roles em uma string separada por vírgula:

```java
package com.exemplo.seguranca;

import io.quarkus.elytron.security.common.BcryptUtil;
import io.quarkus.hibernate.orm.panache.PanacheEntity;
import io.quarkus.security.jpa.Password;
import io.quarkus.security.jpa.Roles;
import io.quarkus.security.jpa.UserDefinition;
import io.quarkus.security.jpa.Username;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "usuario")
@UserDefinition
public class Usuario extends PanacheEntity {

    @Username
    @Column(nullable = false, unique = true)
    public String email;

    @Password
    @Column(nullable = false)
    public String senhaHash;

    @Roles
    @Column(nullable = false)
    public String papeis; // "user,admin"

    public static Usuario criar(String email, String senha, String... papeis) {
        var usuario = new Usuario();
        usuario.email = email;
        usuario.senhaHash = BcryptUtil.bcryptHash(senha);
        usuario.papeis = String.join(",", papeis);
        usuario.persist();
        return usuario;
    }
}
```

A configuração protege por caminho e mantém o modo fail-closed:

```properties
quarkus.http.auth.basic=true
quarkus.security.jaxrs.deny-unannotated-endpoints=true

quarkus.http.auth.policy.admin.roles-allowed=admin
quarkus.http.auth.permission.admin.paths=/api/admin/*
quarkus.http.auth.permission.admin.policy=admin

quarkus.http.auth.policy.user.roles-allowed=user,admin
quarkus.http.auth.permission.api.paths=/api/*
quarkus.http.auth.permission.api.policy=user

quarkus.http.auth.permission.public.paths=/api/public/*
quarkus.http.auth.permission.public.policy=permit
```

O caminho mais específico vence: `/api/public/*` continua aberto dentro de `/api/*`. Se você inverter a intenção e tentar liberar com `@PermitAll`, não funciona — a política HTTP já barrou antes.

No resource, a autorização fica declarativa e a identidade é injetada:

```java
package com.exemplo.seguranca;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/eu")
public class PerfilResource {

    @Inject
    SecurityIdentity identity;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Perfil perfil() {
        return new Perfil(identity.getPrincipal().getName(), identity.getRoles());
    }

    public record Perfil(String email, java.util.Set<String> papeis) {
    }
}

@Path("/api/admin/relatorios")
@RolesAllowed("admin")
class RelatorioResource {

    @GET
    public String relatorio() {
        return "dados sensíveis";
    }
}
```

O teste de segurança usa `@TestSecurity`, que injeta uma identidade sem passar pelo banco:

```java
package com.exemplo.seguranca;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasItem;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

@QuarkusTest
class PerfilResourceTest {

    @Test
    @TestSecurity(user = "ana@exemplo.com", roles = {"user"})
    void usuarioComumVeOProprioPerfil() {
        given().when().get("/api/eu")
                .then().statusCode(200)
                .body("email", org.hamcrest.Matchers.is("ana@exemplo.com"))
                .body("papeis", hasItem("user"));
    }

    @Test
    @TestSecurity(user = "ana@exemplo.com", roles = {"user"})
    void usuarioComumNaoAcessaAdmin() {
        given().when().get("/api/admin/relatorios")
                .then().statusCode(403);
    }

    @Test
    void semCredencialRecebe401() {
        given().when().get("/api/eu")
                .then().statusCode(401);
    }
}
```

`@TestSecurity` não testa o provider de senha nem a validação do token; ele testa a camada de autorização. Para validar o login real, use um teste de integração com o banco e uma requisição Basic de verdade.

## Armadilhas comuns

- **Autorização só no front-end.** O menu escondido não é controle de acesso. Toda decisão precisa existir no servidor, no caminho ou no método.
- **Confiar em `X-User` ou `X-Role`.** A menos que um proxy confiável remova e reescreva esses headers, qualquer cliente os envia. Identidade vem de credencial validada, não de header arbitrário.
- **Achar que `@PermitAll` vence a configuração HTTP.** Ela não vence. Se o caminho está bloqueado na configuração, a anotação não abre.
- **Wildcard amplo demais.** `/api/*` com `permit` e a intenção de proteger só `/api/admin` deixa tudo aberto. Teste cada padrão com requisições reais.
- **Senha com hash rápido.** SHA-256 sem salt e sem custo é tabela rainbow esperando acontecer. Use bcrypt, Argon2id ou scrypt com custo calibrado.
- **Role como regra de negócio.** `ROLE_GERENTE` não responde “pode ver o pedido 42?”. Autorização fina pertence ao serviço de domínio ou a um `PermissionChecker`.
- **Identidade em thread assíncrona.** `SecurityIdentity` é request-scoped; sem propagação de contexto, ela falha ou vem anônima no `CompletableFuture`.
- **Logar credenciais.** `Authorization`, senha e refresh token nunca vão para log, trace ou mensagem de erro.

## Checklist de domínio

- [ ] Você explica a diferença entre autenticação, autorização e propagação de identidade
- [ ] Você configura permissões HTTP por caminho e método, sabendo qual vence quando há sobreposição
- [ ] Você usa `@RolesAllowed`, `@Authenticated`, `@PermitAll` e `@DenyAll` com intenção
- [ ] Você ativa o modo fail-closed e garante que endpoints públicos tenham uma exceção explícita
- [ ] Você guarda senhas com bcrypt ou Argon2id e sabe migrar um hash legado
- [ ] Você testa 401, 403 e o caminho feliz com `@TestSecurity`

## Para ir além

- [Quarkus — Security Overview](https://quarkus.io/guides/security-overview)
- [Quarkus — Authorization of Web Endpoints](https://quarkus.io/guides/security-authorize-web-endpoints-reference)
- [Quarkus — Security with Jakarta Persistence](https://quarkus.io/guides/security-jpa)
- [OWASP — Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
