> **Em uma frase:** dentro de uma rede local, quadros são entregues por endereço MAC, e o switch aprende sozinho em que porta cada MAC está, olhando a origem de cada quadro; o que ele não conhece é inundado, e o que sai da rede vai para o MAC do gateway.

## O problema

Um servidor de aplicação e o banco estão na mesma rede de um data center, ligados ao mesmo switch. Um dia, a latência entre os dois sobe de 0,3 ms para 40 ms, e o `tcpdump` no banco começa a mostrar tráfego que nunca foi endereçado a ele. Alguém ligou um cabo a mais entre dois switches, criou um laço e uma **tempestade de broadcast** consumiu o enlace. Em outro incidente, um host recebeu o MAC de outro dispositivo por engano e metade do tráfego foi parar no lugar errado.

Para o backend, a camada 2 parece distante, mas ela explica por que a rede "some" sem nenhum erro de aplicação, por que existe VLAN e por que o tráfego entre dois hosts da mesma sub-rede nunca passa pelo roteador.

## Como funciona

Todo adaptador de rede tem um **endereço MAC** de 48 bits, escrito em 6 bytes hexadecimais (`3c:22:fb:8a:51:0e`). Os 24 primeiros bits identificam o fabricante (OUI) e os 24 últimos, o aparelho. O MAC `ff:ff:ff:ff:ff:ff` é o endereço de **broadcast**: todos na rede local o recebem. Um bit do primeiro byte marca endereços de **multicast**.

O quadro Ethernet carrega MAC de destino, MAC de origem e EtherType, mais um payload de até **1500 bytes** (o MTU). Com uma etiqueta de VLAN (802.1Q), ganha 4 bytes e o limite do quadro sobe de 1518 para 1522.

O **switch** opera na camada 2 e mantém uma **tabela MAC** (também chamada de CAM ou FDB) que associa cada MAC a uma porta. Ele não é configurado: aprende. Para cada quadro que chega:

1. **Aprende**: guarda `MAC de origem → porta de entrada`, e renova o relógio dessa entrada. Só a origem é confiável, porque só ela prova em que porta aquele MAC está.
2. **Decide pelo destino**:
   - Se o MAC de destino está na tabela, envia **só** pela porta dele (**unicast**).
   - Se não está, envia por todas as portas exceto a de entrada (**flooding**, ou unicast desconhecido).
   - Se é broadcast (ou multicast sem filtro), também inunda.
3. **Expira**: uma entrada que ninguém renova some depois de 300 segundos, por padrão em muitos equipamentos. Se o host mudar de porta, o primeiro quadro dele corrige a tabela.

A diferença para um **hub** antigo, que repetia tudo em todas as portas, é a privacidade e a banda: no switch, cada par conversa sem ouvir os outros, e cada porta tem sua própria banda. O conjunto de dispositivos que ouvem os broadcasts uns dos outros é um **domínio de broadcast**. Um roteador delimita esse domínio; uma **VLAN** divide o mesmo switch físico em domínios lógicos separados (12 bits de identificador, até 4094 VLANs).

Para sair da rede local, o host usa o **gateway padrão**. O quadro leva o MAC do gateway como destino e o IP do destino final dentro do pacote. É essa separação (MAC do próximo salto, IP do destino final) que a aula 2 mostrou e que a aula 6 explica via ARP.

## Na prática

O comportamento do switch cabe em poucas linhas. A classe abaixo é o modelo exato do que a cena mostra, e é o tipo de código que aparece em exercícios de machine coding:

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;

public class SwitchL2 {
    static final String BROADCAST = "ff:ff:ff:ff:ff:ff";
    static final long ENVELHECIMENTO_MS = 300_000; // 300 s

    record Entrada(int porta, long vistoEm) {}

    private final int portas;
    private final LongSupplier relogio;
    private final Map<String, Entrada> tabela = new HashMap<>();

    SwitchL2(int portas, LongSupplier relogio) {
        this.portas = portas;
        this.relogio = relogio;
    }

    /** Devolve as portas de saída para um quadro que entrou por `portaEntrada`. */
    List<Integer> encaminhar(int portaEntrada, String macOrigem, String macDestino) {
        long agora = relogio.getAsLong();
        // 1) Aprende pela ORIGEM: esse MAC está atrás da porta por onde o quadro chegou.
        tabela.put(macOrigem, new Entrada(portaEntrada, agora));

        // 2) Decide pelo DESTINO.
        Entrada e = tabela.get(macDestino);
        boolean conhecido = e != null && agora - e.vistoEm() < ENVELHECIMENTO_MS;
        if (!macDestino.equals(BROADCAST) && conhecido) {
            return e.porta() == portaEntrada ? List.of() : List.of(e.porta()); // unicast
        }
        List<Integer> saidas = new ArrayList<>(); // flood: todas, menos a de entrada
        for (int p = 1; p <= portas; p++) if (p != portaEntrada) saidas.add(p);
        return saidas;
    }
}
```

Com `encaminhar(1, "aa:01", "bb:02")` numa tabela vazia, o resultado é `[2, 3, 4]`: destino desconhecido, flood. Se `bb:02` responder pela porta 2, o próximo quadro de `aa:01` para `bb:02` vai só por `[2]`. Repare que o relógio é injetado (`LongSupplier`): é o que permite testar o envelhecimento sem esperar 5 minutos.

Em um Linux, o equivalente de um switch é a `bridge`. Os comandos `ip link show` (seu MAC), `ip neigh` (MACs de vizinhos já conhecidos) e `bridge fdb show` (a tabela de encaminhamento de uma bridge) permitem inspecionar tudo isso numa máquina real.

## Armadilhas comuns

- **Laços na camada 2.** Dois switches ligados por dois cabos, sem STP, fazem um broadcast circular para sempre: o Ethernet não tem TTL. O Spanning Tree Protocol bloqueia portas redundantes para quebrar laços.
- **Aprender pelo destino.** Um erro comum de implementação e de resposta em entrevista. A tabela é alimentada pela **origem**; o destino só é consultado.
- **Tabela MAC cheia.** Um switch tem memória finita. Um ataque de *MAC flooding* enche a tabela e faz o equipamento inundar tudo, permitindo escuta. Port security limita MACs por porta.
- **Achar que switch roteia.** Entre sub-redes diferentes, só um roteador (ou um switch L3) encaminha. Dois hosts de sub-redes distintas no mesmo switch não conversam sem ele.
- **VLAN como segurança.** Separa domínios de broadcast, mas uma configuração de trunk errada permite saltar de VLAN. Combine com firewall.
- **MAC duplicado.** Clonar VMs sem trocar o MAC faz o switch oscilar a entrada entre portas e derruba a conectividade intermitentemente.

## Checklist de domínio

- [ ] Você explica o formato do MAC, o broadcast e a diferença entre MAC e IP
- [ ] Você descreve a regra do switch: aprende pela origem, decide pelo destino, inunda se não sabe
- [ ] Você diferencia unicast, flooding e broadcast e diz quando cada um ocorre
- [ ] Você explica por que um quadro para fora da rede leva o MAC do gateway
- [ ] Você reconhece um laço de camada 2 e sabe o papel do STP

## Para ir além

- [RFC 894: Transmission of IP Datagrams over Ethernet Networks](https://www.rfc-editor.org/rfc/rfc894)
- [RFC 826: An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826)
- [Linux: documentação do bridge (kernel.org)](https://docs.kernel.org/networking/bridge.html)
- [Linux: o comando ip (man7.org)](https://man7.org/linux/man-pages/man8/ip.8.html)
