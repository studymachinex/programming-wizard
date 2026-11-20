> **Em uma frase:** POST seguro para retry precisa de uma chave única gravada antes do efeito colateral; arquivo grande precisa sair da heap; e stream, depois do primeiro byte, não tem mais status para mudar.

## O problema

O cliente móvel perde a conexão depois de enviar um pagamento. O usuário toca em “tentar de novo”. O servidor processa duas vezes, cobra duas vezes, e o suporte descobre que `synchronized` não resolve porque há três réplicas atrás do balanceador.

Upload tem o problema oposto: um arquivo de 2 GB chega em multipart, o runtime bufferiza, a heap estoura e o processo reinicia. Quando você decide transmitir a resposta, descobre que o erro no meio do stream não pode mais virar `500`: o `200` já foi enviado e o cliente recebe corpo truncado sem saber.

## Como funciona

Idempotência de escrita começa com uma chave enviada no header `Idempotency-Key`, idealmente um UUID por tentativa lógica — não por retry. O servidor grava a chave com escopo (endpoint + tenant), um hash SHA-256 do corpo canônico e o estado do processamento. A restrição única em `(scope, chave)` é o ponto de serialização: duas requisições concorrentes não conseguem inserir a mesma chave. Retry automático só é seguro com operação idempotente; sem a chave, um POST repetido duplica o efeito.

Consultar e depois inserir é check-then-act: as duas requisições veem “não existe” e ambas executam. O correto é inserir primeiro. Se a inserção conflitar, a outra requisição já reivindicou a chave; você lê o registro e decide entre reproduzir a resposta, informar que está em andamento ou rejeitar corpo diferente.

| Estado do registro | Mesma chave, mesmo corpo | Resposta |
|---|---|---|
| `EM_ANDAMENTO` | Sim | `409` ou `425` com `Retry-After` |
| `CONCLUIDO` | Sim | Reproduz status e corpo gravados |
| `CONCLUIDO` | Não | `422` por reutilização indevida da chave |
| `FALHOU` | Sim | Permite novo processamento ou devolve a falha |

Há dois desenhos defensáveis. Reivindicar em transação separada (`QuarkusTransaction.requiringNew()`), executar o trabalho em um serviço `@Transactional` e gravar o resultado em outra transação: encurta o tempo segurando a linha, mas deixa `EM_ANDAMENTO` órfão se o processo morrer — daí TTL e rotina de limpeza. Ou fazer tudo na mesma transação: o segundo request espera o primeiro commitar, mas você segura conexão durante chamadas externas. Para endpoints com efeito externo, prefira o primeiro. O corpo da resposta também não deve ser ilimitado: guarde até 64 KiB ou referencie o recurso criado.

Uploads têm três caminhos. Multipart com `FileUpload` bufferiza em memória ou arquivo temporário e serve para arquivos pequenos. URL pré-assinada manda o cliente direto ao object storage, tira a banda do serviço e é a melhor opção para volumes grandes. Streaming atende dados gerados ou lidos sob demanda e não permite retry simples depois do primeiro byte.

Configure `quarkus.http.limits.max-body-size=50M` e `quarkus.http.body.uploads-directory=/var/tmp/uploads`. O diretório temporário precisa de espaço e limpeza; `delete-uploaded-files-on-end` apaga ao fim da requisição. Para vários campos, agrupe com um DTO anotado `@MultipartForm`; um campo só cabe em `@RestForm`.

## Na prática

O núcleo da deduplicação, com a chave gravada antes do trabalho:

