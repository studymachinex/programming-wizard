> **Em uma frase:** o algoritmo de Nagle segura segmentos pequenos enquanto houver dado não confirmado, e o ACK atrasado do receptor espera um pouco antes de confirmar; quando os dois se encontram num padrão write-write-read, cada um espera o outro e aparece uma pausa de cerca de 40 ms que a cura `TCP_NODELAY` (ou juntar as escritas) elimina.

## O problema

Um cliente escreve uma requisição em duas partes: primeiro o cabeçalho, depois o corpo, e então fica lendo a resposta. O servidor responde em 2 ms. Mas as métricas do cliente mostram **40 ms por chamada**, sempre, e o tempo some em todas as chamadas, não só nas lentas. A CPU está ociosa dos dois lados, a rede tem RTT de 0,5 ms e nenhum pacote se perde. Os 40 ms são um número redondo demais para ser coincidência.

A causa são dois mecanismos de eficiência do TCP, cada um razoável sozinho, que **se esperam mutuamente** quando o aplicativo escreve em duas etapas.

## Como funciona

### Nagle: não mande tinygrams

Em 1984, o RFC 896 descreveu o problema dos **tinygrams**: um terminal que manda 1 byte por tecla gera pacotes de 41 bytes (40 de cabeçalho) e enche a rede de overhead. O algoritmo de **Nagle** é simples: **se há dados enviados e ainda não confirmados, segura qualquer segmento menor que o MSS** até chegar o ACK (ou até juntar um segmento cheio). Com a conexão ociosa, o primeiro pedaço sai na hora; o seguinte espera o ACK do primeiro.

### Delayed ACK: pegue carona

O receptor tem a política oposta: não confirmar cada segmento na hora. Ele **atrasa o ACK** na esperança de que a aplicação gere uma resposta e o ACK vá **de carona** nela, ou de que chegue um segundo segmento para confirmar os dois com um ACK só (a regra comum é confirmar a cada dois segmentos cheios). O atraso máximo é de **200 ms** pela especificação; no Linux o **mínimo** é **40 ms** (`TCP_DELACK_MIN`), e o Windows usa 200 ms por padrão.

### Quando os dois se encontram

Considere o padrão **write-write-read**:

1. o cliente escreve o cabeçalho (50 bytes). Não há dado pendente, e ele sai imediatamente;
2. o cliente escreve o corpo (200 bytes). Há dado **não confirmado** (os 50 bytes) e o corpo é menor que o MSS: o Nagle **segura**;
3. o servidor recebeu os 50 bytes, mas a requisição está incompleta: ele ainda não tem o que responder, então o ACK **espera** a carona do delayed ACK;
4. depois de cerca de 40 ms, o timer do servidor dispara e o ACK sai; o cliente solta o corpo; o servidor responde.

Cada lado espera pelo outro. A pausa é igual ao atraso do ACK, e **não depende da rede**: o RTT pode ser de microssegundos. A pista está nos números: 40 ms no Linux, perto de 200 ms no Windows. No `ss -ti` o campo `ato:40` mostra o timeout do ACK atrasado da conexão.

## Na prática

A cura padrão é desligar o Nagle com `TCP_NODELAY`. Em Java:

```java
import java.io.*;
import java.net.*;

public class NagleDemo {
    public static void main(String[] args) throws Exception {
        try (ServerSocket srv = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            Thread.ofVirtual().start(() -> {
                try {
                    while (true) {
                        Socket s = srv.accept();
                        Thread.ofVirtual().start(() -> atender(s));
                    }
                } catch (IOException e) { /* servidor encerrado */ }
            });
            for (boolean nodelay : new boolean[] {false, true}) {
                long melhor = Long.MAX_VALUE;
                for (int i = 0; i < 5; i++) melhor = Math.min(melhor, rodada(srv.getLocalPort(), nodelay));
                System.out.printf("TCP_NODELAY=%-5b  melhor de 5 rodadas: %.1f ms%n", nodelay, melhor / 1e6);
            }
        }
    }

    // Servidor: lê 10 bytes (cabeçalho 4 + corpo 6) e responde 2 bytes.
    static void atender(Socket s) {
        try (s) {
            DataInputStream in = new DataInputStream(s.getInputStream());
            while (true) {
                in.readFully(new byte[10]);
                s.getOutputStream().write(new byte[] {'o', 'k'});
            }
        } catch (IOException e) { /* cliente fechou */ }
    }

    // Cliente: write (cabeçalho), write (corpo), read (resposta): o padrão write-write-read.
    static long rodada(int porta, boolean nodelay) throws IOException {
        try (Socket c = new Socket(InetAddress.getLoopbackAddress(), porta)) {
            c.setTcpNoDelay(nodelay);
            OutputStream out = c.getOutputStream();
            InputStream in = c.getInputStream();
            out.write(new byte[10]); in.readNBytes(2);   // aquece: agora há dado a confirmar
            long t0 = System.nanoTime();
            out.write(new byte[4]);   // escrita 1
            out.write(new byte[6]);   // escrita 2
            in.readNBytes(2);         // leitura
            return System.nanoTime() - t0;
        }
    }
}
```

