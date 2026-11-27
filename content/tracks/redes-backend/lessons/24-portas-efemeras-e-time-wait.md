> **Em uma frase:** cada conexão de saída ocupa uma porta efêmera (no Linux, 32768 a 60999, cerca de 28 mil), o lado que fecha primeiro deixa a conexão em TIME_WAIT por 60 s, e um serviço que abre e fecha uma conexão por chamada esgota a faixa e passa a falhar com "Cannot assign requested address"; a cura é reaproveitar conexões, e não mexer em parâmetros do kernel.

## O problema

Num pico de tráfego, um serviço que chama uma API interna começa a falhar com `java.net.BindException: Cannot assign requested address`. O erro não menciona a API, que está saudável, e o `curl` da mesma máquina para a mesma API também falha. A CPU e a memória estão normais. Cinco minutos depois do pico, tudo volta sozinho, e o incidente parece fantasma.

É **esgotamento de portas efêmeras**. O limite não é de CPU, de memória nem de largura de banda: é de **números de porta** disponíveis para identificar conexões de saída.

## Como funciona

### De onde vêm as portas

Quando o seu processo chama `connect()`, o kernel escolhe uma **porta de origem efêmera** dentro de uma faixa configurável. No Linux:

```bash
sysctl net.ipv4.ip_local_port_range
```

A saída é `net.ipv4.ip_local_port_range = 32768  60999`.

A faixa padrão tem **28.232 portas** (60999 − 32768 + 1). Windows e macOS usam faixas próprias.

### O limite não é global

O que identifica uma conexão TCP é a **quádrupla** (IP de origem, porta de origem, IP de destino, porta de destino). A mesma porta local pode servir a várias conexões **desde que o destino seja diferente**. Então o teto de 28 mil vale **por destino** (IP e porta): um serviço que fala com 10 APIs distintas tem cerca de 28 mil portas para cada uma. O problema aparece quando todo o tráfego vai para o mesmo par (por exemplo, um único balanceador ou um único endpoint de banco), ou quando há NAT no caminho (aula 8), que concentra muitos clientes num mesmo IP público.

### TIME_WAIT

Quando uma conexão é fechada, **quem fecha primeiro** (o fechamento ativo) fica no estado **TIME_WAIT** (aula 12) por **60 s** no Linux. O estado existe por boas razões: garante que o último ACK foi recebido e que segmentos atrasados da conexão antiga não sejam confundidos com os de uma nova que reaproveite a mesma quádrupla. Durante esse tempo a porta continua **ocupada** para aquele destino.

### A conta do esgotamento

Se o cliente abre e fecha 500 conexões por segundo para o mesmo destino, cada uma deixa uma porta presa por 60 s:

```text
conexões em TIME_WAIT = 500 /s × 60 s = 30.000
portas disponíveis    = 28.232
tempo até acabar      ≈ 28.232 / 500 ≈ 56 s
```

Passado esse minuto, cada `connect()` novo falha na hora. Quem fecha primeiro é quem paga: um servidor HTTP que fecha a conexão após cada resposta acumula TIME_WAIT **no servidor**; um cliente que fecha acumula **no cliente**.

## Na prática

Diagnosticar:

```bash
ss -s                                          # resumo: "timewait" e total de conexões
ss -tan state time-wait | wc -l                # quantas estão em TIME_WAIT
ss -tan state time-wait dst 203.0.113.10       # só as de um destino
sysctl net.ipv4.ip_local_port_range
```

A saída do `ss -s` com milhares em TIME_WAIT para **um** destino e o erro `Cannot assign requested address` fecham o diagnóstico. O programa Java abaixo abre e fecha 2000 conexões em sequência contra um servidor local e mostra as portas que o sistema operacional entrega:

