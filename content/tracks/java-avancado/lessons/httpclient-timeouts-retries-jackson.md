> **Em uma frase:** uma integração HTTP saudável tem três timeouts, retries só para operações idempotentes e um `ObjectMapper` configurado com o mesmo cuidado que você daria a uma conexão de banco.

## O problema

O serviço chama um parceiro sem request timeout. Um dia o parceiro aceita a conexão e para de responder; as threads ficam presas, a fila cresce e o serviço cai. Em outro incidente, um retry ingênuo transforma uma falha de 2 segundos em tempestade: todos os clientes tentam de novo no mesmo instante.

Na serialização, um `ObjectMapper` novo por requisição custa caro, `FAIL_ON_UNKNOWN_PROPERTIES` quebra o deploy quando o parceiro adiciona um campo, e default typing com tipos do cliente é superfície de ataque.

## Como funciona

O `HttpClient` separa dois relógios. O **connect timeout**, definido no builder, limita o handshake TCP (e TLS). O **request timeout**, definido em cada `HttpRequest`, limita a troca inteira depois que a requisição é enviada. Não existe request timeout padrão: sem ele, uma conexão estabelecida pode esperar indefinidamente. Use 1 s para conectar, 2 s para a resposta e 5 s de orçamento total.

Reutilize um `HttpClient`: ele mantém o pool e suporta HTTP/2. Criar um cliente por chamada descarta conexões, perde multiplexação e aumenta latência. Para respostas grandes, `ofInputStream()` permite streaming, mas feche o stream; `ofString` e `ofByteArray` materializam tudo e podem estourar o heap.

```java
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.ThreadLocalRandom;

public class ClienteResiliente {
    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(1))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public static String get(String url, Duration orcamento)
            throws IOException, InterruptedException {
        long deadline = System.nanoTime() + orcamento.toNanos();
        IOException ultima = null;

        for (int tentativa = 1; tentativa <= 3; tentativa++) {
            long restante = deadline - System.nanoTime();
            if (restante <= 0) break;

            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofNanos(Math.min(restante,
                            Duration.ofSeconds(2).toNanos())))
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            long espera = Math.min(1_000L << (tentativa - 1), 4_000L);
            try {
                HttpResponse<String> response = CLIENT.send(
                        request, HttpResponse.BodyHandlers.ofString());
                int status = response.statusCode();
                if (status >= 200 && status < 300) return response.body();

                boolean retentavel = status == 408 || status == 429
                        || (status >= 500 && status != 501);
                if (!retentavel) {
                    ultima = new IOException("HTTP " + status + " não retentável");
                    break;
                }
                String retryAfter = response.headers()
                        .firstValue("Retry-After").orElse(null);
                if (retryAfter != null) {
                    try {
                        espera = Math.min(4_000L, Long.parseLong(retryAfter) * 1_000L);
                    } catch (NumberFormatException ignored) {
                        // formato de data: usa o backoff padrão
                    }
                }
                ultima = new IOException("HTTP " + status);
            } catch (IOException e) {
                ultima = e;
            }

            long jitter = ThreadLocalRandom.current().nextLong(espera / 2 + 1);
            long restanteMs = Math.max(0, (deadline - System.nanoTime()) / 1_000_000);
            long dormir = Math.min(espera / 2 + jitter, restanteMs);
            if (dormir > 0) Thread.sleep(dormir);
        }

        throw ultima != null ? ultima : new IOException("orçamento esgotado");
    }
}
```

O backoff é exponencial com **equal jitter**: a espera base dobra a cada tentativa, mas metade é aleatória. Sem jitter, clientes que falharam juntos voltam juntos. O orçamento total limita a soma das tentativas; três timeouts de 2 s mais esperas já estouram o SLA.

Retry só faz sentido para operações idempotentes (`GET`, `PUT`, `DELETE`, `HEAD`) ou com chave de idempotência no `POST`. Um timeout de leitura não garante que o servidor não processou a requisição: repetir um `POST` de pagamento pode cobrar duas vezes. Não repita 400, 401, 403 ou 404; 408, 429 e 5xx (exceto 501) são candidatos.

## Na prática

Jackson é rápido, mas não é mágico. Um `ObjectMapper` é thread-safe depois de configurado; crie um por processo e injete. `readValue` com `Map<String, Object>` perde tipos e validação; prefira `record`s ou DTOs explícitos. `FAIL_ON_UNKNOWN_PROPERTIES` deve ser desligado só quando você aceita evolução do contrato — e valide os campos obrigatórios.

Para payloads grandes, o streaming evita carregar a árvore inteira:

```java
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class LeitorJsonStreaming {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build();
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create("https://example.com/pedidos.json"))
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();

        HttpResponse<InputStream> response = client.send(
                request, HttpResponse.BodyHandlers.ofInputStream());

        long total = 0;
        try (InputStream in = response.body();
             JsonParser parser = new JsonFactory().createParser(in)) {

            if (response.statusCode() != 200) {
                throw new IOException("HTTP " + response.statusCode());
            }
            if (parser.nextToken() != JsonToken.START_ARRAY) {
                throw new IOException("esperava um array");
            }

            while (parser.nextToken() != JsonToken.END_ARRAY) {
                long valor = 0;
                while (parser.nextToken() != JsonToken.END_OBJECT) {
                    String campo = parser.currentName();
                    parser.nextToken();
                    if ("valor".equals(campo)) {
                        valor = parser.getLongValue();
                    } else {
                        parser.skipChildren();
                    }
                }
                total += valor;
            }
        }
        System.out.println("total=" + total);
    }
}
```

Valide o `Content-Type`, limite o tamanho da resposta e nunca habilite default typing global. Se precisar de polimorfismo, use `@JsonTypeInfo` com allowlist de subtipos e um `PolymorphicTypeValidator`, jamais o nome de classe do cliente. Datas merecem `JavaTimeModule` e formato explícito; não confie no timezone da máquina.

## Armadilhas comuns

- **Sem request timeout.** O connect timeout não cobre a espera pela resposta. Configure os dois e um orçamento total.
- **`HttpClient` por requisição.** Cada instância tem seu pool; você perde conexões quentes e multiplica threads.
- **Retry em `POST` sem idempotência.** Um timeout não prova que o servidor não processou. Use chave de idempotência ou não repita.
- **Backoff sem jitter.** Clientes sincronizados criam picos periódicos e derrubam o parceiro de novo.
- **Retry em 4xx.** 400 e 401 não melhoram com repetição; só gastam orçamento.
- **`ObjectMapper` reconfigurado em runtime.** A thread-safety vale para uso, não para mutação concorrente das configurações.

## Checklist de domínio

- [ ] Você diferencia connect timeout, request timeout e orçamento total
- [ ] Você implementa backoff exponencial com jitter e limite de tentativas
- [ ] Você decide retry por método HTTP e por status
- [ ] Você reutiliza `HttpClient` e `ObjectMapper` corretamente
- [ ] Você processa JSON grande em streaming e evita default typing

## Para ir além

- [Oracle — HttpClient](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html)
- [Oracle — HttpRequest](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpRequest.html)
- [Baeldung — Java 9 HttpClient](https://www.baeldung.com/java-9-http-client)
- [Jackson — documentação](https://github.com/FasterXML/jackson-docs)
