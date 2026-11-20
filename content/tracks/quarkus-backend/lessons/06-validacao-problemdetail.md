> **Em uma frase:** valide na borda com Bean Validation e traduza toda falha para um `ProblemDetail` estável, com `type`, campos e `traceId` — o cliente reage ao código, e o stack trace fica no log, não na resposta.

## O problema

Sem validação explícita, cada resource acumula `if (request.nome() == null)`. As mensagens divergem, alguns endpoints devolvem `400` com texto livre, outros devolvem `500` com a exceção do Hibernate. O cliente não distingue “você errou o campo” de “eu quebrei”, e o suporte recebe print de tela em vez de um identificador rastreável.

Validação espalhada também esconde regras cruzadas. Dois campos individualmente válidos podem ser incompatíveis — data final antes da inicial, desconto maior que o total. Um `if` no meio do serviço resolve o caso, mas não documenta a regra nem aparece no contrato.

## Como funciona

Adicione `quarkus-hibernate-validator`. As constraints do Jakarta Bean Validation passam a valer em DTOs anotados e em parâmetros de resource marcados com `@Valid`. Sem `@Valid` no parâmetro, as anotações do DTO não são aplicadas. Para coleções e objetos aninhados, use `@Valid` no campo ou `List<@Valid Item>`.

Constraints de campo cobrem presença, tamanho, faixa e formato. Regras que envolvem mais de um campo pedem uma constraint de classe: uma anotação com `@Constraint(validatedBy = ...)` e um `ConstraintValidator` que recebe o objeto inteiro. A anotação precisa de `message`, `groups` e `payload`; o validador retorna `false` para violar.

Quando a validação falha, o runtime lança uma `ConstraintViolationException` com o conjunto de violações. Cada violação traz `propertyPath`, `message` e `invalidValue`. O `@ServerExceptionMapper` do Quarkus REST intercepta a exceção e produz a resposta. Um mapper por tipo de falha mantém a tradução HTTP em um só lugar.

| Falha | Origem | Status | `type` sugerido |
|---|---|---|---|
| Campo inválido | `ConstraintViolationException` | `422` | `/erros/validacao` |
| Recurso ausente | exceção de domínio | `404` | `/erros/nao-encontrado` |
| Estado incompatível | exceção de domínio | `409` | `/erros/conflito` |
| Falha inesperada | `Exception` | `500` | `/erros/interno` |

RFC 9457 define `type`, `title`, `status`, `detail` e `instance`, além de membros de extensão. `type` é uma URI que identifica a categoria; `title` é estável e legível; `detail` é específico da ocorrência. `traceId` e `errors` entram como extensões. O media type é `application/problem+json`.

Nunca devolva stack trace, SQL ou mensagem interna. O cliente recebe o `traceId`; o log recebe a exceção completa com o mesmo identificador. Se o OpenTelemetry estiver configurado, ele popula o `MDC` com `traceId`, que o mapper lê.

## Na prática

```java
package com.exemplo.pedido.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

public record CriarPedidoRequest(
        @NotBlank String clienteId,
        @NotEmpty List<@Valid ItemRequest> itens) {

    public record ItemRequest(@NotBlank String produtoId, @Positive int quantidade) {}
}
```

Regra cruzada com constraint de classe:

```java
package com.exemplo.reserva;

import jakarta.validation.*;
import java.lang.annotation.*;
import java.time.LocalDate;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PeriodoValido.Validador.class)
public @interface PeriodoValido {

    String message() default "a data final deve ser posterior à inicial";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};

    class Validador implements ConstraintValidator<PeriodoValido, CriarReservaRequest> {
        public boolean isValid(CriarReservaRequest r, ConstraintValidatorContext ctx) {
            return r == null || r.inicio() == null || r.fim() == null
                || r.fim().isAfter(r.inicio());
        }
    }
}

record CriarReservaRequest(@NotNull LocalDate inicio, @NotNull LocalDate fim) {}
```

O `ProblemDetail` é um record com os membros padrão e extensões explícitas:

```java
package com.exemplo.erros;

import java.net.URI;
import java.util.List;

public record ProblemDetail(URI type, String title, int status, String detail,
                            URI instance, String traceId, List<FieldError> errors) {
    public record FieldError(String field, String message) {}
}
```

```java
package com.exemplo.erros;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.validation.ConstraintViolationException;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.util.Comparator;
import org.jboss.resteasy.reactive.server.ServerExceptionMapper;
import org.slf4j.MDC;

@ApplicationScoped
public class ValidationMapper {

    @ServerExceptionMapper
    public Response mapear(ConstraintViolationException ex) {
        var erros = ex.getConstraintViolations().stream()
            .map(v -> new ProblemDetail.FieldError(
                v.getPropertyPath().toString(), v.getMessage()))
            .sorted(Comparator.comparing(ProblemDetail.FieldError::field))
            .toList();

        var traceId = MDC.get("traceId");
        var problem = new ProblemDetail(
            URI.create("https://api.exemplo/erros/validacao"),
            "Dados inválidos", 422,
            "Um ou mais campos precisam ser corrigidos.",
            null, traceId == null ? "sem-trace" : traceId, erros);

        return Response.status(422)
            .type("application/problem+json")
            .entity(problem)
            .build();
    }
}
```

O resource só declara a intenção: `public Response criar(@Valid CriarPedidoRequest request)`. Para `PedidoNaoEncontradoException`, um segundo mapper devolve `404`; para `ConflitoDeEstadoException`, `409`.

## Armadilhas comuns

- **Esquecer `@Valid`.** As constraints do DTO viram decoração e o serviço recebe `null` em campo obrigatório.
- **Mapear `Exception` sem critério.** Um mapper genérico pode capturar `WebApplicationException` e transformar `404` legítimo em `500`; mapeie tipos específicos.
- **Devolver a mensagem da exceção interna.** Vaza detalhe de infraestrutura e ajuda quem sonda a API.
- **Validar regra de negócio só com Bean Validation.** Estoque e saldo mudam durante a transação; a checagem final precisa acontecer no serviço, com lock ou constraint.
- **Ignorar `invalidValue` no log.** Ele ajuda a reproduzir sem expor o valor ao cliente.

## Checklist de domínio

- [ ] Você usa `@Valid` no corpo e em parâmetros, com a extensão de validação presente
- [ ] Você escreve uma constraint de classe para regra cruzada
- [ ] Você mapeia `ConstraintViolationException` para `422` com erros por campo
- [ ] Você inclui `traceId` na resposta e a exceção completa no log
- [ ] Você diferencia validação, conflito, ausência e falha interna
- [ ] Você não devolve stack trace nem mensagem de infraestrutura

## Para ir além

- [Quarkus — Validation with Hibernate Validator](https://quarkus.io/guides/validation)
- [Quarkus — Writing REST services: exception mapping](https://quarkus.io/guides/rest#exception-mapping)
- [Quarkus — OpenTelemetry and trace correlation](https://quarkus.io/guides/opentelemetry)
- [Jakarta Bean Validation 3.0](https://jakarta.ee/specifications/bean-validation/3.0/)
- [Hibernate Validator Reference](https://hibernate.org/validator/documentation/)