O programa compila e roda em qualquer JDK recente. **O efeito depende do sistema e do caminho**: na loopback do Windows em que o testei, as duas variações responderam em menos de 1 ms, então a pausa **não apareceu**; no Linux, entre duas máquinas, é onde ela costuma aparecer. Use o programa como esqueleto para medir o seu ambiente, não como prova.

Há duas curas, e a segunda é a melhor:

1. **`setTcpNoDelay(true)`**: o segmento pequeno sai na hora. Resolve a pausa, mas deixa os dois `write` virarem dois pacotes.
2. **Juntar as escritas**: monte a mensagem inteira num buffer (`BufferedOutputStream` com um único `flush()`, ou um `ByteBuffer`) e faça **uma** escrita. Sai um pacote só, sem esperar ACK e sem desperdiçar cabeçalhos.

No lado do receptor existe o `TCP_QUICKACK` do Linux, que manda ACKs imediatos, mas **não é permanente**: o kernel pode voltar ao modo atrasado, então teria de ser reativado depois de cada leitura. É remendo, não projeto. Muitas bibliotecas de cliente já ligam `TCP_NODELAY` por conta própria, mas não assuma: confira a documentação da que você usa e, em código com `Socket` puro, ligue explicitamente. Para ver o fenômeno na captura, `tcpdump` mostra o segundo segmento saindo cerca de 40 ms depois do ACK do primeiro (aula 28).

## Armadilhas comuns

- **Atribuir os 40 ms ao servidor ou à rede.** Se o tempo é constante e redondo, desconfie de timer de ACK.
- **Escrever uma mensagem em vários `write` pequenos.** Cabeçalho num, corpo noutro, delimitador noutro: é o padrão que dispara a pausa.
- **Ligar `TCP_NODELAY` e continuar com escritas minúsculas.** Cada uma vira um pacote de ~40 bytes de overhead. Junte antes de enviar.
- **Achar que `TCP_NODELAY` torna tudo mais rápido.** Ele remove uma espera; não acelera transferências grandes.
- **Depender do `TCP_QUICKACK` como solução definitiva.** O efeito não é permanente.
- **Testar só na loopback.** O padrão pode não aparecer lá e surgir em produção.

## Checklist de domínio

- [ ] Você explica a regra do Nagle (RFC 896) e por que ela existe
- [ ] Você explica o delayed ACK e os valores: mínimo de 40 ms no Linux, 200 ms no Windows
- [ ] Você reconhece o padrão write-write-read e por que os dois mecanismos se esperam
- [ ] Você distingue as curas: `TCP_NODELAY`, juntar as escritas e `TCP_QUICKACK`
- [ ] Você liga `setTcpNoDelay(true)` e agrupa as escritas em Java
- [ ] Você identifica a assinatura: um tempo constante de 40 ms (ou 200 ms) em cada chamada

## Para ir além

- [RFC 896: Congestion Control in IP/TCP Internetworks (Nagle)](https://www.rfc-editor.org/rfc/rfc896)
- [RFC 1122: Requirements for Internet Hosts, seção sobre delayed ACK](https://www.rfc-editor.org/rfc/rfc1122)
- [Manual do tcp(7): TCP_NODELAY e TCP_QUICKACK](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [Javadoc: Socket.setTcpNoDelay](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/Socket.html)
