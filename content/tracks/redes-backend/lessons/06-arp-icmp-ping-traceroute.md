> **Em uma frase:** o ARP descobre o MAC de um vizinho a partir do IP (pergunta em broadcast, resposta em unicast), o ICMP é o canal de controle do IP, e o traceroute usa o TTL e a resposta "time exceeded" para listar cada roteador do caminho.

## O problema

"O servidor não responde ao ping, deve estar fora do ar." Meia hora depois alguém descobre que a aplicação estava de pé o tempo todo: o firewall bloqueava ICMP. Em outro dia, o `traceroute` mostra `* * *` no meio do caminho e o time abre um chamado com a operadora, mas a conexão estava funcionando e o roteador só não respondia ao ICMP.

Essas ferramentas são o primeiro recurso em qualquer incidente de rede, e as respostas delas só fazem sentido para quem sabe o que acontece por trás: qual pacote saiu, quem respondeu e por que alguém pode ter ficado calado.

## Como funciona

### ARP: de IP para MAC

Quadros Ethernet são entregues por MAC, mas as aplicações usam IP. Antes de enviar para `192.168.0.1`, o host precisa do MAC dele. O **ARP** (RFC 826) resolve isso em dois passos:

1. **Request** em broadcast (`ff:ff:ff:ff:ff:ff`): "quem tem `192.168.0.1`? Responda a `192.168.0.23`." O pacote ARP tem 28 bytes e vai direto no quadro, com EtherType `0x0806`, sem passar pelo IP.
2. **Reply** em **unicast**, só ao solicitante: "`192.168.0.1` está em `a4:91:b1:5c:2e:07`".

O resultado fica num **cache** (tabela de vizinhos). No Linux ele passa por estados como `REACHABLE`, `STALE`, `DELAY` e `PROBE`, e entradas sem uso expiram em dezenas de segundos. Veja com `ip neigh` ou `arp -n`. Dois usos extras: o **ARP gratuito** (a máquina anuncia o próprio par IP/MAC, usado em failover de IP virtual) e o **ARP spoofing**, ataque em que alguém responde por um IP que não é dele. O ARP não tem autenticação, por isso redes sensíveis usam inspeção dinâmica.

Só se usa ARP **dentro** da rede local. Para um destino remoto, o host faz ARP do **gateway**, não do destino.

### ICMP: o canal de controle

O **ICMP** (RFC 792) viaja dentro do IP (protocolo 1) e carrega avisos e testes, não dados de aplicação. Os tipos que você precisa conhecer:

| Tipo | Nome | Quando |
|---|---|---|
| 8 / 0 | Echo request / reply | O `ping` |
| 3 | Destination Unreachable | Código 0 rede, 1 host, 3 porta, 4 *fragmentation needed*, 13 proibido por filtro |
| 11 | Time Exceeded | TTL chegou a 0 em trânsito |

O `ping` envia echo request e mede o **RTT** até o echo reply. O TTL que ele imprime é o do **reply**: 64 (valor inicial do servidor) menos o número de roteadores do caminho de volta. Um `ttl=57` indica 7 roteadores.

### Traceroute: o truque do TTL

O `traceroute` envia sondas com TTL 1, depois 2, depois 3. Cada roteador que zera o TTL descarta o pacote e responde **ICMP Time Exceeded**, com o próprio endereço de origem. Assim o traceroute descobre o salto N. No Linux, as sondas são datagramas **UDP** para portas altas a partir de `33434`, que ninguém escuta. Quando a sonda chega ao destino, ele responde **ICMP Port Unreachable** (tipo 3, código 3), e o traceroute sabe que terminou. Três sondas por salto dão os três tempos de cada linha. Variantes úteis: `-I` usa ICMP echo (como o `tracert` do Windows) e `-T` usa TCP SYN, que passa por firewalls que descartam UDP.

Ler o resultado exige cuidado: o RTT de um salto intermediário mede o caminho até ele **mais o tempo que o roteador leva para gerar o ICMP**, que é uma tarefa de baixa prioridade. Um salto "lento" seguido de saltos rápidos não é um problema real.

