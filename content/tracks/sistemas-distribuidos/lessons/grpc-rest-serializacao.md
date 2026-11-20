> **Em uma frase:** gRPC e REST não diferem por moda: diferem no que viaja no fio, em quem balanceia a carga e em como o contrato evolui — e cada diferença cobra em produção.

## O problema

Um serviço interno faz 20 mil chamadas por segundo para outro. O payload JSON tem 1,8 KB e o p99 de 45 ms inclui 8 ms só de parse. O time migra para gRPC, o payload cai para 600 B e o p99 para 28 ms. Na semana seguinte, o autoscaling para de funcionar: todas as chamadas de cada cliente vão para o mesmo pod, porque o balanceador L4 abriu uma conexão HTTP/2 e não enxerga requisições dentro dela.

Trocar o formato não é trocar a arquitetura: Protobuf resolve bytes, não deadline, descoberta, balanceamento ou contrato quebrado.

## Como funciona

### O fio

JSON é texto com nomes de campo repetidos em cada mensagem. Protobuf é binário: cada campo tem número (tag), tipo e tamanho; o nome existe apenas no schema. Em um pedido de 12 campos, 1,8 KB de JSON viram cerca de 600 B de Protobuf. O parse também é mais barato, porque não há análise de texto nem alocação de strings para cada chave. Com gzip, a diferença de tamanho encolhe; a de CPU permanece.

### HTTP/2 e balanceamento

gRPC usa HTTP/2: várias requisições multiplexadas na mesma conexão, headers comprimidos e streaming bidirecional. Isso reduz latência, mas cria a armadilha do problema: um balanceador L4 vê uma conexão TCP e a fixa em um pod. Com 10 clientes e 10 pods, a distribuição pode ficar 10:1. As saídas são L7 (Envoy, linkerd) ou client-side com `round_robin` sobre endereços descobertos via DNS headless ou xDS.

```java
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

public class ClientePedidos implements AutoCloseable {
    private final ManagedChannel canal;
    private final PedidoServiceGrpc.PedidoServiceBlockingStub stub;

    public ClientePedidos(String alvo) { // ex.: dns:///pedidos:50051
        this.canal = ManagedChannelBuilder.forTarget(alvo)
                // L4 não distribui requisições; round_robin distribui por conexão.
                .defaultLoadBalancingPolicy("round_robin")
                .keepAliveTime(30, TimeUnit.SECONDS)
                .maxInboundMessageSize(2 * 1024 * 1024)
                .usePlaintext()
                .build();
        this.stub = PedidoServiceGrpc.newBlockingStub(canal);
    }

    PedidoResponse buscar(String id, Duration orcamento) {
        try {
            // O deadline viaja como grpc-timeout; o servidor deve cancelar ao expirar.
            return stub.withDeadlineAfter(orcamento.toMillis(), TimeUnit.MILLISECONDS)
                    .buscarPedido(PedidoRequest.newBuilder().setId(id).build());
        } catch (StatusRuntimeException e) {
            Status.Code code = e.getStatus().getCode();
            if (code == Status.Code.UNAVAILABLE || code == Status.Code.DEADLINE_EXCEEDED) {
                throw new FalhaTransienteException("retry com backoff", e);
            }
            throw e; // INVALID_ARGUMENT e NOT_FOUND não se repetem
        }
    }

    @Override
    public void close() throws InterruptedException {
        canal.shutdown();
        if (!canal.awaitTermination(5, TimeUnit.SECONDS)) {
            canal.shutdownNow();
        }
    }
}
```

### Semântica e schema

REST modela recursos, usa verbos HTTP e permite cache por URL — um GET atrás de CDN escala sem tocar no backend. gRPC modela métodos e devolve status ricos (`NOT_FOUND`, `RESOURCE_EXHAUSTED`, `DEADLINE_EXCEEDED`), mas não é nativo do navegador: exige grpc-web e um proxy. Para API pública, REST costuma ganhar; para comunicação interna de baixa latência e streaming, gRPC.

A evolução do Protobuf é por números, não por nomes:

