> **Em uma frase:** um servidor TCP em Java decide quem executa o `read()` de cada conexão: uma thread de plataforma por conexão é simples, mas não escala a dezenas de milhares; threads virtuais (Java 21+) mantêm o código bloqueante e entregam a escala; o `Selector` do NIO dá a máxima densidade ao custo de um código de máquina de estados.

## O problema

Um serviço de notificações mantém uma conexão TCP aberta por cliente. Com 500 clientes, o modelo `new Thread` por conexão funcionou perfeitamente. Com 10.000, a JVM passa a consumir gigabytes de memória só em pilhas, o escalonador do kernel vive trocando de contexto, e a criação de threads falha com `OutOfMemoryError: unable to create native thread`. A CPU está ociosa: quase todas as threads só **esperam** um `read()`.

A escolha do modelo de concorrência, antes um problema de arquitetura que forçava reescrever o servidor com callbacks, hoje tem uma opção intermediária: threads virtuais.

## Como funciona

Um `ServerSocket` bloqueia em `accept()` até uma conexão ficar pronta (aula 15) e devolve um `Socket`. Dali em diante `read()` e `write()` também **bloqueiam**. A pergunta é: **que thread executa isso, para cada conexão?**

**1. Uma thread só.** Atende uma conexão por vez; as demais esperam na accept queue. Serve para ferramentas e testes.

**2. Uma thread de plataforma por conexão** (ou um pool). Cada conexão ganha uma thread do sistema operacional, com um fluxo de código sequencial. Cada thread reserva uma pilha (1 MB por padrão em 64 bits, de memória virtual, comprometida sob demanda) e entra no escalonador do kernel. Funciona bem com centenas ou poucos milhares. Com 10.000, são ~10 GB de pilhas reservadas, e o limite do sistema (`ulimit -u`, `kernel.threads-max`) aparece. Limitar o pool (200 threads, por exemplo) controla a memória, mas reintroduz a fila: 200 clientes lentos bloqueiam os outros.

**3. Threads virtuais** (Java 21+). `Executors.newVirtualThreadPerTaskExecutor()` cria uma thread virtual por tarefa, e o código continua **o mesmo, bloqueante**. Uma thread virtual é gerenciada pela JVM, com pilha minúscula que cresce sob demanda. Quando faz um `read()` que bloqueia, a JVM a **desmonta** do *carrier* (uma thread do SO de um pequeno pool, em geral um por núcleo) e usa o carrier para outra. Milhares de conexões ociosas custam pouca memória e poucas threads do SO.

**4. NIO com `Selector`.** Canais ficam em modo **não bloqueante** e se registram num `Selector`; uma thread chama `select()` (por baixo, `epoll` no Linux), que devolve só os canais **prontos**. É a base do Netty. Maior densidade e controle, mas o código vira **máquina de estados**: cada conexão guarda o que já leu e o que falta escrever, e nada pode esperar no meio de um método.

| Modelo | Threads do SO | Código | Quando |
|---|---|---|---|
| Uma thread | 1 | simples | ferramentas |
| Pool de threads | tamanho do pool | simples | carga moderada, limite explícito |
| Thread virtual por conexão | ≈ núcleos | simples | I/O bloqueante em escala |
| Selector (Netty) | poucas | complexo | protocolo próprio, densidade máxima |

## Na prática

O servidor abaixo, com threads virtuais, é um eco completo e testável. Tem o laço que só aceita e delega, `setSoTimeout` por conexão, `close()` garantido e encerramento ordenado.

```java
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ServidorVirtual {
    private final ServerSocket servidor;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    ServidorVirtual(int porta, int backlog) throws IOException {
        servidor = new ServerSocket();
        servidor.bind(new InetSocketAddress("127.0.0.1", porta), backlog);   // backlog explícito, em vez dos 50 do padrão
    }

    int porta() { return servidor.getLocalPort(); }

    /** O laço de aceitação só aceita e delega: nunca atende na própria thread. */
    void servir() {
        try {
            while (true) {
                Socket s = servidor.accept();
                executor.submit(() -> atender(s));
            }
        } catch (SocketException fechado) {
            // ServerSocket fechado: encerra o laço
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void atender(Socket s) {
        try (s) {                                                    // close() garantido: sem CLOSE_WAIT esquecido
            s.setSoTimeout(5_000);                                   // cliente mudo não segura a conexão para sempre
            InputStream in = s.getInputStream();
            OutputStream out = s.getOutputStream();
            byte[] buf = new byte[1024];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);   // eco; -1 é o EOF (FIN do cliente)
        } catch (SocketTimeoutException lento) {
            // fechou por inatividade
        } catch (IOException e) {
            // conexão resetada ou quebrada
        }
    }

    /** Encerramento ordenado: para de aceitar e espera as conexões em andamento. */
    void encerrar() throws IOException {
        servidor.close();
        executor.close();                                            // Java 19+: espera as tarefas terminarem
    }

    public static void main(String[] args) throws Exception {
        ServidorVirtual s = new ServidorVirtual(0, 1024);
        Thread aceitador = Thread.ofPlatform().start(s::servir);

        try (Socket c = new Socket("127.0.0.1", s.porta())) {
            c.getOutputStream().write("oi".getBytes());
            c.shutdownOutput();
            System.out.println("eco: " + new String(c.getInputStream().readAllBytes()));
        }
        s.encerrar();
        aceitador.join();
        System.out.println("servidor encerrado");
    }
}
```

