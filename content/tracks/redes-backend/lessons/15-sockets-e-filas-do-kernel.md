> **Em uma frase:** cada socket em LISTEN tem duas filas no kernel, a SYN queue (handshakes incompletos) e a accept queue (conexões prontas esperando `accept()`); quando a aplicação demora a aceitar, a accept queue enche, o kernel passa a descartar SYNs, e o cliente vê conexões lentas em degraus de 1, 3 e 7 segundos.

## O problema

Num pico de tráfego, o serviço de checkout começa a ter latências estranhas: a maioria das requisições responde em 40 ms, mas algumas levam **exatamente 1 s**, outras **3 s**, outras **7 s**, e depois param de aparecer, nunca entre elas. A CPU do servidor está a 30%, e o log da aplicação está limpo: as requisições lentas nem chegam a ele.

Os valores redondos são a pista: são os tempos de retransmissão do SYN (1 s, depois 3 s acumulados, depois 7 s). O servidor está **descartando SYNs** porque a fila de conexões pendentes encheu: a aplicação não está chamando `accept()` rápido o bastante. É um problema entre o kernel e a aplicação, invisível para quem só olha o código.

## Como funciona

Quando a aplicação chama `listen()`, o kernel mantém, para aquele socket, duas filas:

1. **SYN queue** (conexões incompletas, estado SYN_RECV): quando chega um SYN, o kernel responde SYN-ACK e guarda a entrada, esperando o terceiro segmento do handshake. Cada entrada vive em torno de um RTT; sem o ACK, o servidor retransmite o SYN-ACK algumas vezes e acaba descartando.
2. **Accept queue** (conexões prontas, ESTABLISHED): o ACK final move a conexão da primeira para a segunda fila. A aplicação a retira com `accept()`, que devolve um `Socket` novo.

Do ponto de vista do cliente, `connect()` retorna com sucesso assim que o handshake termina, **antes** de a aplicação aceitar. Uma conexão pode ficar estabelecida, ter recebido a requisição em buffer e esperar na accept queue sem nenhuma thread da aplicação saber dela.

### O backlog

O tamanho da accept queue é **`min(backlog do listen(), net.core.somaxconn)`**. O `somaxconn` vale **4096 no Linux ≥ 5.4** (antes era 128). O backlog que a aplicação pede varia: `new ServerSocket(8080)` em Java usa **50**; o Tomcat (`acceptCount`) usa 100; o Netty, a configuração `SO_BACKLOG`. Em containers, o `somaxconn` é por *namespace* de rede, e se ajusta com `--sysctl net.core.somaxconn=...` no `docker run`.

No `ss -ltn`, as colunas têm significado especial para sockets em LISTEN:

```text
State   Recv-Q  Send-Q   Local Address:Port
LISTEN  0       50                 *:8080
```

**`Recv-Q` é a quantidade de conexões na accept queue agora; `Send-Q` é o tamanho máximo (o backlog efetivo).** Um `Recv-Q` perto do `Send-Q` é o alarme.

### Fila cheia

Com a accept queue cheia, o Linux **descarta os SYNs novos** e **ignora ACKs finais** de handshakes em andamento (com `tcp_abort_on_overflow=0`, o padrão), sem responder. Os contadores sobem:

```bash
nstat -az TcpExtListenOverflows TcpExtListenDrops
```

O cliente, sem resposta, retransmite o SYN após 1 s, depois mais 2 s (3 s acumulados), mais 4 s (7 s)... Se o último ACK do cliente for ignorado, ele acha que está conectado, envia a requisição e o servidor eventualmente retransmite o SYN-ACK. Com `tcp_abort_on_overflow=1`, o servidor mandaria **RST** (o cliente veria `Connection reset`), o que falha mais rápido, mas é mais agressivo com picos curtos.

### SYN flood e SYN cookies

Um ataque de **SYN flood** envia milhares de SYNs com origem forjada e nunca completa o handshake, enchendo a SYN queue. Com `net.ipv4.tcp_syncookies=1`, se a fila encher, o kernel deixa de guardar estado e codifica a informação no número de sequência do SYN-ACK: só quem responde com o ACK correto vira conexão. É a defesa padrão e vem ligada na maioria das distribuições.

