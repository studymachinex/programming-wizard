> **Em uma frase:** dois incidentes se repetem em quase toda empresa, o firewall ou NAT que esquece conexões ociosas sem avisar (o pool entrega uma conexão morta e o erro só aparece na próxima query) e o esgotamento de portas efêmeras; cada um tem um sintoma reconhecível, comandos de diagnóstico e uma correção que cabe em poucas linhas de configuração.

## O problema

Toda segunda de manhã, a primeira requisição de cada serviço falha com `Connection reset` ao consultar o Postgres, e as seguintes funcionam. Ninguém mexeu em nada no fim de semana. O banco está saudável, o pool tem conexões e as métricas de latência são normais no resto do dia. Os engenheiros reiniciam o serviço, e o erro some até a próxima manhã de baixo tráfego.

Este é o primeiro dos incidentes reais da aula, e o mais enganoso, porque a falha aparece **muito depois** da causa. O segundo, o esgotamento de portas, tem o padrão oposto: aparece no pico e some sozinho. Os dois juntam o que a trilha ensinou: NAT (aula 8), TCP e keep-alive (aulas 11 e 12), pools (aula 23) e portas (aula 24).

## Incidente 1: conexões ociosas mortas pelo firewall

### Como acontece

Um **NAT Gateway** ou um firewall de estado mantém uma tabela de conexões. Uma entrada que fica sem tráfego por um tempo, o *idle timeout*, é removida. No **NAT Gateway da AWS** esse limite é de **350 segundos**. Quando o tempo passa, o gateway **não envia FIN nem RST** para as pontas: as duas continuam achando que a conexão está de pé (`ESTABLISHED` no kernel, "aberta" no pool).

O pool de conexões do serviço guardou 10 conexões ociosas durante a madrugada. Depois de 350 s sem uso, todas foram esquecidas pelo gateway. Na primeira query da manhã, o pool entrega uma delas; o pacote chega ao gateway, que não encontra a entrada. Conforme o equipamento, ele responde com **RST** (a AWS documenta que o NAT Gateway devolve RST) e a aplicação vê `Connection reset`, ou **descarta em silêncio**, e a aplicação espera pelo timeout do socket. Em ambos os casos, o erro aparece **na próxima query**, e não quando a conexão morreu.

### Sintomas

- Erro na **primeira** chamada depois de um período ocioso; as seguintes funcionam (o pool descarta a conexão ruim ou abre outra).
- `Connection reset`, `Broken pipe`, ou travamento até o timeout de leitura.
- O intervalo ocioso é parecido com o idle timeout do firewall (350 s no NAT Gateway da AWS).
- Acontece em horários de baixo tráfego e some no pico, em que as conexões nunca ficam ociosas.

### Diagnóstico

```bash
ss -tno state established '( dport = :5432 )'

sudo tcpdump -nn -i eth0 'tcp port 5432 and tcp[tcpflags] & tcp-rst != 0'

sysctl net.ipv4.tcp_keepalive_time net.ipv4.tcp_keepalive_intvl net.ipv4.tcp_keepalive_probes
```

No `ss -o`, uma conexão sem `timer:(keepalive,...)` não está sendo sondada pelo kernel. A captura mostra o `[R]` ou `[R.]` chegando logo depois do primeiro segmento de dados após a ociosidade. E o log do pool (o HikariCP registra avisos de conexão inválida) confirma a hipótese.

### Correção

A regra é: **alguém precisa gerar tráfego na conexão antes que o firewall a esqueça, ou o pool precisa descartá-la antes de usá-la.** Três camadas, que se combinam:

1. **`keepaliveTime` do HikariCP** (por exemplo, 2 minutos, **menor** que 350 s): o pool testa as conexões ociosas periodicamente, e o tráfego renova a entrada no gateway.
2. **TCP keepalive** com tempos curtos: `setKeepAlive(true)` e, no sistema, `net.ipv4.tcp_keepalive_time` **abaixo** do idle timeout (o padrão de 7200 s é inútil aqui). Em Java 11 ou mais novo, os tempos podem ser ajustados por socket.
3. **`maxLifetime`** menor que qualquer limite de vida imposto pela infraestrutura: o pool renova as conexões antes que algo as mate.

O programa abaixo, completo, liga o keepalive e ajusta os tempos de um socket com as opções estendidas do JDK:

```java
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import jdk.net.ExtendedSocketOptions;

public class Keepalive {
    public static void main(String[] args) throws Exception {
        try (ServerSocket srv = new ServerSocket(0, 10, InetAddress.getLoopbackAddress());
             Socket s = new Socket(InetAddress.getLoopbackAddress(), srv.getLocalPort())) {
            s.setKeepAlive(true);                                   // liga o SO_KEEPALIVE
            System.out.println("SO_KEEPALIVE ligado: " + s.getKeepAlive());
            try {
                s.setOption(ExtendedSocketOptions.TCP_KEEPIDLE, 120);     // 1ª sonda após 120 s ocioso
                s.setOption(ExtendedSocketOptions.TCP_KEEPINTERVAL, 30);  // depois, a cada 30 s
                s.setOption(ExtendedSocketOptions.TCP_KEEPCOUNT, 3);      // desiste após 3 sem resposta
                System.out.println("idle=" + s.getOption(ExtendedSocketOptions.TCP_KEEPIDLE)
                        + " s, intervalo=" + s.getOption(ExtendedSocketOptions.TCP_KEEPINTERVAL)
                        + " s, tentativas=" + s.getOption(ExtendedSocketOptions.TCP_KEEPCOUNT));
            } catch (UnsupportedOperationException e) {
                System.out.println("este sistema não permite ajustar os tempos por socket: use o sysctl");
            }
        }
    }
}
```