```java
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.TreeSet;

public class PortasLocais {
    public static void main(String[] args) throws Exception {
        InetAddress lo = InetAddress.getLoopbackAddress();
        try (ServerSocket srv = new ServerSocket(0, 128, lo)) {
            Thread.ofVirtual().start(() -> {
                try { while (true) srv.accept().close(); } catch (IOException e) { /* fim */ }
            });
            TreeSet<Integer> portas = new TreeSet<>();
            int n = 2000, falhas = 0;
            for (int i = 0; i < n; i++) {
                try (Socket c = new Socket(lo, srv.getLocalPort())) {
                    portas.add(c.getLocalPort());              // porta efêmera escolhida pelo SO
                } catch (IOException e) {
                    falhas++;                                  // "Cannot assign requested address" quando a faixa acaba
                }
            }
            System.out.println(n + " conexões abertas e fechadas em sequência");
            System.out.println("portas locais distintas usadas: " + portas.size());
            System.out.println("menor " + portas.first() + ", maior " + portas.last() + ", falhas " + falhas);
        }
    }
}
```

Em 2000 conexões o programa não esgota nada (cada uma usa uma porta diferente), e mostra bem o ponto: **cada conexão consome uma porta nova** enquanto as anteriores ainda estão no TIME_WAIT. Aumente `n` além do tamanho da faixa para forçar as falhas.

As curas, na ordem em que valem a pena:

1. **Reaproveitar conexões** (pool e keep-alive, aula 23). Uma conexão carregando mil requisições usa uma porta, e não mil. É a única cura que ataca a causa.
2. **Mais pares de destino ou de origem**: vários IPs de destino (várias réplicas atrás de DNS ou de um balanceador com IPs distintos) ou mais IPs de origem para o cliente multiplicam o espaço disponível.
3. **Ampliar a faixa**: `sysctl -w net.ipv4.ip_local_port_range="10240 60999"` ajuda, mas só adia o teto.
4. **`net.ipv4.tcp_tw_reuse`**: permite reaproveitar uma conexão em TIME_WAIT para **novas conexões de saída**, com segurança graças aos timestamps do TCP. Em kernels recentes o padrão é `2`, que vale só para loopback; `1` habilita para todo o tráfego de saída. É um paliativo, e não substitui o reaproveitamento.

## Armadilhas comuns

- **Usar `tcp_tw_recycle`.** Foi **removido no Linux 4.12** porque quebrava clientes atrás de NAT; nunca o recomende, mesmo que o encontre num tutorial antigo.
- **Confundir `SO_REUSEADDR` com a cura.** Ele serve para o `bind` do **servidor** reiniciar na mesma porta; não libera portas efêmeras de clientes.
- **Culpar o servidor.** O esgotamento acontece no lado que **abre** conexões, e o `connect()` falha localmente.
- **Reduzir o `tcp_fin_timeout` esperando encurtar o TIME_WAIT.** Ele controla outro estado (FIN_WAIT_2); o TIME_WAIT é fixo em 60 s no Linux.
- **Esquecer o NAT Gateway.** Ele tem seu próprio limite por destino (aula 8), e o sintoma aparece como timeouts de conexão.
- **Ver milhares de TIME_WAIT e achar que é um vazamento.** TIME_WAIT é normal; o problema é o ritmo de abertura.

## Checklist de domínio

- [ ] Você sabe a faixa padrão do Linux (32768 a 60999) e calcula quantas portas ela tem
- [ ] Você explica que o limite vale por quádrupla (por destino) e não é global
- [ ] Você explica o TIME_WAIT: quem fecha primeiro, 60 s, e por que ele existe
- [ ] Você faz a conta de esgotamento: conexões por segundo × 60 s contra o tamanho da faixa
- [ ] Você diagnostica com `ss -s`, `ss -tan state time-wait` e o erro `Cannot assign requested address`
- [ ] Você prioriza a cura (reaproveitar conexões) e sabe por que `tcp_tw_recycle` nunca é opção

## Para ir além

- [Manual do ip(7): ip_local_port_range](https://man7.org/linux/man-pages/man7/ip.7.html)
- [Manual do tcp(7): tcp_tw_reuse e tcp_fin_timeout](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [RFC 9293: TCP, estado TIME-WAIT](https://www.rfc-editor.org/rfc/rfc9293#name-state-machine-overview)
- [Documentação do Linux: ip-sysctl](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html)
