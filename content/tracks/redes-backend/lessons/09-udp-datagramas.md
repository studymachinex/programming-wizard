> **Em uma frase:** o UDP acrescenta ao IP apenas portas e um checksum: cada datagrama viaja sozinho, sem handshake, sem confirmação e sem garantia de ordem, e por isso é a escolha de quem prefere baixa latência a entrega perfeita, desde que a aplicação cuide do que faltar.

## O problema

Um serviço de telemetria recebe uma leitura de cada sensor a cada 100 ms. Abrir uma conexão TCP por sensor, mantê-la viva e retransmitir leituras antigas que já não importam é um custo enorme para um dado que ficou obsoleto no instante seguinte. Do outro lado, um serviço que usa UDP "porque é mais rápido" descobre, em produção, que perde mensagens sem nenhum erro e que elas chegam embaralhadas.

O UDP não é um TCP pior. É um protocolo que **entrega o mínimo** e deixa as decisões para a aplicação. Saber exatamente o que ele promete, e o que não promete, é o que separa um uso inteligente de um bug intermitente.

## Como funciona

O cabeçalho UDP tem **8 bytes**, quatro campos de 16 bits:

| Campo | Para quê |
|---|---|
| Porta de origem | Onde o remetente espera respostas (opcional em teoria; na prática sempre usada) |
| Porta de destino | Qual processo recebe: `53` DNS, `123` NTP, `443` QUIC |
| Tamanho | Cabeçalho + dados, em bytes (mínimo 8) |
| Checksum | Detecta corrupção do cabeçalho, dos dados e dos IPs (pseudo-cabeçalho) |

Exemplo: o payload `ping` (4 bytes) de `198.51.100.7:54012` para `203.0.113.10:5000` produz um campo Tamanho de 12 e checksum `0xd43a`. O `tcpdump` mostra `UDP, length 4`, porque ele conta só os **dados**.

O checksum usa a mesma soma em complemento de um do IP, mas inclui um **pseudo-cabeçalho** com os endereços de origem e destino, o protocolo (17) e o tamanho. Assim um datagrama entregue ao IP errado é detectado. Em IPv4 o checksum é opcional (valor 0 significa "não calculado"); em IPv6 é obrigatório. Quando falha, o kernel **descarta** o datagrama: não há reparo nem aviso.

O que o UDP **não** tem:

- **Conexão e estado.** O kernel não guarda nada entre um datagrama e o seguinte, exceto o socket em si.
- **Confirmação e retransmissão.** Perdeu, perdeu.
- **Ordem.** Os datagramas são entregues na ordem de chegada.
- **Controle de fluxo e de congestionamento.** Um remetente rápido pode afogar o receptor e a rede.

O que ele **tem** e o TCP não:

- **Fronteiras de mensagem.** Cada `send()` vira um datagrama e cada `receive()` devolve um datagrama completo. No TCP, um fluxo de bytes não guarda onde cada mensagem começa e termina.
- **Custo mínimo.** Sem handshake, uma consulta e uma resposta consomem 1 RTT.
- **Broadcast e multicast.** Só são possíveis sobre UDP: descoberta de serviços na rede local e distribuição de vídeo usam isso.

O tamanho máximo teórico de um datagrama é 65.507 bytes (65.535 menos 20 de IP e 8 de UDP), mas com MTU 1500 só **1.472 bytes** de dados cabem sem fragmentação. Acima disso o IP fragmenta, e a perda de um único fragmento descarta o datagrama inteiro (aula 4). Boas práticas mantêm o payload abaixo de cerca de 1.400 bytes; o DNS usa 1.232 para ser seguro também em IPv6.

## Na prática

O programa abaixo faz três `send()` de tamanhos diferentes e um receptor com um buffer **de propósito pequeno** (16 bytes). Veja as duas lições: o receptor faz exatamente três `receive()`, e o segundo datagrama chega **truncado**.