O programa imprime `SO_KEEPALIVE ligado: true` e `idle=120 s, intervalo=30 s, tentativas=3` (em sistemas que suportam as opções estendidas; nos outros, a mensagem do `catch`). No driver JDBC do Postgres, a propriedade `tcpKeepAlive=true` liga o keepalive da conexão. E uma configuração coerente do pool seria: `keepaliveTime` em 120 s, `maxLifetime` em 25 min e `idleTimeout` em 10 min.

## Incidente 2: esgotamento de portas efêmeras

### Sintoma

`Cannot assign requested address` (`BindException` em Java) ao abrir conexões de saída, no pico, vindo do lado **cliente**. O `connect()` falha localmente, sem sair um pacote, e o problema some quando o ritmo cai (aula 24).

### Diagnóstico

```bash
ss -s                                        # "timewait" na casa das dezenas de milhares
ss -tan state time-wait dst 203.0.113.10 | wc -l
sysctl net.ipv4.ip_local_port_range          # faixa padrão: 32768 a 60999
```

A conta confirma: conexões por segundo vezes 60 s de TIME_WAIT, contra as 28.232 portas da faixa **por destino**.

### Correção

**Reaproveitar conexões** (pool e keep-alive, aula 23), a única que ataca a causa. Como paliativos: mais IPs de destino ou de origem, uma faixa maior e `tcp_tw_reuse` para conexões de saída. **Nunca** `tcp_tw_recycle`, removido no Linux 4.12 por quebrar clientes atrás de NAT.

## O método

Os dois incidentes têm a mesma estrutura, que serve para os próximos: **sintoma, diagnóstico, correção**.

| Incidente | Sintoma | Primeiro comando | Correção |
|---|---|---|---|
| Conexão morta pelo firewall | erro só na 1ª query após ociosidade | `tcpdump` por RST, `ss -o` | keepaliveTime, TCP keepalive, maxLifetime |
| Portas esgotadas | `Cannot assign requested address` no pico | `ss -s` | pool e keep-alive |
| Buraco negro de MTU | conecta, resposta grande trava | `ping -M do -s` | liberar ICMP, MSS clamping (aula 21) |
| Nagle e delayed ACK | 40 ms constantes | `ss -ti` (`ato:40`) | juntar escritas, TCP_NODELAY (aula 22) |
| Accept queue cheia | degraus de 1, 3 e 7 s no connect | `ss -ltn`, `nstat` | aceitar e delegar (aula 15) |

Um bom pós-incidente registra a linha do tempo, a evidência (capturas, contadores), a causa-raiz e as correções, com **uma métrica** que teria alertado antes.

## Armadilhas comuns

- **Reiniciar o serviço e dar o caso por encerrado.** O restart limpa o pool e esconde a causa até a próxima ociosidade.
- **Aumentar timeouts de leitura para "resolver" a conexão morta.** Só adia a falha e atrasa a detecção.
- **Configurar `keepaliveTime` maior que o idle timeout.** O firewall esquece a conexão antes da primeira sonda.
- **Ajustar só o `sysctl` e esquecer o `SO_KEEPALIVE` no socket.** Sem a opção ligada, o kernel não sonda.
- **Presumir que o firewall avisa.** Muitos descartam em silêncio, e as pontas só descobrem ao enviar dados.
- **Tratar o erro de uma conexão como falha do banco.** O padrão de "só a primeira" é a pista de conexão ociosa morta.
- **Não ter métrica de conexões que o pool descartou.** Sem ela, o incidente se repete sem ninguém perceber a tendência.

## Checklist de domínio

- [ ] Você explica como um NAT ou firewall esquece conexões ociosas (350 s no NAT Gateway) sem avisar as pontas
- [ ] Você reconhece o padrão: erro na primeira query depois de ociosidade, só em baixo tráfego
- [ ] Você diagnostica com `tcpdump` por RST, `ss -o` e `sysctl` do keepalive
- [ ] Você corrige com `keepaliveTime`, TCP keepalive abaixo do idle timeout e `maxLifetime`
- [ ] Você reconhece o esgotamento de portas e o corrige reaproveitando conexões
- [ ] Você descreve cada incidente como sintoma, diagnóstico e correção

## Para ir além

- [AWS: NAT Gateway, timeout de conexões ociosas](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-troubleshooting.html)
- [HikariCP: keepaliveTime e maxLifetime](https://github.com/brettwooldridge/HikariCP#gear-configuration-knobs-baby)
- [Javadoc: jdk.net.ExtendedSocketOptions](https://docs.oracle.com/en/java/javase/21/docs/api/jdk.net/jdk/net/ExtendedSocketOptions.html)
- [Manual do tcp(7): keepalive](https://man7.org/linux/man-pages/man7/tcp.7.html)
