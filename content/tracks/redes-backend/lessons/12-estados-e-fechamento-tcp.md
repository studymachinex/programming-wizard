> **Em uma frase:** o TCP fecha cada sentido da conexão separadamente (FIN, ACK, FIN, ACK); o lado que fecha primeiro espera em TIME_WAIT por 2×MSL (60 s no Linux), e CLOSE_WAIT acumulando num servidor significa que a aplicação recebeu o FIN e nunca chamou `close()`.

## O problema

Numa sexta à noite, a API de pagamentos começa a recusar conexões: `java.net.SocketException: Too many open files`. A CPU está ociosa, a memória está normal, e o `ss -s` mostra milhares de sockets. O diagnóstico decisivo é uma linha:

```bash
ss -H -tan state close-wait | wc -l
4210
```

São 4.210 conexões em **CLOSE_WAIT**: os clientes já fecharam, o kernel já confirmou, e a aplicação **nunca chamou `close()`**, então cada uma segura um descritor de arquivo. O ajuste de `ulimit` só adia a queda. A correção é uma linha de código, mas só é achada por quem sabe ler os estados.

## Como funciona

Uma conexão TCP é **duas pistas independentes**, uma para cada sentido. Fechar uma não fecha a outra, e por isso o fechamento normal usa quatro segmentos.

O lado que chama `close()` primeiro é o **fechamento ativo**; o outro é o **passivo**.

| Estado | Lado | Significado |
|---|---|---|
| ESTABLISHED | ambos | Conexão aberta, dados fluem |
| FIN_WAIT_1 | ativo | Enviou FIN, aguarda o ACK |
| FIN_WAIT_2 | ativo | O FIN foi confirmado; aguarda o FIN do par |
| TIME_WAIT | ativo | Recebeu o FIN do par e confirmou; espera 2×MSL |
| CLOSE_WAIT | passivo | Recebeu o FIN e o kernel confirmou; **aguarda a aplicação fechar** |
| LAST_ACK | passivo | Enviou o próprio FIN; aguarda o ACK final |
| CLOSED | ambos | Sem conexão |

A sequência, com os números da aula anterior (o cliente com `seq=3104581284` depois de enviar 83 bytes, o servidor com `seq=871254771`):

1. Cliente `close()` → **FIN** (`seq=3104581284`). Estado: FIN_WAIT_1. O FIN consome 1 número de sequência.
2. O kernel do servidor responde **ACK** (`ack=3104581285`) **sozinho**. Cliente: FIN_WAIT_2. Servidor: CLOSE_WAIT. Para a aplicação, o fim do fluxo aparece como **EOF**: `read()` devolve -1.
3. A aplicação termina, chama `close()` → **FIN** do servidor (`seq=871254771`). Estado: LAST_ACK.
4. O cliente confirma (`ack=871254772`) e vai a **TIME_WAIT**; o servidor vai a CLOSED.

Quando a aplicação do servidor fecha logo, o ACK do passo 2 e o FIN do passo 3 viajam juntos, e o fechamento leva três segmentos.

### Half-close

Como os sentidos são independentes, um lado pode dizer "não vou enviar mais" e ainda **receber**. Em Java, é o `Socket.shutdownOutput()`: envia o FIN sem fechar o socket. É útil em protocolos de pergunta única: o cliente envia a requisição, fecha o envio e lê a resposta até o EOF, sem precisar de delimitador.

### TIME_WAIT: por que esperar

O lado ativo aguarda **2×MSL** (*maximum segment lifetime*); no Linux o valor é **fixo em 60 s**. Dois motivos:

- O ACK final pode se perder. Se o servidor não o receber, retransmitirá o FIN, e alguém precisa estar lá para confirmar de novo.
- Segmentos atrasados da conexão antiga não podem ser confundidos com os de uma conexão nova na **mesma quádrupla** (IPs e portas).

TIME_WAIT é **saudável**. Ele vira problema apenas em quem abre uma conexão por requisição: cada uma deixa um socket em TIME_WAIT por 60 s, e as portas efêmeras (~28 mil por padrão no Linux, de 32768 a 60999) acabam, assunto do módulo 6. **Quem fecha primeiro paga o TIME_WAIT.** Se o servidor fecha primeiro (um `Connection: close` no HTTP, por exemplo), é ele que acumula.

### CLOSE_WAIT e FIN_WAIT_2

- **CLOSE_WAIT** não expira. Só sai quando a aplicação chama `close()`. Acumulando, **é sempre bug da aplicação**: um `finally` ausente, uma conexão devolvida a um pool que nunca a usa mais, uma tarefa que morreu sem fechar.
- **FIN_WAIT_2** de um socket já fechado pela aplicação (órfão) expira em `tcp_fin_timeout` (60 s). Se o par não envia o FIN, o kernel desiste.

### RST: o fim abrupto

