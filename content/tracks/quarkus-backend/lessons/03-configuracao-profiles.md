> **Em uma frase:** configuração é contrato de runtime: `@ConfigMapping` transforma um grupo de propriedades em interface tipada, validada no startup, e profiles definem o que muda entre desenvolvimento, teste e produção sem recompilar a lógica.

## O problema

`@ConfigProperty` espalhado por dez classes funciona até alguém digitar `timout` em vez de `timeout`. Aí a aplicação sobe, recebe tráfego e falha no meio de uma cobrança. Strings sem tipo, defaults duplicados em lugares diferentes e segredos commitados no `application.properties` completam o pacote.

O segundo problema é saber o que pode mudar sem rebuild. O Quarkus fixa algumas propriedades em build time para otimizar o startup. Se você trata todas como runtime, descobre em produção que mudar a URL do banco exige nova imagem — ou pior, que a mudança simplesmente não tem efeito.

## Como funciona

O Quarkus usa o SmallRye Config, que agrega fontes ordenadas por precedência. A regra prática: o que está mais próximo do ambiente vence o que está empacotado no artefato.

| Precedência | Fonte | Exemplo |
|---|---|---|
| Maior | Propriedades de sistema (`-D`) | `-Dapp.pagamento.timeout=1s` |
| ↓ | Variáveis de ambiente | `APP_PAGAMENTO_TIMEOUT=1s` |
| ↓ | Arquivo `.env` (dev/test) | `APP_PAGAMENTO_TIMEOUT=1s` |
| ↓ | `application.properties` com profile | `%prod.app.pagamento.timeout=1s` |
| Menor | `application.properties` base | `app.pagamento.timeout=2s` |

A conversão de `APP_PAGAMENTO_TIMEOUT` para `app.pagamento.timeout` segue o mapeamento de nomes do SmallRye: maiúsculas, `_` no lugar de `.` e `-`. Por isso uma variável de ambiente vence o arquivo, mesmo que o arquivo tenha sido carregado antes.

Profiles são prefixos. `%dev.`, `%test.` e `%prod.` sobrescrevem a chave base apenas no profile ativo. O Quarkus ativa `dev` no modo de desenvolvimento, `test` nos testes e `prod` no artefato empacotado. O arquivo `.env` é lido por padrão só em dev e test; em produção, use variáveis de ambiente ou um gerenciador de segredos.

`@ConfigMapping` declara uma interface com prefixo e métodos. O SmallRye converte tipos (`Duration`, `URI`, enums, `Optional`), aplica defaults e valida constraints de Bean Validation no startup quando a extensão de validação está presente. Um erro de binding derruba a aplicação cedo, com o nome da propriedade — exatamente o que você quer.

| Critério | `@ConfigProperty` | `@ConfigMapping` |
|---|---|---|
| Agrupamento | Uma chave por campo | Um contrato por grupo |
| Tipo e default | Repetidos em cada ponto | Declarados uma vez |
| Validação | Manual ou por campo | No binding, com falha no boot |
| Teste | Precisa de container | Pode ser implementado por um record no teste |
| Descoberta | Espalhada | Centralizada na interface |

Propriedades de build time são resolvidas quando o artefato é gerado: `quarkus.datasource.db-kind`, `quarkus.package.jar.type` e `quarkus.arc.selected-alternatives` não mudam em runtime. Já `quarkus.datasource.jdbc.url`, `quarkus.http.port` e `quarkus.log.level` são lidas na inicialização e podem vir do ambiente. Na dúvida, consulte o ícone de cadeado na referência de configuração.

## Na prática

```java
package com.exemplo.pagamento;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;
import io.smallrye.config.WithName;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;

@ConfigMapping(prefix = "app.pagamento")
public interface PagamentoConfig {

    @WithName("base-url")
    URI baseUrl();

    @WithDefault("2s")
    Duration timeout();

    @WithDefault("3")
    @Min(1)
    @Max(10)
    int tentativas();

    Optional<String> webhookSecret();

    Gateway gateway();

    interface Gateway {
        @WithDefault("10")
        int maxConexoes();
    }
}
```

```properties
# application.properties
app.pagamento.base-url=https://api.pagamentos.example
app.pagamento.timeout=2s
app.pagamento.webhook-secret=${WEBHOOK_SECRET}
app.pagamento.gateway.max-conexoes=20

quarkus.datasource.db-kind=postgresql
quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/app
quarkus.http.port=8080

%dev.app.pagamento.base-url=http://localhost:8081
%dev.quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/app_dev
%test.app.pagamento.timeout=100ms
%prod.quarkus.http.port=8080
```

A interface é injetável como qualquer bean. O serviço abaixo não conhece strings de configuração:

```java
package com.exemplo.pagamento;

import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;

@ApplicationScoped
public class PoliticaDeRetry {

    private final PagamentoConfig config;

    public PoliticaDeRetry(PagamentoConfig config) {
        this.config = config;
    }

    public Duration proximaEspera(int tentativaAtual) {
        var base = config.timeout().dividedBy(2);
        return base.multipliedBy(1L << Math.min(tentativaAtual, 4));
    }

    public boolean podeTentar(int tentativaAtual) {
        return tentativaAtual < config.tentativas();
    }
}
```

Em teste, a interface vira um record e você exercita a regra sem container:

```java
record ConfigFake(URI baseUrl, Duration timeout, int tentativas,
                  Optional<String> webhookSecret, Gateway gateway) implements PagamentoConfig {
    record GatewayFake(int maxConexoes) implements PagamentoConfig.Gateway {}
}

var politica = new PoliticaDeRetry(new ConfigFake(
    URI.create("http://localhost"), Duration.ofSeconds(2), 3,
    Optional.empty(), new ConfigFake.GatewayFake(5)));
```

Para arquivos extras, `quarkus.config.locations=config/extra.properties` adiciona fontes. Para segredos, prefira variável de ambiente ou um cofre; `${WEBHOOK_SECRET}` falha no startup se a variável não existir, o que é melhor do que autenticar com string vazia.

## Armadilhas comuns

- **Segredo versionado.** `application.properties` vai para o jar e para o histórico do Git. Use `${VAR}` ou secret manager e rotacione.
- **Mudar propriedade build-time em runtime.** `quarkus.datasource.db-kind` não tem efeito depois do build; a aplicação pode até subir com o valor antigo.
- **Confiar em `.env` em produção.** Por padrão ele não é lido fora de dev/test; o contêiner precisa receber variáveis de ambiente.
- **Default duplicado.** Um `@WithDefault` na interface e outro no código criam comportamentos diferentes conforme o caminho.
- **`@ConfigProperty` em vez de mapping em código novo.** Perde validação centralizada e espalha conhecimento de chaves.

## Checklist de domínio

- [ ] Você sabe a ordem entre variável de ambiente, `.env` e `application.properties`
- [ ] Você distingue propriedade de build time de runtime antes de prometer hot change
- [ ] Você modela um grupo de configuração com `@ConfigMapping`, `@WithDefault` e constraints
- [ ] Você mantém segredos fora do repositório e da imagem
- [ ] Você testa o comportamento do serviço com uma implementação fake da interface

## Para ir além

- [Quarkus — Configuration Reference](https://quarkus.io/guides/config-reference)
- [Quarkus — Configuring your application](https://quarkus.io/guides/config)
- [SmallRye Config — Config Mappings](https://smallrye.io/docs/smallrye-config/main/config/config-mappings/)
- [Jakarta Bean Validation 3.0](https://jakarta.ee/specifications/bean-validation/3.0/)