```proto
message Pedido {
  reserved 4, 7;              // tags aposentadas: nunca reutilize
  reserved "cpf_antigo";
  string id = 1;
  int64 total_centavos = 2;
  optional string cupom = 3;  // presença explícita
}
```

Remover campo sem `reserved` é um acidente esperando acontecer: alguém reusa a tag e consumidores antigos decodificam bytes errados.

## Na prática

Use gRPC quando latência, volume ou streaming justificam o custo; REST quando o consumidor é navegador, parceiro ou cache HTTP. Muitas empresas fazem os dois: gRPC entre serviços, REST no edge.

O deadline é parte do contrato. Com jornada de 800 ms e três saltos, cada salto recebe o tempo restante, não 800 ms fixos. Servidor que ignora o prazo continua trabalhando após o cliente desistir; sob carga, isso amplifica CPU.

```java
import com.google.protobuf.DescriptorProtos.DescriptorProto;
import com.google.protobuf.DescriptorProtos.FieldDescriptorProto;
import com.google.protobuf.DescriptorProtos.FileDescriptorSet;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

final class CompatibilidadeProto {
    // Roda no CI: falha se uma tag mudou de tipo ou foi removida sem reserved.
    static void validar(Path antes, Path depois) throws IOException {
        FileDescriptorSet velho = FileDescriptorSet.parseFrom(Files.readAllBytes(antes));
        FileDescriptorSet novo = FileDescriptorSet.parseFrom(Files.readAllBytes(depois));

        for (DescriptorProto msgNovo : novo.getFile(0).getMessageTypeList()) {
            DescriptorProto msgVelho = velho.getFile(0).getMessageTypeList().stream()
                    .filter(m -> m.getName().equals(msgNovo.getName()))
                    .findFirst().orElse(null);
            if (msgVelho == null) continue;

            Map<Integer, FieldDescriptorProto> porNumero = new HashMap<>();
            msgVelho.getFieldList().forEach(f -> porNumero.put(f.getNumber(), f));

            for (FieldDescriptorProto f : msgNovo.getFieldList()) {
                FieldDescriptorProto antigo = porNumero.remove(f.getNumber());
                if (antigo != null && antigo.getType() != f.getType()) {
                    throw new IllegalStateException(
                            "tag " + f.getNumber() + " mudou de tipo em " + msgNovo.getName());
                }
            }
            for (int removida : porNumero.keySet()) {
                boolean reservada = msgNovo.getReservedRangeList().stream()
                        .anyMatch(r -> removida >= r.getStart() && removida < r.getEnd());
                if (!reservada) {
                    throw new IllegalStateException(
                            "tag " + removida + " removida sem reserved em " + msgNovo.getName());
                }
            }
        }
    }
}
```

## Armadilhas comuns

- **Reutilizar field number.** Consumidores antigos leem o novo campo como o antigo. Use `reserved` e um verificador no CI.
- **gRPC atrás de L4 sem client-side LB.** A carga fica presa em um pod; meça requisições por instância, não só CPU média.
- **Deadline que não atravessa thread pool.** O cliente desiste, o servidor segue processando. Propague o `Context` e cancele o trabalho.
- **Mensagem maior que o limite.** O padrão de 4 MiB devolve `RESOURCE_EXHAUSTED`; acima disso, use streaming ou paginação.
- **Retry no proxy e no cliente.** Duas camadas multiplicam tentativas; defina um único dono do retry.

## Checklist de domínio

- [ ] Você estima payload e CPU de JSON versus Protobuf para um contrato real
- [ ] Você explica por que gRPC exige L7 ou client-side load balancing
- [ ] Você evolui um schema sem reutilizar tags e sem quebrar consumidores
- [ ] Você propaga deadline entre saltos e cancela trabalho expirado
- [ ] Você escolhe REST ou gRPC pelo consumidor e pelo caso de uso

## Para ir além

- [gRPC Core Concepts](https://grpc.io/docs/what-is-grpc/core-concepts/) — unary, streaming e o modelo de status.
- [Deadlines](https://grpc.io/docs/guides/deadlines/) — como o prazo viaja e o que o servidor deve fazer.
- [Performance Best Practices](https://grpc.io/docs/guides/performance/) — conexões, streaming e limites de mensagem.
