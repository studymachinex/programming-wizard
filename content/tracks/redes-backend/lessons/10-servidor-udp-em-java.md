> **Em uma frase:** um servidor UDP em Java é um laço em volta de `receive()` num único `DatagramChannel`, e a robustez vem do que você acrescenta ao redor: timeout e nova tentativa com backoff no cliente, identificador de requisição e deduplicação no servidor, e uma recepção rápida o bastante para o buffer do kernel nunca encher.

## O problema

O módulo de cobrança expõe um comando UDP simples, `debitar 10`, e o cliente funcionou perfeitamente na máquina do desenvolvedor. Em produção, três coisas aparecem na primeira semana:

1. clientes que **travam** porque a resposta se perdeu e o `receive()` não tem timeout;
2. clientes que, depois de adicionar a nova tentativa, **cobram duas vezes** quando é a resposta que se perde, e não a requisição;
3. picos de tráfego em que **centenas de requisições somem** sem nenhum log, porque o servidor estava ocupado e o buffer do kernel transbordou.

As três falhas vêm da mesma raiz: no UDP, nada do que o TCP faz por você existe, e é preciso decidir cada ponto conscientemente.

## Como funciona

### Um socket, muitos clientes

Em TCP, `ServerSocket.accept()` devolve um socket por conexão. Em UDP **não há `accept()`**: o servidor tem um socket só, e cada `receive()` devolve um datagrama e o endereço do remetente. Para responder, chama-se `send(buffer, remetente)`, o que permite atender milhares de clientes sem nenhum estado por cliente no kernel.

Em Java há duas APIs:

- **`DatagramSocket` / `DatagramPacket`:** a clássica. Tem `setSoTimeout(ms)`, ótima para clientes e servidores simples.
- **`DatagramChannel` (NIO):** usa `ByteBuffer`, permite modo não bloqueante e `Selector`, e é a base para servidores com muitos sockets ou integração com outros canais. Em modo bloqueante, a API do canal não oferece timeout; quando precisar de um, use `DatagramSocket` ou o modo não bloqueante com `Selector.select(timeout)`.

### A regra de ouro do cliente: timeout + retentativa

Sem timeout, uma perda trava a thread para sempre. Com timeout, o cliente reenvia, e a espera cresce a cada tentativa (**backoff exponencial**, aqui 200, 400 e 800 ms) com um pouco de aleatoriedade (*jitter*) para que clientes que falharam juntos não tentem juntos. Há também um **limite de tentativas**, depois do qual o erro é devolvido ao chamador.

### Reenviar exige deduplicar

Se a requisição chegou e a **resposta** se perdeu, o servidor já executou o comando. A nova tentativa o executaria de novo. Duas defesas:

- **Operações idempotentes** (`definir saldo = 90`) toleram repetição.
- **Operações não idempotentes** (`debitar 10`) pedem um identificador por requisição e um cache `(remetente, id) → resposta` no servidor, que reenvia a resposta guardada em vez de executar. O cache precisa de **limite e validade**, senão vira vazamento de memória.

## Na prática

O código abaixo junta tudo num arquivo que compila e roda em Java 21+: servidor com `DatagramChannel` e cache de respostas limitado, cliente com timeout, backoff e jitter. O servidor **descarta de propósito a primeira resposta**, para simular a perda e provar que a operação roda uma vez só.

