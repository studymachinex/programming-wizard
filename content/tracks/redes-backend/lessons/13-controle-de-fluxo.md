> **Em uma frase:** no controle de fluxo, cada ACK anuncia a janela de recepção (rwnd), o espaço livre no buffer do receptor; o remetente nunca deixa em trânsito mais do que isso, para ao receber janela zero e retoma quando o receptor avisa (ou a sonda descobre) que a janela reabriu.

## O problema

Um serviço de ingestão recebe eventos por TCP e os grava num banco. Num pico, o banco fica lento e a aplicação passa a ler do socket mais devagar do que os produtores escrevem. Nada dá erro: sem exceções, sem quedas de conexão, sem uso de CPU. Os produtores só... param. As threads deles ficam bloqueadas em `write()` e as filas internas crescem.

A causa é o **controle de fluxo** funcionando como projetado: o buffer de recepção do ingestor encheu, ele anunciou **janela zero**, e o TCP dos produtores parou de enviar. Reconhecer esse sintoma, e saber que a cura está na aplicação que parou de ler, economiza horas procurando um problema de rede que não existe.

## Como funciona

Cada segmento enviado por um lado carrega o campo **janela** (*receive window*, rwnd): quantos bytes o receptor ainda pode armazenar no buffer. O remetente respeita uma regra simples: o total de bytes **enviados e ainda não confirmados** nunca pode passar da janela anunciada.

Com o buffer de recepção de 16 KB, como na cena:

1. O remetente envia 8 KB. A aplicação ainda não leu nada, então o ACK anuncia `win=8192`.
2. O remetente envia mais 8 KB (é o que a janela permite). O buffer enche; o ACK anuncia `win=0`.
3. O remetente **para**. A conexão está ESTABLISHED, sem erro e sem tráfego.
4. A aplicação lê 8 KB; o kernel envia uma **atualização de janela** (`win=8192`), e o fluxo recomeça.

A janela é **deslizante**: a borda esquerda avança conforme os ACKs chegam; a borda direita, conforme o receptor libera espaço. No Linux, quando o buffer enche, o kernel pode primeiro *reduzir* o que anuncia ao longo do tempo, em vez de saltar para zero.

### Sonda de janela zero

O aviso de que a janela reabriu é um segmento que pode se perder. Se isso acontecesse, os dois lados esperariam para sempre: o remetente, por permissão; o receptor, por dados. A solução é o **temporizador de persistência**: com janela zero e dados na fila, o remetente envia periodicamente uma **sonda de janela zero** (*zero window probe*), que provoca um ACK com a janela atual. O intervalo começa na casa do RTO (mínimo de 200 ms no Linux) e dobra a cada tentativa, até 120 s. As sondas são tráfego mínimo e não esgotam a conexão.

### Silly window syndrome

Se o receptor anunciasse uma janela de 1 byte toda vez que a aplicação lesse 1 byte, e o remetente enviasse 1 byte de cada vez, a conexão trocaria segmentos de 40 bytes de cabeçalho para 1 byte de dados. A regra de Clark evita isso no receptor: só anuncia espaço novo quando for pelo menos 1 MSS ou metade do buffer. O algoritmo de Nagle faz o equivalente no remetente (aula 22).

### Escala de janela

O campo janela tem 16 bits: máximo de **65.535 bytes** em trânsito por RTT. A vazão máxima é `janela / RTT`: com 100 ms, **5,2 Mbit/s**, mesmo num enlace de 10 Gbit/s. A **escala de janela** (RFC 7323), negociada só no SYN, multiplica o campo por 2ⁿ: com n = 7, até ~8 MB, o que dá 671 Mbit/s a 100 ms. O Linux liga o recurso por padrão (`net.ipv4.tcp_window_scaling = 1`).

Para encher um caminho, a janela precisa alcançar o **produto banda × atraso (BDP)**: 1 Gbit/s a 50 ms são 125 MB/s × 0,05 s = ~6,25 MB. O Linux ajusta o buffer sozinho (*autotuning*), entre o mínimo, o padrão e o máximo de `net.ipv4.tcp_rmem` (valores típicos: `4096 131072 6291456`).

### rwnd e cwnd são coisas diferentes

A rwnd protege o **receptor**; a janela de congestionamento (cwnd, próxima aula) protege a **rede**. O envio efetivo é o **mínimo** dos dois: `min(rwnd, cwnd)`. Uma conexão lenta pode ser limitada por qualquer um, e o `ss -ti` mostra cada um (`rcv_space`, `cwnd`, `snd_wnd`).

## Na prática

O programa abaixo reproduz a janela zero com um receptor que aceita a conexão e **nunca lê**. O cliente escreve blocos de 1 KB em outra thread até o `write()` bloquear. Os buffers estão reduzidos (16 KB) para o efeito aparecer logo.