A saída é `eco: oi` e `servidor encerrado`. Para o mesmo eco com `Selector`, o essencial é o laço de `select()`: um único thread, canais não bloqueantes e o buffer **anexado à chave** como estado da conexão:

```java
Selector seletor = Selector.open();
ServerSocketChannel canal = ServerSocketChannel.open();
canal.bind(new InetSocketAddress("127.0.0.1", 0));
canal.configureBlocking(false);                              // nada bloqueia: só o select()
canal.register(seletor, SelectionKey.OP_ACCEPT);

while (true) {
    seletor.select(2_000);                                   // dorme até algum canal ficar pronto
    Iterator<SelectionKey> it = seletor.selectedKeys().iterator();
    while (it.hasNext()) {
        SelectionKey k = it.next();
        it.remove();
        if (k.isAcceptable()) {
            SocketChannel s = canal.accept();
            s.configureBlocking(false);
            s.register(seletor, SelectionKey.OP_READ, ByteBuffer.allocate(1024));   // anexo = estado da conexão
        } else if (k.isReadable()) {
            SocketChannel s = (SocketChannel) k.channel();
            ByteBuffer buf = (ByteBuffer) k.attachment();
            int n = s.read(buf);                             // não bloqueia: devolve o que houver
            if (n == -1) { s.close(); continue; }
            buf.flip();
            while (buf.hasRemaining()) s.write(buf);         // simplificado: em produção, trate escrita parcial com OP_WRITE
            buf.clear();
        }
    }
}
```

(Importe `java.nio.*`, `java.nio.channels.*` e `java.util.Iterator`.) Repare em tudo o que o `Selector` exige: remover a chave processada, tratar escrita parcial com `OP_WRITE` (aqui simplificado) e guardar estado por conexão. Esse é o preço da densidade.

Para conferir o modelo em execução: `ps -o nlwp= -p <pid>` conta as threads do SO do processo (milhares no modelo 2; dezenas nos modelos 3 e 4) e `jcmd <pid> Thread.dump_to_file -format=json arquivo.json` lista threads, inclusive virtuais.

## Armadilhas comuns

- **`Socket` aceito sem `setSoTimeout`.** Um cliente que conecta e não envia nada (*slowloris*) segura descritor, memória e tarefa para sempre, até com threads virtuais.
- **Colocar threads virtuais em pool.** Elas são baratas para criar: uma por tarefa. Para limitar a concorrência em algo escasso (um banco com 20 conexões), use um `Semaphore`.
- **Pinning por `synchronized`.** Em JDK 21 a 23, bloquear dentro de `synchronized` fixa a thread virtual ao carrier; muitas fixações esgotam os poucos carriers. O JDK 24 (JEP 491) removeu essa limitação; no JDK 21, prefira `ReentrantLock`.
- **Atender na thread de aceitação.** Trava a accept queue (aula 15) por causa do primeiro cliente lento.
- **Esquecer o EOF.** `read()` igual a -1 significa que o par fechou o envio; ignorar isso e continuar lendo gera loop ocupado ou CLOSE_WAIT.
- **Encerrar com `System.exit` ou kill.** Derruba conexões em andamento. Feche o `ServerSocket`, espere o executor e só então saia; em containers, o tempo entre SIGTERM e SIGKILL precisa cobrir a requisição mais longa.
- **Escolher o `Selector` "por desempenho" sem medir.** Para a maioria dos serviços, threads virtuais já resolvem; o NIO puro compensa em casos de protocolo próprio ou densidade extrema.

## Checklist de domínio

- [ ] Você descreve os quatro modelos (serial, thread por conexão, thread virtual, Selector) e o custo de cada um
- [ ] Você explica como uma thread virtual libera o carrier num `read()` bloqueante
- [ ] Você escreve um servidor com `accept()` + `newVirtualThreadPerTaskExecutor()`, `setSoTimeout` e `try-with-resources`
- [ ] Você descreve o laço do `Selector` e por que cada conexão precisa de estado próprio
- [ ] Você conhece os limites das threads virtuais: pinning, Semaphore para recursos escassos, sem pool
- [ ] Você implementa encerramento ordenado: fechar o `ServerSocket` e esperar o executor

## Para ir além

- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
- [Javadoc: java.nio.channels.Selector](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/channels/Selector.html)
- [Netty: user guide](https://netty.io/wiki/user-guide-for-4.x.html)