```java
package com.exemplo.pagamento;

import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.PersistenceException;
import java.util.Optional;
import java.util.function.Supplier;

@ApplicationScoped
public class IdempotenciaService {

    private final IdempotenciaRepository repository;

    public IdempotenciaService(IdempotenciaRepository repository) {
        this.repository = repository;
    }

    public RespostaArmazenada executar(String chave, String escopo, String hash,
                                       Supplier<RespostaArmazenada> acao) {
        Optional<RegistroIdempotencia> novo;
        try {
            novo = QuarkusTransaction.requiringNew().call(() -> {
                var registro = new RegistroIdempotencia(chave, escopo, hash);
                repository.persist(registro);
                return Optional.of(registro);
            });
        } catch (PersistenceException conflito) {
            novo = Optional.empty();
        }

        if (novo.isEmpty()) {
            var existente = repository.buscar(escopo, chave).orElseThrow();
            if (!existente.requestHash.equals(hash)) {
                throw new ChaveReutilizadaException(chave);
            }
            if (existente.status == Status.EM_ANDAMENTO) {
                throw new ProcessamentoEmAndamentoException(chave);
            }
            return new RespostaArmazenada(existente.responseStatus, existente.responseBody, true);
        }

        var resposta = acao.get(); // efeito colateral acontece uma única vez
        QuarkusTransaction.requiringNew().run(() -> repository.concluir(novo.get().id, resposta));
        return resposta;
    }
}

record RespostaArmazenada(int status, String body, boolean replay) {}
```

O resource devolve o mesmo status e corpo no replay, com header `Idempotent-Replayed` para o suporte enxergar o que aconteceu. Upload e download em um resource completo:

```java
package com.exemplo.anexo;

import io.smallrye.common.annotation.Blocking;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.util.UUID;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

@Path("/anexos")
public class AnexoResource {

    private final AnexoStorage storage;

    public AnexoResource(AnexoStorage storage) {
        this.storage = storage;
    }

    @POST
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    public Response enviar(@RestForm("arquivo") FileUpload arquivo) throws IOException {
        if (arquivo.size() > 20L * 1024 * 1024) {
            throw new ArquivoGrandeException(arquivo.size());
        }
        var nome = UUID.randomUUID() + extensaoSegura(arquivo.fileName());
        storage.salvar(arquivo.uploadedFile(), nome);
        return Response.created(URI.create("/anexos/" + nome)).build();
    }

    @GET
    @Path("/{nome}")
    @Produces(MediaType.APPLICATION_OCTET_STREAM)
    @Blocking
    public Response baixar(@PathParam("nome") String nome) throws IOException {
        var arquivo = storage.resolver(nome); // valida path traversal
        StreamingOutput corpo = saida -> {
            try (var entrada = Files.newInputStream(arquivo)) {
                entrada.transferTo(saida);
            }
        };
        return Response.ok(corpo)
            .header("Content-Length", Files.size(arquivo))
            .build();
    }
}
```

Para gerar dados em vez de ler arquivo, `Multi<byte[]>` permite backpressure: o runtime pede o próximo chunk conforme o cliente drena. Não use `Multi` com uma lista já carregada na memória — isso é streaming de mentira. Defina `quarkus.http.idle-timeout` para não segurar conexão indefinidamente.

## Armadilhas comuns

- **Check-then-act.** Consultar a chave antes de inserir abre a corrida; a unique constraint é o único ponto confiável.
- **`synchronized` como idempotência.** Funciona em uma JVM; com três réplicas, não serializa nada.
- **Ignorar o hash do corpo.** A mesma chave com payload diferente precisa ser rejeitada, não reproduzida.
- **Guardar resposta gigante.** Limite o corpo armazenado; acima disso, guarde o identificador do recurso.
- **Confiar em `fileName`/`Content-Type` ou limitar só no Quarkus.** Sanitize o nome, valide magic bytes, evite path traversal e replique o limite no proxy.
- **Erro no meio do stream.** O status já foi; registre, feche a conexão e deixe o cliente detectar truncamento por `Content-Length`.

## Checklist de domínio

- [ ] Você exige `Idempotency-Key` em POST com efeito financeiro
- [ ] Você reivindica a chave antes de executar e trata conflito de unique constraint
- [ ] Você armazena e reproduz a resposta, com TTL e limpeza de órfãos
- [ ] Você escolhe multipart, pré-assinada ou streaming pelo tamanho e pelo caso de uso
- [ ] Você configura limites no Quarkus e no proxy e sabe que o stream não muda status após o primeiro byte

## Para ir além

- [Quarkus — Writing REST services: multipart](https://quarkus.io/guides/rest#multipart)
- [Quarkus — Amazon S3 extension](https://quarkus.io/guides/amazon-s3)
- [Quarkus — Using transactions](https://quarkus.io/guides/transaction)
- [Jakarta RESTful Web Services 3.1](https://jakarta.ee/specifications/restful-ws/3.1/)