## Na prática

Em Java não existe API portátil para enviar ICMP. `InetAddress.isReachable` tenta um echo ICMP apenas se o processo tiver privilégio; sem privilégio, tenta conectar na porta 7 (echo) por TCP. O resultado `false` quase nunca significa "máquina fora do ar". Para um backend, o teste correto é o que o serviço faz de verdade: abrir uma conexão TCP na porta do serviço.

```java
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;

public class Alcance {
    /** "Ping" de TCP: prova que a porta aceita conexão, que é o que o seu serviço realmente precisa. */
    static long tcpConnectMs(String host, int porta, int timeoutMs) {
        long t0 = System.nanoTime();
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, porta), timeoutMs);
            return (System.nanoTime() - t0) / 1_000_000;
        } catch (IOException e) {
            return -1;
        }
    }

    public static void main(String[] args) throws Exception {
        String host = args.length > 0 ? args[0] : "127.0.0.1";
        // isReachable: ICMP echo se privilegiado; senão, TCP na porta 7. "false" não prova nada.
        System.out.println("isReachable: " + InetAddress.getByName(host).isReachable(1_000));
        System.out.println("connect 443: " + tcpConnectMs(host, 443, 1_000) + " ms (-1 = falhou)");
    }
}
```

Os tempos do `tcpConnectMs` aproximam um RTT (o handshake leva uma ida e volta), e a exceção distingue os casos: `ConnectException: Connection refused` significa que a máquina respondeu e ninguém escuta na porta, enquanto `SocketTimeoutException` indica que nada voltou (filtro ou caminho cortado). Essa diferença economiza muito diagnóstico.

Receita de bancada para uma conexão que não abre: `ip route get <destino>` (qual rota?), `ip neigh` (o gateway tem MAC?), `ping` ao gateway, `traceroute -n` ao destino e, por fim, `nc -vz host porta` para a porta.

## Armadilhas comuns

- **Concluir "caiu" porque o ping falhou.** ICMP é bloqueado por muitos firewalls e provedores de nuvem por padrão. Teste a porta do serviço.
- **Entrar em pânico com `* * *`.** O roteador pode não responder ICMP ou limitá-lo, mas encaminhar normalmente. Se o salto seguinte responde, o caminho existe.
- **Ler o RTT de saltos intermediários como latência da rota.** Respostas ICMP têm prioridade baixa; só o RTT do destino final é confiável.
- **Supor que ida e volta passam pelos mesmos roteadores.** O traceroute mostra só a ida. Rotas assimétricas são comuns.
- **Bloquear todo o ICMP.** Quebra o Path MTU Discovery (tipo 3, código 4) e o traceroute. Permita ao menos tipos 3 e 11, e o echo se fizer sentido.
- **Confiar no cache ARP depois de trocar o equipamento do IP.** A entrada antiga aponta para o MAC antigo até expirar; o ARP gratuito e `ip neigh flush` aceleram a troca.

## Checklist de domínio

- [ ] Você explica por que o ARP existe e por que a pergunta é broadcast e a resposta é unicast
- [ ] Você lê um `ping` (TTL, RTT, perda) e sabe de onde vem o número do TTL
- [ ] Você explica passo a passo como o traceroute descobre cada salto com TTL e ICMP Time Exceeded
- [ ] Você sabe interpretar `* * *` e ICMP bloqueado sem tirar conclusões erradas
- [ ] Você escolhe um teste de TCP em vez de ICMP para verificar um serviço em Java

## Para ir além

- [RFC 826: An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826)
- [RFC 792: Internet Control Message Protocol](https://www.rfc-editor.org/rfc/rfc792)
- [Linux: arp(7), o cache de vizinhos do kernel](https://man7.org/linux/man-pages/man7/arp.7.html)
- [Java: InetAddress.isReachable](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/InetAddress.html#isReachable(int))