```java
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;

public class UdpBasico {
    public static void main(String[] args) throws Exception {
        InetAddress local = InetAddress.getLoopbackAddress();
        try (DatagramSocket servidor = new DatagramSocket(0, local);
             DatagramSocket cliente = new DatagramSocket()) {
            servidor.setSoTimeout(500);               // sem timeout, receive() poderia esperar para sempre

            for (String texto : new String[] {"ping", "uma mensagem bem mais longa que a primeira", "fim"}) {
                byte[] dados = texto.getBytes(StandardCharsets.UTF_8);
                cliente.send(new DatagramPacket(dados, dados.length, local, servidor.getLocalPort()));
            }

            byte[] buf = new byte[16];                  // pequeno de propósito
            for (int i = 1; i <= 3; i++) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                servidor.receive(p);
                System.out.printf("receive #%d: %d bytes -> \"%s\"%n", i, p.getLength(),
                        new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
            }
        }
    }
}
```

A saída é:

```text
receive #1: 4 bytes -> "ping"
receive #2: 16 bytes -> "uma mensagem bem"
receive #3: 3 bytes -> "fim"
```

O segundo datagrama tinha 42 bytes; os 26 que não coubem foram **jogados fora sem exceção alguma**. Em produção, use um buffer do tamanho do maior datagrama esperado (1.500 é um bom padrão) e `p.getLength()` para saber quanto foi realmente recebido. Repare também que o `DatagramPacket` tem de ser recriado (ou ter o tamanho restaurado com `setLength`) a cada leitura: depois de um `receive`, o `length` fica com o tamanho do último datagrama.

Para observar na rede: `sudo tcpdump -n -i eth0 udp port 5000` mostra cada datagrama, e `ss -lun` lista os sockets UDP à escuta, sempre com estado `UNCONN`. Para testar à mão, `echo ping | nc -u -w1 203.0.113.10 5000` envia um datagrama e espera um segundo por resposta.

## Armadilhas comuns

- **Achar que `send()` com sucesso significa entrega.** Ele só diz que o datagrama foi entregue à interface de rede. Sem confirmação da aplicação, perdas são invisíveis.
- **Buffer de recepção pequeno.** Trunca em silêncio, como no exemplo. Sintoma: mensagens "cortadas" ou JSON inválido.
- **Esquecer que a ordem não é garantida.** Duas mensagens enviadas em sequência podem chegar invertidas. Se a ordem importa, numere.
- **Ignorar o ICMP "porta inalcançável".** Se ninguém escuta na porta, o kernel de destino responde ICMP tipo 3 código 3. Em Java, só um socket **conectado** (`connect(...)`) recebe isso, como `PortUnreachableException` no `send` ou `receive` seguintes. Um socket não conectado nunca fica sabendo.
- **Amplificação e reflexão.** Como a origem de um datagrama é fácil de forjar, serviços UDP que respondem muito mais do que recebem (DNS aberto, NTP, memcached) viram armas de ataque DDoS. Limite taxa e tamanho de resposta, e nunca exponha um serviço UDP sem necessidade.
- **Timeout de NAT e firewall.** Entradas UDP ociosas expiram em torno de 30 s em muitos NATs (aula 8). Aplicações com sessão longa mandam um pacote de *keepalive* periódico.
- **Datagrama acima do MTU.** Funciona na rede local de testes e falha na internet, onde a fragmentação é filtrada ou perdida.

## Checklist de domínio

- [ ] Você descreve os quatro campos do cabeçalho UDP e o que o checksum cobre
- [ ] Você lista o que o UDP não garante: entrega, ordem, deduplicação e controle de congestionamento
- [ ] Você explica a diferença entre fronteiras de mensagem (UDP) e fluxo de bytes (TCP)
- [ ] Você calcula o maior payload UDP que cabe em MTU 1500 sem fragmentar (1.472 bytes)
- [ ] Você sabe por que um buffer de recepção pequeno trunca datagramas e como evitar
- [ ] Você escolhe UDP ou TCP justificando por latência, perda tolerável e necessidade de ordem

## Para ir além

- [RFC 768: User Datagram Protocol](https://www.rfc-editor.org/rfc/rfc768)
- [RFC 8085: UDP Usage Guidelines](https://www.rfc-editor.org/rfc/rfc8085)
- [RFC 9000: QUIC, a UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000)
- [Javadoc: java.net.DatagramSocket](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/DatagramSocket.html)