O **RST** derruba a conexão na hora, sem TIME_WAIT. Surge quando chegam dados a um socket que já não existe, quando um SYN chega a uma porta sem processo ouvindo, ou quando a aplicação usa `SO_LINGER` com tempo 0 em `close()`. O outro lado vê `Connection reset by peer` (`ECONNRESET`) e **perde os dados ainda não lidos**.

## Na prática

O programa abaixo mostra o half-close e o uso correto de `close()`. O cliente envia a requisição e chama `shutdownOutput()` (um FIN); o servidor lê **até o EOF**, responde e fecha, tudo com `try-with-resources`, e o cliente lê a resposta até o FIN do servidor.

```java
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class FechamentoTcp {
    public static void main(String[] args) throws Exception {
        try (ServerSocket servidor = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            Thread.ofVirtual().start(() -> atender(servidor));

            try (Socket cliente = new Socket(InetAddress.getLoopbackAddress(), servidor.getLocalPort())) {
                cliente.getOutputStream().write("olá".getBytes(StandardCharsets.UTF_8));
                cliente.shutdownOutput();                            // envia FIN: "não mando mais nada", mas ainda leio
                byte[] resposta = cliente.getInputStream().readAllBytes();   // lê até o FIN do servidor
                System.out.println("cliente leu: " + new String(resposta, StandardCharsets.UTF_8));
            }                                                        // close(): o cliente (quem fechou primeiro) vai a TIME_WAIT
        }
    }

    static void atender(ServerSocket servidor) {
        try (Socket s = servidor.accept()) {                         // try-with-resources: close() em qualquer caminho
            byte[] pedido = s.getInputStream().readAllBytes();       // devolve ao ver o EOF (read() == -1)
            String texto = new String(pedido, StandardCharsets.UTF_8);
            s.getOutputStream().write(("recebi " + pedido.length + " bytes: " + texto).getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
```

A saída é `cliente leu: recebi 4 bytes: olá` (4 bytes: o `á` ocupa 2 em UTF-8). Se o `atender` esquecesse o `try-with-resources` num caminho de erro, o socket ficaria em CLOSE_WAIT.

Os comandos úteis: `ss -tan state close-wait` e `ss -tan state time-wait` (acrescente `-o` para ver o temporizador, como `timer:(timewait,57sec,0)`), `ss -s` para o resumo por estado, e `lsof -p <pid> | grep CLOSE_WAIT` para ver quais conexões a JVM mantém.

## Armadilhas comuns

- **Tratar CLOSE_WAIT como problema de rede ou do kernel.** Nenhum `sysctl` o resolve: é `close()` ausente. Revise `finally`, pools e caminhos de exceção.
- **"Corrigir" TIME_WAIT com `tcp_tw_recycle`.** A opção foi removida no Linux 4.12 porque quebrava clientes atrás de NAT. Para quem **abre** conexões, `tcp_tw_reuse` ajuda; a solução real é reaproveitar conexões (keep-alive, pool).
- **Reiniciar o servidor e receber `Address already in use`.** Sockets em TIME_WAIT na porta podem impedir o `bind` se `SO_REUSEADDR` estiver desligado. No Linux, o `ServerSocket` do Java já o liga por padrão; em outras linguagens, e em outros sistemas, ligue-o antes do `bind` (`setReuseAddress(true)`).
- **Usar `SO_LINGER` 0 para "evitar" TIME_WAIT.** Envia RST e descarta os dados pendentes. Só em casos muito específicos.
- **Ler `-1` e continuar escrevendo.** O EOF diz que o par parou de enviar; terminar o seu trabalho e chamar `close()` é a resposta esperada.
- **Fechar com `close()` sem esvaziar o que o par ainda enviará.** Se chegarem dados a um socket fechado, o kernel responde RST.

## Checklist de domínio

- [ ] Você descreve a sequência FIN, ACK, FIN, ACK e os estados de cada lado
- [ ] Você explica o TIME_WAIT: quem o paga, quanto dura (2×MSL, 60 s no Linux) e os dois motivos de existir
- [ ] Você diagnostica CLOSE_WAIT acumulando e corrige com `close()` em todos os caminhos
- [ ] Você usa `shutdownOutput()` para um half-close e sabe o que o EOF (`read()` igual a -1) significa
- [ ] Você distingue FIN (fechamento ordenado) de RST (abrupto, com perda de dados)
- [ ] Você lê `ss -tan state ...` e sabe quando um estado é normal e quando é sintoma

## Para ir além

- [RFC 9293: Transmission Control Protocol (diagrama de estados, seção 3.3.2)](https://www.rfc-editor.org/rfc/rfc9293)
- [RFC 1122: Requirements for Internet Hosts (TIME_WAIT e fechamento)](https://www.rfc-editor.org/rfc/rfc1122)
- [Javadoc: java.net.Socket](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/Socket.html)
- [Manual do ss(8)](https://man7.org/linux/man-pages/man8/ss.8.html)