## Na prática

O padrão correto de um servidor é: **o laço de aceitação só aceita e delega**, com backlog explícito. O trecho abaixo mostra o essencial (o programa completo está na próxima aula):

```java
ServerSocket servidor = new ServerSocket();
servidor.bind(new InetSocketAddress(8080), 1024);          // backlog explícito (pedido; o kernel limita a somaxconn)
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

while (true) {
    Socket s = servidor.accept();                          // só aceita...
    executor.submit(() -> atender(s));                     // ...e entrega; nunca atende aqui
}
```

O erro clássico é o contrário: atender dentro do laço (`atender(servidor.accept())`), que trava a aceitação enquanto durar o primeiro cliente lento. A mesma regra vale para quem usa Tomcat, Jetty ou Netty: o pool de threads de requisições esgotado equivale a `accept()` parado.

Como investigar, em ordem:

1. `ss -ltn '( sport = :8080 )'` e comparar `Recv-Q` com `Send-Q`;
2. `nstat -az TcpExtListenOverflows TcpExtListenDrops`: se sobem durante o incidente, a causa é a accept queue;
3. `ss -tan state syn-recv | wc -l` para a SYN queue;
4. `sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog net.ipv4.tcp_syncookies`;
5. thread dump da JVM: quem está parado fora do `accept()`?

Sobre aumentar o backlog: absorve picos curtos, mas **não cria capacidade**. Se o servidor processa menos do que chega, a fila só enche um pouco mais tarde, e quem está no fundo espera mais. Mantenha o backlog moderado, dimensione o servidor e alerte em `Recv-Q` próximo de `Send-Q`.

## Armadilhas comuns

- **Backlog padrão de 50 do `ServerSocket`.** Em picos de abertura de conexões, 50 é pouco. Passe um valor explícito (256 a 1024 costuma bastar) e confira no `ss -ltn`.
- **Aumentar o backlog sem aumentar o `somaxconn`.** O kernel aplica o menor: pedir 4096 com `somaxconn=128` dá 128. (Na versão ≥ 5.4, o padrão do sistema já é 4096.)
- **Atender na thread de aceitação.** Uma conexão lenta bloqueia todas as outras, mesmo com CPU de sobra.
- **Interpretar a lentidão como falha de rede.** Degraus de 1, 3 e 7 s no `connect` e `ListenOverflows` crescente apontam para o servidor.
- **Medir só o tempo da requisição na aplicação.** O tempo na accept queue não aparece nas métricas da aplicação. Meça também no cliente ou no balanceador.
- **Ignorar que `connect()` com sucesso não prova nada sobre a aplicação.** O kernel pode estar aceitando conexões de um processo travado.
- **Esquecer o `somaxconn` no container.** O valor do host não vale lá dentro; defina na criação do container.

## Checklist de domínio

- [ ] Você diferencia a SYN queue da accept queue e diz quando uma conexão passa de uma para a outra
- [ ] Você calcula o tamanho efetivo da accept queue: min(backlog, somaxconn), e sabe o padrão do Java (50)
- [ ] Você lê `Recv-Q` e `Send-Q` de um socket em LISTEN no `ss -ltn`
- [ ] Você reconhece o sintoma de fila cheia: degraus de 1, 3 e 7 s e `ListenOverflows` subindo
- [ ] Você explica SYN flood e o papel dos SYN cookies
- [ ] Você mantém o laço de aceitação só com `accept()` e delega o atendimento a um executor

## Para ir além

- [Manual do listen(2)](https://man7.org/linux/man-pages/man2/listen.2.html)
- [Manual do tcp(7): tcp_abort_on_overflow, tcp_syncookies e tcp_max_syn_backlog](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [RFC 4987: TCP SYN Flooding Attacks and Common Mitigations](https://www.rfc-editor.org/rfc/rfc4987)
- [Javadoc: java.net.ServerSocket](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/ServerSocket.html)