```java
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.atomic.AtomicLong;

public class JanelaZero {
    public static void main(String[] args) throws Exception {
        InetAddress lo = InetAddress.getLoopbackAddress();
        try (ServerSocket servidor = new ServerSocket()) {
            servidor.setReceiveBufferSize(16 * 1024);                // buffer de recepção pequeno, antes do bind
            servidor.bind(new InetSocketAddress(lo, 0));
            Thread.ofVirtual().start(() -> {
                try (Socket s = servidor.accept()) {
                    Thread.sleep(60_000);                            // aceita e NUNCA lê: a janela vai a zero
                } catch (Exception ignorado) { }
            });

            Socket cliente = new Socket(lo, servidor.getLocalPort());
            cliente.setSendBufferSize(16 * 1024);
            AtomicLong escritos = new AtomicLong();
            Thread escritor = Thread.ofVirtual().start(() -> {
                try {
                    OutputStream out = cliente.getOutputStream();
                    byte[] bloco = new byte[1024];
                    while (true) { out.write(bloco); escritos.addAndGet(bloco.length); }   // bloqueia quando a janela fecha
                } catch (Exception ignorado) { }
            });

            Thread.sleep(1500);
            long antes = escritos.get();
            Thread.sleep(1500);
            System.out.println("bytes escritos: " + antes + " -> " + escritos.get() + " (parou? " + (antes == escritos.get()) + ")");
            System.out.println("estado do escritor: " + escritor.getState());
            cliente.close();
        }
    }
}
```

Num teste local (Windows), a saída foi `bytes escritos: 49152 -> 49152 (parou? true)` e `estado do escritor: WAITING`: o escritor parou no 48º KB, quando os dois buffers (o de envio e o de recepção) se encheram. O número exato depende do sistema operacional e do autotuning, mas o contador **para**, e a thread fica bloqueada em `write()` sem exceção alguma. Num servidor real, isso é uma thread presa até a aplicação do outro lado ler. Combine com `setSoTimeout` no lado que lê e com *timeouts de escrita* na camada acima (HTTP, gRPC) para não esperar para sempre.

No Linux, observe com `ss -tn`: um `Recv-Q` alto no receptor e um `Send-Q` alto no remetente, ambos parados, são a assinatura de janela zero. `ss -ti` e a captura (`tcpdump 'tcp[14:2] = 0'` filtra segmentos com janela 0) mostram o resto.

## Armadilhas comuns

- **Procurar problema de rede quando é consumo lento.** Janela zero com conexão ESTABLISHED e sem perdas é quase sempre uma aplicação que parou de ler (deadlock, GC longo, banco lento).
- **Escrever em socket sem timeout.** Um `write()` bloqueado por janela zero espera indefinidamente. Em canais de longa vida, imponha prazo de escrita ou use I/O não bloqueante com limite de fila.
- **Fila ilimitada na aplicação.** Se o produtor continua enfileirando enquanto o socket está parado, a memória cresce até o `OutOfMemoryError`. Respeite o *backpressure*: limite a fila.
- **Reduzir `SO_RCVBUF` "para economizar memória".** Buffers pequenos limitam a janela e a vazão em redes de grande BDP; fixar o valor também **desliga o autotuning** do Linux para aquele socket.
- **Firewall ou middlebox que remove a opção de escala de janela.** A conexão funciona, mas a janela fica em 64 KB e a vazão despenca em RTTs altos.
- **Confundir rwnd com cwnd.** Uma conexão lenta com janela livre e perdas é problema de congestionamento, e uma com janela zero é do receptor. São diagnósticos diferentes.

## Checklist de domínio

- [ ] Você explica que cada ACK carrega a janela de recepção e o que ela mede
- [ ] Você descreve o caminho até janela zero, as sondas e a atualização de janela que reabre o fluxo
- [ ] Você diferencia rwnd (protege o receptor) de cwnd (protege a rede) e sabe que o envio é min(rwnd, cwnd)
- [ ] Você calcula a vazão máxima de uma janela de 64 KB para um dado RTT e o BDP de um caminho
- [ ] Você explica a escala de janela e por que ela só pode ser combinada no SYN
- [ ] Você reconhece o sintoma de janela zero (`Recv-Q` e `Send-Q` altos, conexão parada) e aponta a aplicação que parou de ler

## Para ir além

- [RFC 9293: TCP (janela e controle de fluxo, seção 3.8)](https://www.rfc-editor.org/rfc/rfc9293)
- [RFC 7323: TCP Extensions for High Performance](https://www.rfc-editor.org/rfc/rfc7323)
- [RFC 1122: Requirements for Internet Hosts (silly window syndrome)](https://www.rfc-editor.org/rfc/rfc1122)
- [Manual do tcp(7) no Linux](https://man7.org/linux/man-pages/man7/tcp.7.html)