```java
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.net.SocketAddress;
import java.net.SocketTimeoutException;
import java.nio.ByteBuffer;
import java.nio.channels.ClosedChannelException;
import java.nio.channels.DatagramChannel;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

public class UdpRobusto {
    record Chave(SocketAddress remetente, long id) {}

    static final AtomicInteger execucoes = new AtomicInteger();

    /** Servidor: um canal, um laço. Executa cada (remetente, id) uma só vez e reenvia a resposta guardada nas repetições. */
    static void servidor(DatagramChannel canal, int respostasADescartar) throws IOException {
        Map<Chave, String> respondidas = new LinkedHashMap<>() {
            @Override protected boolean removeEldestEntry(Map.Entry<Chave, String> e) { return size() > 10_000; }
        };
        ByteBuffer buf = ByteBuffer.allocate(1500);
        int descartar = respostasADescartar;
        try {
            while (true) {
                buf.clear();
                SocketAddress de = canal.receive(buf);          // bloqueia; devolve o remetente
                buf.flip();
                String req = StandardCharsets.UTF_8.decode(buf).toString();   // formato "id|comando"
                long id = Long.parseLong(req.substring(0, req.indexOf('|')));

                Chave chave = new Chave(de, id);
                String resposta = respondidas.get(chave);
                if (resposta == null) {                         // primeira vez: executa
                    execucoes.incrementAndGet();
                    resposta = id + "|OK";
                    respondidas.put(chave, resposta);
                }                                               // repetição: só reenvia
                if (descartar > 0) { descartar--; continue; }   // simula a perda da resposta
                canal.send(ByteBuffer.wrap(resposta.getBytes(StandardCharsets.UTF_8)), de);
            }
        } catch (ClosedChannelException fechado) {
            // canal fechado: encerra o servidor
        }
    }

    /** Cliente: timeout, nova tentativa com backoff exponencial e jitter, limite de tentativas. */
    static String chamar(InetSocketAddress destino, long id, String comando) throws IOException {
        byte[] dados = (id + "|" + comando).getBytes(StandardCharsets.UTF_8);
        int espera = 200;
        try (DatagramSocket socket = new DatagramSocket()) {   // porta nova por chamada: respostas velhas não chegam
            for (int tentativa = 1; tentativa <= 3; tentativa++) {
                socket.send(new DatagramPacket(dados, dados.length, destino));
                socket.setSoTimeout(espera + ThreadLocalRandom.current().nextInt(espera / 5 + 1));
                DatagramPacket resposta = new DatagramPacket(new byte[1500], 1500);
                try {
                    socket.receive(resposta);
                    System.out.println("resposta na tentativa " + tentativa);
                    return new String(resposta.getData(), 0, resposta.getLength(), StandardCharsets.UTF_8);
                } catch (SocketTimeoutException semResposta) {
                    espera *= 2;                                // 200 -> 400 -> 800 ms
                }
            }
        }
        throw new SocketTimeoutException("sem resposta após 3 tentativas");
    }

    public static void main(String[] args) throws Exception {
        try (DatagramChannel canal = DatagramChannel.open().bind(new InetSocketAddress("127.0.0.1", 0))) {
            Thread.ofVirtual().start(() -> {
                try { servidor(canal, 1); } catch (IOException e) { e.printStackTrace(); }
            });
            InetSocketAddress destino = (InetSocketAddress) canal.getLocalAddress();
            System.out.println(chamar(destino, 3, "debitar 10"));
            System.out.println("execuções no servidor: " + execucoes.get());
        }
    }
}
```

A execução imprime `resposta na tentativa 2`, `3|OK` e `execuções no servidor: 1`: a primeira resposta foi descartada, o cliente estourou o timeout de ~200 ms, reenviou, e o servidor **respondeu do cache sem executar de novo**. Se o servidor executasse a cada datagrama recebido, sem consultar o cache, o contador mostraria 2.

Dois detalhes do cliente merecem atenção. Abrir um `DatagramSocket` novo por chamada dá uma porta de origem nova, então uma resposta atrasada da chamada anterior chega a uma porta fechada e não contamina a seguinte. E o jitter soma de 0 a 20% à espera, o que espalha as retentativas.

### Receber rápido, processar em outro lugar

O laço de recepção deve fazer o mínimo: ler o datagrama e entregá-lo a uma fila limitada ou a um executor de **threads virtuais** (`Executors.newVirtualThreadPerTaskExecutor()`), que processa e responde. Se o processamento ficar na própria thread de recepção, qualquer requisição lenta atrasa o `receive()` seguinte e o buffer do kernel enche. Para ver o problema, rode `ss -lun` (um `Recv-Q` alto indica datagramas esperando) e `nstat -az UdpRcvbufErrors` (cada incremento é um datagrama descartado por falta de espaço). O tamanho do buffer se ajusta com `setOption(StandardSocketOptions.SO_RCVBUF, n)`, mas o valor efetivo é limitado por `net.core.rmem_max`, então confira com `getOption` depois.

## Armadilhas comuns

- **`receive()` sem timeout no cliente.** Uma perda e a thread fica presa. É o bug UDP mais frequente.
- **Retentativa sem deduplicação.** Duplica pagamentos, e-mails, pedidos. Se não pode deduplicar, a operação precisa ser idempotente.
- **Cache de deduplicação sem limite.** Cresce até derrubar a JVM; limite por tamanho e por tempo.
- **Retentativa imediata e sincronizada.** Sem backoff e jitter, milhares de clientes viram uma tempestade de repetições exatamente quando o servidor está mal.
- **Processar na thread de recepção.** Transforma lentidão em perda silenciosa de datagramas.
- **Confiar no endereço do remetente.** Ele pode ser forjado; não use IP de origem de UDP como autenticação.
- **Buffer de 512 ou 1.024 bytes "por segurança".** Trunca respostas maiores sem erro. Use 1.500 e valide o tamanho recebido.

## Checklist de domínio

- [ ] Você explica por que não há `accept()` em UDP e como o servidor responde a cada cliente
- [ ] Você escreve um cliente com `setSoTimeout`, backoff exponencial e limite de tentativas
- [ ] Você descreve o cenário em que a retentativa duplica uma operação e como a deduplicação o evita
- [ ] Você diferencia `DatagramSocket` de `DatagramChannel` e sabe quando o NIO compensa
- [ ] Você diagnostica descarte por buffer cheio com `ss -lun` e `nstat`
- [ ] Você mantém o laço de recepção leve e delega o trabalho a threads virtuais ou a uma fila limitada

## Para ir além

- [Javadoc: java.nio.channels.DatagramChannel](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/channels/DatagramChannel.html)
- [RFC 8085: UDP Usage Guidelines](https://www.rfc-editor.org/rfc/rfc8085)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [AWS Architecture Blog: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
