/**
 * Cenas do módulo "Performance de rede no backend" da trilha Redes para Backend.
 * mtuMssPmtud: camadas aninhadas, shell bash (mtu-mss-e-pmtud).
 * nagleEDelayedAck: sequência, shell bash (nagle-e-delayed-ack).
 * custoDeConexao: sequência + gráfico (custo-de-conexao-e-pooling).
 * portasEfemeras: isométrico, shell bash (portas-efemeras-e-time-wait).
 */
import type { IsoEntity, Layer, LayerStack, Metric, SceneDef, SeqLane, SeqMessage, SeqNote, Status } from "../types";
import type { ChartPanel, GridPanel, Panel } from "@/lib/visualizers/types";
import { box, flow, link, zone } from "../kit/common";
import { rowXY } from "../kit/net";

type Tone4 = "ok" | "warn" | "bad" | "info";

const msg = (id: string, from: string, to: string, at: number, label: string, o: Partial<SeqMessage> = {}): SeqMessage => ({ id, from, to, at, label, ...o });
const note = (lane: string, at: number, text: string, tone: Tone4 = "info"): SeqNote => ({ lane, at, text, tone });
const state = (text: string, tone: Tone4 = "info") => ({ text, tone });

// =====================================================================================
// Cena 21: MTU, MSS e Path MTU Discovery (camadas aninhadas)
// =====================================================================================

const ethL = (o: Partial<Layer> = {}): Layer => ({ id: "eth", label: "Ethernet", sub: "14 B + FCS 4 B", tone: "ember", ...o });
const ipL = (sub: string, o: Partial<Layer> = {}): Layer => ({ id: "ip", label: "IP", sub, tone: "arcane", ...o });
const tcpL = (sub: string, o: Partial<Layer> = {}): Layer => ({ id: "tcp", label: "TCP", sub, tone: "sky", ...o });
const dadosL = (sub: string, o: Partial<Layer> = {}): Layer => ({ id: "dados", label: "Dados", sub, tone: "mana", ...o });
const nest = (id: string, label: string, layers: Layer[]): LayerStack => ({ id, label, orientation: "nested", layers });
const m21 = (mtu: string, mss: string, c?: Metric): Metric[] => [{ id: "mtu", label: "MTU", value: mtu }, { id: "mss", label: "MSS", value: mss }, ...(c ? [c] : [])];

const IP_LINK_MTU = ["2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000", "    link/ether 52:54:00:6d:19:c4 brd ff:ff:ff:ff:ff:ff"].join("\n");
const SS_MSS = ["State  Recv-Q  Send-Q   Local Address:Port    Peer Address:Port", "ESTAB  0       0         198.51.100.7:51514   203.0.113.10:8080", "\t cubic wscale:7,7 rto:212 rtt:12.5/6.2 mss:1448 pmtu:1500 cwnd:10"].join("\n");
const PING_BIG = ["PING 203.0.113.10 (203.0.113.10) 1472(1500) bytes of data.", "", "--- 203.0.113.10 ping statistics ---", "3 packets transmitted, 0 received, 100% packet loss, time 2042ms"].join("\n");
const PING_SMALL = [
  "PING 203.0.113.10 (203.0.113.10) 1372(1400) bytes of data.",
  "1380 bytes from 203.0.113.10: icmp_seq=1 ttl=60 time=21.4 ms",
  "1380 bytes from 203.0.113.10: icmp_seq=2 ttl=60 time=20.9 ms",
  "1380 bytes from 203.0.113.10: icmp_seq=3 ttl=60 time=21.2 ms",
  "",
  "--- 203.0.113.10 ping statistics ---",
  "3 packets transmitted, 3 received, 0% packet loss, time 2003ms",
  "rtt min/avg/max/mdev = 20.9/21.2/21.4/0.205 ms",
].join("\n");
const TRACEPATH = [
  " 1?: [LOCALHOST]                      pmtu 1500",
  " 1:  198.51.100.1                                          0.480ms",
  " 1:  198.51.100.1                                          0.397ms",
  " 2:  192.0.2.9                                             1.241ms pmtu 1400",
  " 2:  203.0.113.10                                         21.390ms reached",
  "     Resume: pmtu 1400 hops 2 back 2",
].join("\n");
const CLAMP = "iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu";
const IPT_S = ["-P FORWARD ACCEPT", "-A FORWARD -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu"].join("\n");
const PING_BIG_CMD = "ping -M do -s 1472 -c 3 203.0.113.10";
const PING_SMALL_CMD = "ping -M do -s 1372 -c 3 203.0.113.10";
const MTU_PROBING = "sysctl net.ipv4.tcp_mtu_probing";

export const mtuMssPmtud: SceneDef = {
  title: "MTU, MSS e o Path MTU Discovery",
  summary: "Calcule o MSS a partir do MTU, veja o ICMP que avisa um roteador de túnel e o buraco negro que aparece quando um firewall o bloqueia.",
  shell: "bash",
  goals: [
    { text: "Calcular o MSS a partir do MTU (1460 e 1448)", step: 2 },
    { text: "Ver o PMTUD: DF ligado, ICMP e reenvio menor", step: 5 },
    { text: "Reconhecer o buraco negro do ICMP bloqueado", step: 6 },
    { text: "Aplicar MSS clamping no gateway do túnel", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "MTU",
      title: "Cada enlace aceita um pacote de até um MTU",
      body: [
        "O **MTU** é o maior pacote IP que um enlace carrega num quadro. Na Ethernet são **1500 bytes**, contados a partir do cabeçalho IP: os 14 bytes do cabeçalho Ethernet e os 4 do FCS ficam de fora da conta.",
        "Dentro dos 1500 cabem o cabeçalho IP (20), o cabeçalho TCP (20) e os dados da aplicação.",
      ],
      metrics: m21("1500 B", "1460 B"),
      terminal: { suggest: ["ip link show eth0"], outputs: { "ip link show eth0": IP_LINK_MTU } },
      stage: { mode: "layers", stacks: [nest("pkt", "Quadro Ethernet", [ethL(), ipL("20 B · DF = 1"), tcpL("20 B"), dadosL("1460 B")])] },
    },
    {
      kind: "conceito",
      nav: "MSS",
      title: "O MSS é o MTU menos os cabeçalhos",
      body: [
        "O **MSS** é o maior bloco de dados que o TCP coloca num segmento: 1500 − 20 − 20 = **1460**. Cada ponta o anuncia numa opção do SYN, e a conexão usa o menor dos dois.",
        "Com a opção *timestamps* (padrão no Linux), cada segmento leva 12 bytes de opções e restam **1448** bytes de dados. É o `mss:1448` que o `ss -ti` mostra.",
      ],
      callout: { kind: "chave", text: "MTU conta tudo a partir do IP; MSS conta só os dados do TCP. 1500 → 1460 → 1448 com timestamps." },
      changes: ["TCP: 20 B + 12 B de timestamps", "Dados: 1460 → 1448 B"],
      metrics: m21("1500 B", "1460 B", { id: "dados", label: "Dados por segmento", value: "1448 B" }),
      terminal: { suggest: ["ss -ti dst 203.0.113.10"], outputs: { "ss -ti dst 203.0.113.10": SS_MSS } },
      stage: { mode: "layers", stacks: [nest("pkt", "Quadro Ethernet", [ethL(), ipL("20 B · DF = 1"), tcpL("20 B + 12 B de timestamps", { status: "hi" }), dadosL("1448 B", { status: "hi" })])] },
    },
    {
      kind: "conceito",
      nav: "Enlace menor",
      title: "O caminho tem um enlace menor que 1500",
      body: [
        "O que vale é o **menor MTU de todo o caminho**. Túneis e VPNs acrescentam o próprio cabeçalho, e o enlace efetivo cai (aqui, 1400). O TCP envia com o bit **DF** ligado: o pacote não pode ser fragmentado.",
        "Um roteador que recebe 1500 bytes para um enlace de 1400 e não pode fragmentar só tem uma saída: descartar o pacote.",
      ],
      changes: ["+ roteador do túnel, MTU 1400", "Pacote de 1500 B não cabe"],
      metrics: m21("1500 B", "1460 B", { id: "pmtu", label: "MTU do túnel", value: "1400 B", tone: "warn" }),
      stage: {
        mode: "layers",
        stacks: [
          nest("cli", "Cliente 198.51.100.7", [ethL(), ipL("1500 B · DF = 1"), tcpL("20 B"), dadosL("1460 B")]),
          nest("tun", "Roteador do túnel (MTU 1400)", [ipL("1500 > 1400 e DF = 1", { status: "warn" })]),
        ],
        wires: [{ from: "cli", to: "tun", label: "1500 B" }],
      },
    },
    {
      kind: "conceito",
      nav: "ICMP volta",
      title: "O roteador descarta e avisa por ICMP",
      body: [
        "Antes de descartar, o roteador devolve ao remetente um **ICMP tipo 3, código 4** (*fragmentation needed and DF set*), que informa o MTU do próximo salto: 1400.",
        "No IPv6, roteadores nunca fragmentam, e a mensagem equivalente é o **ICMPv6 Packet Too Big** (tipo 2).",
      ],
      changes: ["+ ICMP tipo 3 código 4", "Pacote de 1500 B descartado"],
      metrics: m21("1500 B", "1460 B", { id: "aviso", label: "Aviso", value: "MTU 1400", tone: "ok" }),
      stage: {
        mode: "layers",
        stacks: [
          nest("cli", "Cliente 198.51.100.7", [ipL("1500 B descartado", { status: "bad" })]),
          nest("tun", "Roteador do túnel (MTU 1400)", [ipL("192.0.2.9 → 198.51.100.7"), { id: "icmp", label: "ICMP", sub: "tipo 3, código 4 · MTU do próximo salto: 1400", tone: "rose", status: "new" }]),
        ],
        wires: [{ from: "tun", to: "cli", label: "ICMP 3/4", kind: "data" }],
      },
    },
    {
      kind: "solucao",
      nav: "Reenvio menor",
      title: "O remetente ajusta o tamanho e reenvia",
      body: [
        "O cliente guarda o novo *path MTU* (1400) e passa a montar segmentos menores: 1400 − 40 = **1360 bytes de dados** (1348 com timestamps). O reenvio passa pelo túnel sem problema.",
        "Esse é o **Path MTU Discovery** (RFC 1191). Funciona sozinho, desde que o ICMP chegue de volta.",
      ],
      changes: ["Segmento: 1460 → 1360 B", "Pacote de 1400 B atravessa"],
      metrics: m21("1400 B", "1360 B", { id: "res", label: "Resultado", value: "entregue", tone: "ok" }),
      stage: {
        mode: "layers",
        stacks: [
          nest("cli", "Cliente 198.51.100.7", [ethL(), ipL("1400 B · DF = 1", { status: "ok" }), tcpL("20 B"), dadosL("1360 B", { status: "ok" })]),
          nest("tun", "Roteador do túnel (MTU 1400)", [ipL("1400 ≤ 1400: cabe", { status: "ok" })]),
        ],
        wires: [{ from: "cli", to: "tun", label: "1400 B" }],
      },
    },
    {
      kind: "problema",
      nav: "Buraco negro",
      title: "Um firewall bloqueia o ICMP: nada avisa",
      body: [
        "Muitos firewalls descartam todo ICMP. O aviso se perde, o cliente continua mandando 1500 bytes e cada pacote cheio some. O **handshake passou** (o SYN é minúsculo), o `GET` curto também.",
        "Só as respostas grandes travam, sem erro e sem log. É o **PMTUD black hole**: conecta, funciona para tudo pequeno e dá timeout para tudo grande.",
      ],
      callout: { kind: "atencao", text: "O sintoma é determinístico: acima de certo tamanho nunca passa. Se ping e login funcionam, mas o download grande trava, pense em MTU." },
      changes: ["+ firewall bloqueando ICMP", "Aviso perdido; segmentos de 1500 B somem"],
      metrics: [{ id: "hs", label: "Handshake e GET curto", value: "passam", tone: "ok" }, { id: "big", label: "Resposta grande", value: "trava", tone: "bad" }, { id: "icmp", label: "ICMP 3/4", value: "bloqueado", tone: "bad" }],
      stage: {
        mode: "layers",
        stacks: [
          nest("cli", "Cliente 198.51.100.7", [ipL("1500 B · DF = 1", { status: "bad" }), tcpL("retransmite: nada confirma", { status: "warn" })]),
          nest("tun", "Roteador do túnel (MTU 1400)", [ipL("descarta 1500 B", { status: "warn" })]),
          nest("fw", "Firewall", [{ id: "icmp", label: "ICMP", sub: "tipo 3 código 4 descartado", tone: "rose", status: "dead" }]),
        ],
        wires: [{ from: "cli", to: "tun", label: "1500 B", kind: "bad" }, { from: "tun", to: "fw", label: "ICMP 3/4", kind: "bad" }],
      },
    },
    {
      kind: "conceito",
      nav: "Diagnóstico",
      title: "Meça o path MTU com ping e DF ligado",
      body: [
        "O `ping` com `-M do` liga o DF, e `-s` define o payload. Some 28 bytes (8 de ICMP e 20 de IP): `-s 1472` testa 1500, e `-s 1372` testa 1400. Se o primeiro fica mudo e o segundo responde, o caminho é de 1400.",
        "O `tracepath` faz a busca sozinho e mostra o `pmtu` por salto.",
      ],
      changes: ["ping -s 1472: 100% de perda", "ping -s 1372: responde"],
      metrics: m21("1400 B", "1360 B", { id: "res", label: "Pacote de 1500 B", value: "some", tone: "bad" }),
      terminal: {
        suggest: [PING_BIG_CMD, PING_SMALL_CMD, "tracepath -n 203.0.113.10"],
        outputs: { [PING_BIG_CMD]: PING_BIG, [PING_SMALL_CMD]: PING_SMALL, "tracepath -n 203.0.113.10": TRACEPATH },
      },
      stage: {
        mode: "layers",
        stacks: [nest("ping", "ping -M do -s 1472", [ipL("20 B", { status: "warn" }), { id: "icmp", label: "ICMP echo", sub: "8 B", tone: "rose" }, dadosL("1472 B", { status: "warn" })])],
      },
    },
    {
      kind: "solucao",
      nav: "MSS clamping",
      title: "A cura prática: reescrever o MSS no gateway",
      body: [
        "O gateway do túnel reescreve a opção MSS dos SYNs que passam: 1460 vira **1360**. As duas pontas passam a montar segmentos que cabem, e o PMTUD deixa de ser necessário nesse caminho.",
        "É o **MSS clamping**, comum em túneis, VPNs e PPPoE (MTU 1492). Na raiz, liberar o ICMP 3/4 e o ICMPv6 Packet Too Big continua sendo o certo.",
      ],
      cmd: CLAMP,
      changes: ["MSS do SYN: 1460 → 1360", "Segmentos passam a caber no túnel"],
      metrics: m21("1400 B", "1360 B", { id: "res", label: "Resposta grande", value: "passa", tone: "ok" }),
      terminal: { suggest: ["iptables -t mangle -S FORWARD"], outputs: { "iptables -t mangle -S FORWARD": IPT_S } },
      stage: {
        mode: "layers",
        stacks: [
          nest("syn", "SYN do cliente", [ipL("198.51.100.7 → 203.0.113.10"), tcpL("SYN · opção MSS = 1460")]),
          nest("gw", "SYN depois do gateway", [ipL("198.51.100.7 → 203.0.113.10"), tcpL("SYN · opção MSS = 1360", { status: "new" })]),
        ],
        wires: [{ from: "syn", to: "gw", label: "TCPMSS" }],
      },
    },
    {
      kind: "conceito",
      nav: "PLPMTUD e IPv6",
      title: "Três mecanismos, o mesmo problema",
      body: [
        "O PMTUD clássico depende do ICMP. O **PLPMTUD** (RFC 4821) o dispensa: o TCP sonda o caminho com segmentos maiores e recua ao perceber perdas. No Linux, `net.ipv4.tcp_mtu_probing=1` o ativa só depois de um buraco negro; `2` o mantém ligado.",
        "No IPv6 o mínimo garantido é **1280 bytes** e ninguém fragmenta no caminho: bloquear o ICMPv6 quebra o protocolo.",
      ],
      changes: ["+ PLPMTUD (RFC 4821)", "+ ICMPv6 Packet Too Big"],
      terminal: { suggest: [MTU_PROBING], outputs: { [MTU_PROBING]: "net.ipv4.tcp_mtu_probing = 0" } },
      stage: {
        mode: "layers",
        stacks: [
          {
            id: "mec",
            label: "Como o remetente descobre o MTU do caminho",
            orientation: "bands",
            layers: [
              { id: "pmtud", label: "PMTUD (RFC 1191)", sub: "ICMP tipo 3 código 4 · depende do ICMP", tone: "arcane" },
              { id: "v6", label: "IPv6 (RFC 8201)", sub: "ICMPv6 Packet Too Big · mínimo 1280 B", tone: "sky" },
              { id: "pl", label: "PLPMTUD (RFC 4821)", sub: "sonda o caminho · tcp_mtu_probing", tone: "mana" },
              { id: "clamp", label: "MSS clamping", sub: "o gateway ajusta o MSS dos SYNs", tone: "ember" },
            ],
          },
        ],
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "1500, 1460, 1448 e o ICMP que não pode faltar",
      body: [
        "**MTU** 1500; **MSS** = MTU − 40 = 1460 (1448 com timestamps). O caminho vale pelo seu menor enlace; túneis e PPPoE (1492) o encolhem.",
        "O PMTUD depende do ICMP 3/4 (ICMPv6 tipo 2). Bloqueado, vira black hole: conecta, requisição pequena passa, resposta grande trava. Cure com ICMP liberado, MSS clamping ou PLPMTUD.",
      ],
      changes: ["MTU → MSS → PMTUD → black hole"],
      metrics: m21("1500 B", "1460 B", { id: "dados", label: "Com timestamps", value: "1448 B" }),
      stage: { mode: "layers", stacks: [nest("pkt", "Quadro Ethernet", [ethL(), ipL("20 B · DF = 1"), tcpL("20 B + 12 B de timestamps"), dadosL("1448 B")])] },
    },
  ],
};

// =====================================================================================
// Cena 22: Nagle e delayed ACK (sequência)
// =====================================================================================

const LANES22: SeqLane[] = [
  { id: "cli", label: "Cliente Java 198.51.100.7", icon: "globe", tone: "mana" },
  { id: "srv", label: "Servidor 203.0.113.10", icon: "server", tone: "arcane" },
];
const seq22 = (messages: SeqMessage[], extra: Partial<Extract<SeqStage, { mode: "sequence" }>> = {}): SeqStage => ({ mode: "sequence", lanes: LANES22, messages, ...extra });
type SeqStage = Extract<import("../types").SceneStep["stage"], { mode: "sequence" }>;
const m22 = (lat: string, tone?: "ok" | "warn" | "bad"): Metric[] => [{ id: "rtt", label: "RTT", value: "0,5 ms" }, { id: "lat", label: "Tempo da chamada", value: lat, tone }];

const W1 = msg("w1", "cli", "srv", 0, "write 1: cabeçalho · 50 B", { span: 1, detail: "sai na hora: nada pendente", tone: "data" });
const ACKD = msg("ackd", "srv", "cli", 8, "ACK (atrasado)", { span: 1, detail: "o timer de 40 ms venceu", tone: "ok" });
const W2 = msg("w2", "cli", "srv", 11, "write 2: corpo · 200 B", { span: 1, detail: "agora sai: tudo confirmado", tone: "data" });
const RESP = msg("resp", "srv", "cli", 14, "resposta · 1 KB", { span: 1, tone: "data" });

const TCPDUMP22_CMD = "sudo tcpdump -nn -i eth0 'tcp port 8080'";
const TCPDUMP22 = [
  "10:15:02.000000 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [P.], seq 1:51, ack 1, win 502, length 50",
  "10:15:02.040590 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [.], ack 51, win 509, length 0",
  "10:15:02.040633 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [P.], seq 51:251, ack 1, win 502, length 200",
  "10:15:02.041302 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [P.], seq 1:1025, ack 251, win 509, length 1024",
].join("\n");
const SS_ATO = [
  "State  Recv-Q  Send-Q   Local Address:Port    Peer Address:Port",
  "ESTAB  0       0         203.0.113.10:8080    198.51.100.7:51514",
  "\t cubic wscale:7,7 rto:204 rtt:0.5/0.25 ato:40 mss:1448 pmtu:1500 rcvmss:536 advmss:1448 cwnd:10",
].join("\n");

export const nagleEDelayedAck: SceneDef = {
  title: "Nagle e delayed ACK: os 40 ms misteriosos",
  summary: "Veja o Nagle segurar o segundo write enquanto o servidor atrasa o ACK, e as curas: TCP_NODELAY e juntar as escritas.",
  shell: "bash",
  goals: [
    { text: "Explicar a regra do Nagle", step: 2 },
    { text: "Explicar o delayed ACK e seus valores", step: 3 },
    { text: "Ver os dois esperando um pelo outro", step: 5 },
    { text: "Curar com TCP_NODELAY ou juntando as escritas", step: 7 },
  ],
  steps: [
    {
      kind: "problema",
      nav: "40 ms por chamada",
      title: "Toda chamada demora 40 ms, sem motivo aparente",
      body: [
        "O cliente escreve a requisição em duas partes, o cabeçalho e o corpo, e depois lê a resposta. O servidor responde em 2 ms e o RTT é de 0,5 ms, mas cada chamada leva **40 ms**: sempre o mesmo valor, em todas.",
        "Nenhum pacote se perde e a CPU está ociosa. Um tempo redondo e constante aponta para um **temporizador**, e não para a rede.",
      ],
      metrics: m22("40 ms", "bad"),
      stage: seq22([], { laneState: { cli: state("write, write, read", "warn"), srv: state("ESTABLISHED", "ok") }, notes: [note("cli", 0, "write(cabeçalho)  write(corpo)  read()", "info")] }),
    },
    {
      kind: "conceito",
      nav: "Nagle",
      title: "Nagle: não mande tinygrams",
      body: [
        "O **algoritmo de Nagle** (RFC 896) evita pacotes minúsculos: se há dados enviados e **ainda não confirmados**, o TCP segura qualquer segmento menor que o MSS até chegar o ACK ou juntar um segmento cheio.",
        "Com a conexão ociosa, o primeiro pedaço sai na hora. O seguinte espera o ACK do primeiro.",
      ],
      callout: { kind: "chave", text: "Nagle: dado pequeno não confirmado → o próximo pedaço pequeno espera o ACK." },
      changes: ["+ write 1 sai na hora", "write 2 retido pelo Nagle"],
      metrics: m22("em curso"),
      stage: seq22([W1], { laneState: { cli: state("Nagle ativo", "warn") }, notes: [note("cli", 3, "write 2 (200 B) retido: há dado sem ACK", "warn")] }),
    },
    {
      kind: "conceito",
      nav: "Delayed ACK",
      title: "Delayed ACK: espere uma carona",
      body: [
        "O receptor não confirma cada segmento na hora. Ele **atrasa o ACK** esperando que a aplicação gere uma resposta (e o ACK vá de carona nela) ou que chegue um segundo segmento cheio para confirmar os dois de uma vez.",
        "O máximo pela especificação é 200 ms. No Linux o **mínimo é 40 ms**; o Windows usa 200 ms por padrão.",
      ],
      changes: ["+ ACK atrasado no servidor"],
      metrics: m22("em curso"),
      stage: seq22([W1], { laneState: { cli: state("Nagle ativo", "warn"), srv: state("ACK atrasado", "warn") }, notes: [note("cli", 3, "write 2 retido: há dado sem ACK", "warn"), note("srv", 4, "recebeu só metade: espera a carona", "warn")] }),
    },
    {
      kind: "problema",
      nav: "Um espera o outro",
      title: "O cliente espera o ACK; o servidor espera o resto",
      body: [
        "O cliente só envia o corpo quando o ACK chegar. O servidor só responde quando tiver a requisição inteira, e por isso o ACK não vai de carona: ele sai quando o timer vence.",
        "É o padrão **write-write-read**: cada lado espera pelo outro, e a pausa é o atraso do ACK (40 ms), **independente do RTT**.",
      ],
      callout: { kind: "atencao", text: "A pausa vale 40 ms no Linux e perto de 200 ms no Windows, mesmo com RTT de microssegundos." },
      changes: ["Impasse até o timer do ACK vencer", "+ colchete de ≈ 40 ms"],
      metrics: m22("≈ 40 ms", "bad"),
      stage: seq22([W1], { laneState: { cli: state("espera o ACK", "bad"), srv: state("espera o corpo", "bad") }, notes: [note("cli", 3, "write 2 retido: há dado sem ACK", "warn"), note("srv", 4, "ACK atrasado: espera a carona", "warn")], brackets: [{ fromAt: 1, toAt: 8, label: "≈ 40 ms" }] }),
    },
    {
      kind: "problema",
      nav: "O timer vence",
      title: "Passados 40 ms, o ACK sai e tudo anda",
      body: [
        "O timer do servidor vence e o ACK sai. O cliente enxerga tudo confirmado, solta o corpo e o servidor responde em seguida.",
        "A chamada, que deveria levar cerca de 1 ms, levou **≈ 41 ms**. Em cada chamada, em toda conexão, sem nenhum erro registrado.",
      ],
      changes: ["+ ACK atrasado", "+ write 2 sai", "+ resposta"],
      metrics: m22("≈ 41 ms", "bad"),
      terminal: { suggest: [TCPDUMP22_CMD], outputs: { [TCPDUMP22_CMD]: TCPDUMP22 } },
      stage: seq22([W1, ACKD, W2, RESP], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [{ fromAt: 1, toAt: 8, label: "≈ 40 ms" }] }),
    },
    {
      kind: "conceito",
      nav: "Como achar",
      title: "A assinatura: um tempo constante e redondo",
      body: [
        "Na captura, o segundo segmento sai **≈ 40 ms depois do ACK** do primeiro, e o ACK demorou 40 ms para aparecer. No `ss -ti`, o campo `ato:40` é o timeout do ACK atrasado daquela conexão.",
        "Se o tempo perdido é constante (40 ms no Linux, ~200 ms no Windows) e some quando a requisição vai numa escrita só, é esse padrão.",
      ],
      changes: ["ato:40 no ss -ti", "ACK 40 ms depois do segmento"],
      metrics: m22("≈ 41 ms", "bad"),
      terminal: { suggest: ["ss -ti dst 198.51.100.7", TCPDUMP22_CMD], outputs: { "ss -ti dst 198.51.100.7": SS_ATO, [TCPDUMP22_CMD]: TCPDUMP22 } },
      stage: seq22([W1, ACKD, W2, RESP], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ato:40", "warn") }, brackets: [{ fromAt: 1, toAt: 8, label: "≈ 40 ms" }] }),
    },
    {
      kind: "solucao",
      nav: "TCP_NODELAY",
      title: "Cura 1: desligar o Nagle",
      body: [
        "Com `socket.setTcpNoDelay(true)` o segmento pequeno sai **na hora**, sem esperar o ACK. O corpo parte logo depois do cabeçalho, o servidor tem a requisição completa e responde sem esperar o timer.",
        "A chamada volta a ≈ 1 ms. O custo: os dois `write` viram **dois pacotes**.",
      ],
      cmd: "socket.setTcpNoDelay(true);",
      changes: ["write 2 sai sem esperar", "≈ 41 ms → ≈ 1 ms"],
      metrics: m22("≈ 1 ms", "ok"),
      stage: seq22([msg("n1", "cli", "srv", 0, "write 1 · 50 B", { span: 1, detail: "TCP_NODELAY: sai na hora", tone: "data" }), msg("n2", "cli", "srv", 3, "write 2 · 200 B", { span: 1, detail: "sem esperar o ACK", tone: "data" }), msg("nr", "srv", "cli", 6, "resposta · 1 KB", { span: 1, tone: "data" })], { laneState: { cli: state("TCP_NODELAY", "ok"), srv: state("ESTABLISHED", "ok") } }),
    },
    {
      kind: "solucao",
      nav: "Juntar escritas",
      title: "Cura 2, a melhor: uma escrita só",
      body: [
        "Monte a mensagem inteira num buffer (`BufferedOutputStream` com um único `flush()`, ou um `ByteBuffer`) e escreva **uma vez**. Sai um segmento só: sem espera, sem ACK no meio, sem cabeçalhos desperdiçados.",
        "A causa estava em fragmentar a mensagem em vários `write`. Em protocolo próprio, delimitar e enviar de uma vez é mais barato que liberar o Nagle.",
      ],
      changes: ["Dois write → uma escrita", "1 pacote em vez de 2"],
      metrics: m22("≈ 1 ms", "ok"),
      stage: seq22([msg("u1", "cli", "srv", 0, "write único · 250 B", { span: 1, detail: "cabeçalho + corpo juntos", tone: "data" }), msg("ur", "srv", "cli", 3, "resposta · 1 KB", { span: 1, tone: "data" })], { laneState: { cli: state("1 write + flush", "ok"), srv: state("ESTABLISHED", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "TCP_QUICKACK",
      title: "TCP_QUICKACK: um remendo no receptor",
      body: [
        "No Linux, `TCP_QUICKACK` manda o receptor confirmar na hora, e o impasse some pelo outro lado. Mas **não é permanente**: o kernel pode voltar ao modo atrasado, e a opção teria de ser reativada depois de cada leitura.",
        "Serve para diagnosticar ou para casos pontuais; como projeto, prefira `TCP_NODELAY` ou escritas agrupadas no remetente.",
      ],
      changes: ["+ ACK imediato (QUICKACK)", "O efeito não é permanente"],
      metrics: m22("≈ 1 ms", "ok"),
      stage: seq22([msg("q1", "cli", "srv", 0, "write 1 · 50 B", { span: 1, tone: "data" }), msg("qa", "srv", "cli", 3, "ACK imediato", { span: 1, detail: "TCP_QUICKACK", tone: "ok" })], { laneState: { srv: state("QUICKACK", "ok") }, notes: [note("srv", 6, "o kernel pode voltar ao modo atrasado", "warn")] }),
    },
    {
      kind: "tradeoff",
      nav: "Tinygrams",
      title: "TCP_NODELAY com escritas minúsculas é o outro erro",
      body: [
        "Sem o Nagle, nada impede o aplicativo de mandar 1 byte por `write`: cada um vira um pacote com 40 bytes de cabeçalhos para 1 byte de dados. Era o problema que o Nagle resolvia.",
        "Regra prática: **agrupe antes de enviar** e ligue `TCP_NODELAY` para que o que sobrar saia sem espera.",
      ],
      callout: { kind: "bom-saber", text: "Agrupar escritas resolve os dois problemas: sem pausa de ACK e sem tinygrams." },
      changes: ["+ 3 pacotes de 1 B", "40 B de cabeçalho por 1 B de dado"],
      metrics: [{ id: "payload", label: "Dados por pacote", value: "1 B", tone: "warn" }, { id: "hdr", label: "Cabeçalhos IP + TCP", value: "40 B", tone: "bad" }],
      stage: seq22([msg("t1", "cli", "srv", 0, "1 B", { tone: "bad" }), msg("t2", "cli", "srv", 1, "1 B", { tone: "bad" }), msg("t3", "cli", "srv", 2, "1 B", { tone: "bad" })], { laneState: { cli: state("TCP_NODELAY", "warn") }, notes: [note("srv", 3, "3 pacotes para 3 bytes", "warn")] }),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Dois mecanismos de eficiência, uma pausa",
      body: [
        "**Nagle** segura pacote pequeno enquanto há dado sem ACK; **delayed ACK** espera 40 ms (Linux) a 200 ms (Windows). No padrão write-write-read, esperam-se mutuamente.",
        "Cure juntando as escritas ou com `setTcpNoDelay(true)`. `TCP_QUICKACK` não é permanente. A assinatura é uma pausa constante de 40 ms que não depende do RTT.",
      ],
      changes: ["Impasse, assinatura e curas"],
      metrics: m22("≈ 1 ms", "ok"),
      stage: seq22([msg("r1", "cli", "srv", 0, "write único · 250 B", { span: 1, tone: "data" }), msg("r2", "srv", "cli", 3, "resposta · 1 KB", { span: 1, tone: "data" })], { laneState: { cli: state("TCP_NODELAY + 1 write", "ok"), srv: state("ESTABLISHED", "ok") } }),
    },
  ],
};

// =====================================================================================
// Cena 23: custo de conexão, keep-alive e pool (sequência + gráfico)
// =====================================================================================

const LANES23: SeqLane[] = [
  { id: "app", label: "Aplicação", icon: "cpu", tone: "mana" },
  { id: "pool", label: "Pool de conexões", icon: "layers", tone: "sky" },
  { id: "srv", label: "API / banco", icon: "server", tone: "arcane" },
];
const seq23 = (messages: SeqMessage[], extra: Partial<SeqStage> = {}): SeqStage => ({ mode: "sequence", lanes: LANES23, messages, ...extra });
const m23 = (lat: string, tone?: "ok" | "warn" | "bad", c?: Metric): Metric[] => [{ id: "rtt", label: "RTT", value: "20 ms" }, { id: "lat", label: "Rede por chamada", value: lat, tone }, ...(c ? [c] : [])];

// Conexão nova: 3 RTTs (4 linhas por RTT).
const C = {
  syn: msg("c1", "app", "srv", 0, "SYN", { span: 1 }),
  synack: msg("c2", "srv", "app", 2, "SYN-ACK", { span: 1 }),
  hello: msg("c3", "app", "srv", 4, "ACK + ClientHello", { span: 1, tone: "ctrl" }),
  shello: msg("c4", "srv", "app", 6, "ServerHello · certificado · Finished", { span: 1, tone: "ctrl" }),
  get: msg("c5", "app", "srv", 8, "Finished + GET /pagar", { span: 1, tone: "data" }),
  ok: msg("c6", "srv", "app", 10, "200 OK", { span: 1, tone: "ok" }),
  fin: msg("c7", "app", "srv", 12, "FIN", { span: 1 }),
};
const TCP_BR = { fromAt: 0, toAt: 4, label: "TCP: 1 RTT" };
const TLS_BR = { fromAt: 4, toAt: 8, label: "TLS 1.3: 1 RTT" };
const HTTP_BR = { fromAt: 8, toAt: 12, label: "HTTP: 1 RTT" };

const SEM_POOL: [number, number][] = [[1, 60], [2, 60], [3, 60], [4, 60], [5, 60], [6, 60], [7, 60], [8, 60]];
const COM_POOL: [number, number][] = [[1, 60], [2, 20], [3, 20], [4, 20], [5, 20], [6, 20], [7, 20], [8, 20]];
const latChart = (withPool: boolean): ChartPanel => ({
  kind: "chart",
  label: "Latência de rede por requisição (ms), RTT de 20 ms",
  xLabel: "requisição",
  yLabel: "ms",
  series: [{ label: "sem pool", points: SEM_POOL, tone: "bad" }, ...(withPool ? [{ label: "com keep-alive", points: COM_POOL, tone: "done" as const }] : [])],
});

const flightBars: Panel = {
  kind: "bars",
  label: "RTTs para entregar uma resposta de 100 KB (em teoria)",
  values: [3, 1],
  tones: { 0: "bad", 1: "done" },
  pointers: [{ index: 0, label: "conexão nova" }, { index: 1, label: "aquecida" }],
};
const poolGrid: GridPanel = {
  kind: "grid",
  label: "Parâmetros do HikariCP que importam",
  colHeaders: ["Parâmetro", "Para quê", "Padrão"],
  rows: [
    ["maximumPoolSize", "teto de conexões abertas", "10"],
    ["connectionTimeout", "espera por uma conexão antes da exceção", "30 s"],
    ["maxLifetime", "renova a conexão (abaixo do limite da infra)", "30 min"],
    ["keepaliveTime", "testa as ociosas para mantê-las vivas", "desligado"],
    ["idleTimeout", "fecha as ociosas acima do mínimo", "10 min"],
  ],
  tones: [{ r: 2, c: 1, tone: "active" }, { r: 3, c: 1, tone: "active" }],
};

export const custoDeConexao: SceneDef = {
  title: "O custo de abrir uma conexão e o pool",
  summary: "Some os RTTs de TCP, TLS e HTTP numa conexão nova, compare com a conexão reaproveitada e veja como um pool a empresta, a renova e se esgota.",
  goals: [
    { text: "Somar os 3 RTTs de uma conexão nova", step: 4 },
    { text: "Ver o ganho da conexão reaproveitada e da cwnd aquecida", step: 6 },
    { text: "Entender empréstimo, espera e esgotamento do pool", step: 8 },
    { text: "Conhecer maxLifetime, keepaliveTime e o tamanho do pool", step: 10 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Chamada à API",
      title: "Um serviço chama a API de pagamentos",
      body: [
        "A cada pedido, o serviço chama a API de pagamentos por HTTPS. O RTT até ela é de **20 ms**. O código abre uma conexão, envia, lê a resposta e fecha.",
        "Vamos contar o que acontece na rede em cada chamada, antes de a API começar a trabalhar.",
      ],
      metrics: m23("?"),
      stage: seq23([], { laneState: { app: state("sem conexão"), srv: state("LISTEN", "ok") }, notes: [note("app", 0, "chamar a API de pagamentos", "info")] }),
    },
    {
      kind: "problema",
      nav: "Handshake TCP",
      title: "Primeiro, o handshake TCP: 1 RTT",
      body: [
        "Antes de qualquer dado, SYN, SYN-ACK e ACK. O cliente só pode mandar bytes depois de uma ida e volta completa: **1 RTT**, 20 ms.",
        "O estado da conexão (buffers, números de sequência) também precisa ser criado nos dois lados.",
      ],
      changes: ["+ SYN e SYN-ACK", "+ ida e volta: 20 ms"],
      metrics: m23("20 ms", "warn"),
      stage: seq23([C.syn, C.synack], { laneState: { app: state("SYN_SENT", "warn"), srv: state("SYN_RECV", "warn") }, brackets: [TCP_BR] }),
    },
    {
      kind: "problema",
      nav: "Handshake TLS",
      title: "Depois, o handshake TLS: mais 1 RTT",
      body: [
        "Com TLS 1.3, o ClientHello (já com a chave) vai junto com o ACK, e a resposta traz o certificado e o Finished: **1 RTT** a mais, 20 ms, mais CPU para trocar chaves e validar o certificado. Com TLS 1.2 seriam 2 RTTs.",
        "Só então o `GET` pode seguir, e ele vai junto com o Finished do cliente (aulas 11 e 18).",
      ],
      changes: ["+ ClientHello", "+ ServerHello e certificado"],
      metrics: m23("40 ms", "warn"),
      stage: seq23([C.syn, C.synack, C.hello, C.shello], { laneState: { app: state("handshake TLS", "warn"), srv: state("handshake TLS", "warn") }, brackets: [TCP_BR, TLS_BR] }),
    },
    {
      kind: "problema",
      nav: "3 RTTs",
      title: "Três RTTs por chamada, e a conexão é descartada",
      body: [
        "O `GET` e a resposta fecham o terceiro RTT: **60 ms** de rede por chamada. Em seguida a aplicação fecha a conexão, e quem fecha primeiro fica em TIME_WAIT por 60 s (aulas 12 e 24).",
        "Toda chamada repete tudo isso. Os 60 ms vão para a conta de cada pedido, em qualquer carga.",
      ],
      callout: { kind: "atencao", text: "Handshake TCP + TLS 1.3 + requisição = 3 RTTs. Com TLS 1.2 são 4." },
      changes: ["+ GET e 200 OK", "+ FIN e TIME_WAIT", "60 ms por chamada"],
      metrics: m23("60 ms", "bad"),
      extra: [latChart(false)],
      stage: seq23([C.syn, C.synack, C.hello, C.shello, C.get, C.ok, C.fin], { laneState: { app: state("TIME_WAIT", "warn"), srv: state("CLOSED") }, brackets: [TCP_BR, TLS_BR, HTTP_BR], notes: [note("app", 14, "TIME_WAIT: porta presa por 60 s", "warn")] }),
    },
    {
      kind: "solucao",
      nav: "Keep-alive",
      title: "Reaproveitar a conexão pula dois dos três RTTs",
      body: [
        "Com keep-alive, a conexão fica aberta depois da resposta. A segunda chamada sai direto: **sem SYN e sem TLS**, só a requisição e a resposta, **1 RTT**: 20 ms.",
        "No HTTP/1.1 a conexão é persistente por padrão; no HTTP/2 e no HTTP/3, uma conexão leva muitos streams.",
      ],
      changes: ["Sem SYN nem TLS", "60 ms → 20 ms por chamada"],
      metrics: m23("20 ms", "ok"),
      extra: [latChart(true)],
      stage: seq23([msg("w1", "app", "srv", 0, "GET /pagar", { span: 1, tone: "data" }), msg("w2", "srv", "app", 2, "200 OK", { span: 1, tone: "ok" })], { laneState: { app: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [{ fromAt: 0, toAt: 4, label: "1 RTT" }], notes: [note("srv", 5, "conexão já aberta: sem SYN, sem TLS", "ok")] }),
    },
    {
      kind: "conceito",
      nav: "cwnd aquecida",
      title: "A conexão aquecida também é mais rápida no envio",
      body: [
        "Toda conexão nova começa o *slow start* com **cwnd = 10** (cerca de 14 KB): uma resposta de 100 KB sai em 3 voos (10, 20 e 40 segmentos) e custa ~3 RTTs.",
        "Uma conexão aquecida já cresceu a cwnd com o tráfego anterior e pode mandar os ~70 segmentos de uma vez, limitada só pela janela do receptor (aulas 13 e 14). É conta de ordem de grandeza, sem perdas.",
      ],
      changes: ["+ 3 voos na conexão nova", "+ 1 voo na aquecida"],
      metrics: m23("3 RTTs vs 1", undefined, { id: "cw", label: "Janela inicial", value: "10 segmentos" }),
      extra: [flightBars],
      stage: seq23(
        [
          msg("f1", "srv", "app", 0, "10 segmentos", { span: 1, tone: "data" }),
          msg("a1", "app", "srv", 2, "ACKs", { span: 1, tone: "ok" }),
          msg("f2", "srv", "app", 4, "20 segmentos", { span: 1, tone: "data" }),
          msg("a2", "app", "srv", 6, "ACKs", { span: 1, tone: "ok" }),
          msg("f3", "srv", "app", 8, "40 segmentos", { span: 1, tone: "data" }),
          msg("f4", "srv", "app", 12, "70 segmentos", { span: 1, tone: "data" }),
        ],
        { notes: [note("srv", 1, "conexão nova: cwnd = 10", "warn"), note("srv", 13, "conexão aquecida: 1 voo", "ok")] },
      ),
    },
    {
      kind: "solucao",
      nav: "O pool",
      title: "Um pool empresta e recebe de volta",
      body: [
        "O **pool** mantém conexões abertas. A aplicação pede uma com `getConnection()`, usa e a devolve com `close()` (que não fecha de verdade, só devolve). Bancos usam pool quase sempre: cada conexão tem estado e, no Postgres, é um processo no servidor.",
        "A conexão é criada de forma preguiçosa, até o `maximumPoolSize`. Aqui: 3 abertas, 1 em uso.",
      ],
      changes: ["+ empréstimo de uma conexão aquecida", "+ devolução ao pool"],
      metrics: [{ id: "uso", label: "Em uso", value: "1 / 10" }, { id: "aber", label: "Abertas", value: 3 }, { id: "lat", label: "Rede por chamada", value: "20 ms", tone: "ok" }],
      stage: seq23(
        [
          msg("p1", "app", "pool", 0, "getConnection()"),
          msg("p2", "pool", "app", 1, "conexão #2 (aquecida)", { tone: "ok" }),
          msg("q1", "app", "srv", 3, "SELECT … FROM pedidos", { span: 1, tone: "data" }),
          msg("q2", "srv", "app", 5, "linhas", { span: 1, tone: "ok" }),
          msg("p3", "app", "pool", 8, "close(): devolve ao pool"),
        ],
        { laneState: { pool: state("3 abertas · 1 em uso", "ok") } },
      ),
    },
    {
      kind: "problema",
      nav: "Pool cheio",
      title: "Pool cheio: espera, e depois falha",
      body: [
        "Com as 10 conexões emprestadas, o próximo `getConnection()` **espera**. Se nenhuma voltar em `connectionTimeout` (30 s por padrão), o pool lança uma exceção.",
        "É saturação visível: sem o limite, o banco receberia conexões demais. O esquecimento clássico é não devolver a conexão (use `try-with-resources`).",
      ],
      callout: { kind: "atencao", text: "Pool esgotado quase sempre é conexão não devolvida ou consulta lenta segurando a conexão." },
      changes: ["+ pedido sem conexão livre", "+ exceção por timeout"],
      metrics: [{ id: "uso", label: "Em uso", value: "10 / 10", tone: "bad" }, { id: "esp", label: "Em espera", value: 6, tone: "warn" }],
      stage: seq23(
        [msg("e1", "app", "pool", 0, "getConnection()"), msg("e2", "pool", "app", 6, "exceção: timeout de 30 s", { tone: "bad" })],
        { laneState: { pool: state("10 / 10 em uso", "bad") }, notes: [note("pool", 2, "todas emprestadas: espera", "warn")], brackets: [{ fromAt: 1, toAt: 6, label: "connectionTimeout" }] },
      ),
    },
    {
      kind: "conceito",
      nav: "Vida da conexão",
      title: "O pool também cuida da idade das conexões",
      body: [
        "**`maxLifetime`** renova cada conexão ao fim de sua vida (30 min por padrão) e precisa ficar **abaixo** de qualquer limite do banco ou do firewall. **`keepaliveTime`** testa as ociosas para que o firewall não as esqueça. **`idleTimeout`** devolve as sobras ao banco.",
        "Sem isso, o pool entrega conexões já mortas (aula 30).",
      ],
      changes: ["+ keepalive nas ociosas", "+ maxLifetime e idleTimeout"],
      extra: [poolGrid],
      stage: seq23(
        [msg("k1", "pool", "srv", 0, "isValid() / keepalive", { span: 1, tone: "ctrl" }), msg("k2", "srv", "pool", 2, "ok", { span: 1, tone: "ok" })],
        { laneState: { pool: state("mantém as ociosas vivas", "ok") }, notes: [note("pool", 4, "maxLifetime: renova antes do firewall", "info"), note("pool", 6, "idleTimeout: fecha as sobras", "info")] },
      ),
    },
    {
      kind: "tradeoff",
      nav: "Tamanho do pool",
      title: "Pool maior não é pool mais rápido",
      body: [
        "O banco só executa em paralelo o que os seus núcleos e discos permitem. O guia do HikariCP dá um **ponto de partida**: `(núcleos × 2) + discos efetivos`. Para 8 núcleos e 1 disco efetivo, 17.",
        "Com 40 threads e 17 conexões, 23 esperam na fila do pool, e isso costuma ser **melhor** que 40 conexões brigando por 8 núcleos. A fórmula é partida, e a medição sob carga decide.",
      ],
      callout: { kind: "bom-saber", text: "Pools pequenos e bem medidos costumam vencer pools grandes. Dimensione por teste de carga, não por palpite." },
      changes: ["+ 40 threads, 17 conexões", "23 esperam no pool"],
      metrics: [{ id: "n", label: "Núcleos do banco", value: 8 }, { id: "p", label: "Ponto de partida", value: 17 }, { id: "f", label: "Esperando", value: 23, tone: "warn" }],
      stage: seq23(
        [msg("s1", "app", "pool", 0, "40 threads pedem", { tone: "data" }), msg("s2", "pool", "srv", 2, "17 queries simultâneas", { span: 1, tone: "data" })],
        { laneState: { pool: state("17 / 17 em uso", "warn") }, notes: [note("pool", 1, "23 esperam na fila do pool", "warn")] },
      ),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Conexão cara, pool barato",
      body: [
        "Conexão nova = TCP (1 RTT) + TLS (1 RTT) + requisição (1 RTT), com cwnd recomeçando em 10. Reaproveitada, paga só a requisição e já vem aquecida.",
        "O pool empresta, devolve e se esgota com um limite visível. Ajuste `maxLifetime` e `keepaliveTime` ao firewall e dimensione o tamanho por medição.",
      ],
      changes: ["60 ms → 20 ms por chamada"],
      metrics: m23("20 ms", "ok", { id: "pool", label: "Pool", value: "17 conexões" }),
      extra: [latChart(true)],
      stage: seq23([msg("z1", "app", "pool", 0, "getConnection()"), msg("z2", "pool", "app", 1, "conexão aquecida", { tone: "ok" }), msg("z3", "app", "srv", 3, "GET /pagar", { span: 1, tone: "data" }), msg("z4", "srv", "app", 5, "200 OK", { span: 1, tone: "ok" })], { laneState: { pool: state("conexões vivas", "ok") } }),
    },
  ],
};

// =====================================================================================
// Cena 24: portas efêmeras e TIME_WAIT (iso)
// =====================================================================================

const P24 = (i: number) => rowXY(i, 3.6);

type Q24 = { used?: number; usedBadge?: string; usedStatus?: Status; tw?: number; twBadge?: string; twStatus?: Status; app?: Status; appLabel?: string; api2?: boolean };

function cena24(q: Q24 = {}): IsoEntity[] {
  const [cx, cy] = P24(1.5);
  return [
    box("app", ...P24(0), "server", q.appLabel ?? "serviço Java", { size: "md", tone: "mana", status: q.app }),
    zone("kern", cx - 2.2, cy - 2.2, 4.4, 4.4, { label: "kernel do cliente", tone: "sky" }),
    box("ports", 1.0, 3.4, "list", "portas em uso", { parent: "kern", size: "sm", tone: "ember", meter: q.used ?? 0, status: q.usedStatus, badges: q.usedBadge ? [{ text: q.usedBadge, tone: q.usedStatus === "bad" ? "bad" : "info" }] : undefined }),
    box("tw", 3.4, 1.0, "clock", "TIME_WAIT", { parent: "kern", size: "sm", tone: "rose", meter: q.tw ?? 0, status: q.twStatus, badges: q.twBadge ? [{ text: q.twBadge, tone: q.twStatus === "bad" ? "bad" : "info" }] : undefined }),
    box("api", ...P24(3), "server", "API A :443", { size: "md", tone: "arcane" }),
    ...(q.api2 ? [box("api2", 14.8, -6.8, "server", "API B :443", { size: "md", tone: "arcane" })] : []),
  ];
}
const LINKS24 = [link("app", "ports"), link("ports", "api")];
const m24 = (livres: string, tw: string, c?: Metric): Metric[] => [{ id: "livres", label: "Portas livres", value: livres }, { id: "tw", label: "TIME_WAIT", value: tw }, ...(c ? [c] : [])];

const RANGE = "sysctl net.ipv4.ip_local_port_range";
const SS_S = [
  "Total: 29184",
  "TCP:   28986 (estab 412, closed 28501, orphaned 0, timewait 28232)",
  "",
  "Transport Total     IP        IPv6",
  "RAW       0         0         0",
  "UDP       12        9         3",
  "TCP       485       470       15",
  "INET      497       479       18",
  "FRAG      0         0         0",
].join("\n");
const SS_TW = [
  "State      Recv-Q  Send-Q    Local Address:Port      Peer Address:Port",
  "TIME-WAIT  0       0          198.51.100.7:51514     203.0.113.10:443",
  "TIME-WAIT  0       0          198.51.100.7:51515     203.0.113.10:443",
  "TIME-WAIT  0       0          198.51.100.7:51516     203.0.113.10:443",
].join("\n");
const SS_TW_CMD = "ss -tan state time-wait dst 203.0.113.10 | head -4";
const SS_TW_COUNT = "ss -tan state time-wait | wc -l";

const tuneGrid: GridPanel = {
  kind: "grid",
  label: "Alavancas, da mais certa à mais arriscada",
  colHeaders: ["Alavanca", "Efeito", "Observação"],
  rows: [
    ["Reaproveitar conexões", "ataca a causa", "pool e keep-alive: a primeira escolha"],
    ["Mais IPs de destino ou de origem", "multiplica o espaço", "o limite é por quádrupla"],
    ["ip_local_port_range maior", "adia o teto", "ex.: 10240 60999"],
    ["tcp_tw_reuse = 1", "reusa TIME_WAIT na saída", "padrão 2: só loopback"],
    ["tcp_tw_recycle", "removido no Linux 4.12", "quebrava clientes atrás de NAT"],
  ],
  tones: [{ r: 0, c: 0, tone: "done" }, { r: 4, c: 0, tone: "bad" }, { r: 4, c: 2, tone: "bad" }],
};

export const portasEfemeras: SceneDef = {
  title: "Portas efêmeras: quando a faixa acaba",
  summary: "Acompanhe um serviço que abre uma conexão por chamada até esgotar as 28 mil portas efêmeras, veja o TIME_WAIT e a cura.",
  shell: "bash",
  goals: [
    { text: "Saber a faixa de portas do Linux e que o limite é por destino", step: 2 },
    { text: "Explicar o TIME_WAIT e a conta do esgotamento", step: 4 },
    { text: "Reconhecer o erro e diagnosticar com ss", step: 6 },
    { text: "Curar reaproveitando conexões", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Porta de origem",
      title: "Cada conexão de saída usa uma porta efêmera",
      body: [
        "Quando o serviço chama `connect()`, o kernel escolhe uma **porta de origem** livre numa faixa. No Linux: `net.ipv4.ip_local_port_range`, padrão **32768 a 60999**, ou **28.232 portas**.",
        "Enquanto a conexão existe, essa porta identifica a ponta de saída. Parece muita porta, mas ela é consumida e devolvida num ritmo que depende de como o código usa as conexões.",
      ],
      metrics: m24("28.232", "0", { id: "faixa", label: "Faixa", value: "32768 a 60999" }),
      terminal: { suggest: [RANGE], outputs: { [RANGE]: "net.ipv4.ip_local_port_range = 32768\t60999" } },
      focus: ["app", "ports", "api"],
      stage: { mode: "iso", entities: cena24(), links: LINKS24, flows: [flow("app", "api", 1, { via: ["ports"] })] },
    },
    {
      kind: "conceito",
      nav: "Por destino",
      title: "O limite vale por destino, não é global",
      body: [
        "Uma conexão TCP é identificada pela **quádrupla**: IP e porta de origem, IP e porta de destino. A mesma porta local `51514` pode servir a duas conexões se os destinos forem diferentes.",
        "Então o teto de 28 mil vale **para cada par (IP, porta) de destino**. O problema aparece quando todo o tráfego vai para um único endpoint, ou quando um NAT concentra muitos clientes.",
      ],
      callout: { kind: "chave", text: "O limite de portas efêmeras é por quádrupla: um serviço com 10 destinos distintos tem ~28 mil portas para cada um." },
      changes: ["+ segundo destino (API B)", "Mesma porta serve a destinos diferentes"],
      metrics: m24("28.232", "0", { id: "lim", label: "Limite", value: "por destino" }),
      focus: ["ports", "api", "api2"],
      stage: { mode: "iso", entities: cena24({ api2: true, used: 2, usedBadge: "51514 ×2" }), links: [...LINKS24, link("ports", "api2")], flows: [flow("app", "api", 1, { via: ["ports"] }), flow("app", "api2", 1, { via: ["ports"] })] },
    },
    {
      kind: "conceito",
      nav: "TIME_WAIT",
      title: "Quem fecha primeiro fica em TIME_WAIT por 60 s",
      body: [
        "Ao fechar, o lado que fecha primeiro entra em **TIME_WAIT** (aula 12) por **60 s** no Linux. O estado garante que o último ACK chegou e que segmentos atrasados da conexão antiga não se misturem com os de uma nova.",
        "Durante esses 60 s a porta continua **ocupada** para aquele destino, mesmo sem nenhum dado trafegando.",
      ],
      changes: ["+ conexões em TIME_WAIT", "Portas presas por 60 s"],
      metrics: m24("28.229", "3", { id: "t", label: "Tempo no estado", value: "60 s" }),
      terminal: { suggest: [SS_TW_CMD], outputs: { [SS_TW_CMD]: SS_TW } },
      focus: ["ports", "tw"],
      stage: { mode: "iso", entities: cena24({ used: 1, tw: 1, twBadge: "60 s", twStatus: "hi" }), links: LINKS24, flows: [flow("app", "api", 1, { via: ["ports"] })] },
    },
    {
      kind: "problema",
      nav: "500 por segundo",
      title: "Uma conexão por chamada, 500 chamadas por segundo",
      body: [
        "O código abre e fecha uma conexão para cada chamada, a 500 por segundo. Cada uma deixa uma porta presa por 60 s: depois de 28 s há **14.000 portas** em TIME_WAIT, metade da faixa.",
        "Em regime, seriam 500 × 60 = **30.000** em TIME_WAIT para 28.232 portas: não cabe.",
      ],
      changes: ["+ 500 conexões por segundo", "TIME_WAIT: 14.000"],
      metrics: m24("14.232", "14.000", { id: "ritmo", label: "Conexões/s", value: 500, tone: "warn" }),
      focus: ["app", "ports", "tw"],
      stage: { mode: "iso", entities: cena24({ used: 50, usedStatus: "warn", usedBadge: "14.000", tw: 50, twStatus: "warn", twBadge: "14.000", app: "warn" }), links: LINKS24, flows: [flow("app", "api", 4, { via: ["ports"], kind: "heavy" })] },
    },
    {
      kind: "problema",
      nav: "Acabou a faixa",
      title: "Por volta de 56 s, a faixa acaba",
      body: [
        "28.232 ÷ 500 ≈ 56 s. Chegou ao fim: `connect()` não encontra porta livre e falha **localmente**, sem sair um pacote para a rede. O erro é `Cannot assign requested address` (em Java, uma `BindException`).",
        "A API está saudável. O serviço falha em abrir conexões, e quando o ritmo cai, as portas voltam a se liberar sozinhas, o que faz o incidente parecer fantasma.",
      ],
      callout: { kind: "atencao", text: "BindException: Cannot assign requested address num cliente que só faz connect() é esgotamento de portas efêmeras." },
      changes: ["Portas livres: 0", "+ connect() falha localmente"],
      metrics: m24("0", "28.232", { id: "err", label: "Erro", value: "Cannot assign requested address", tone: "bad" }),
      focus: ["app", "ports", "tw"],
      stage: { mode: "iso", entities: cena24({ used: 100, usedStatus: "bad", usedBadge: "faixa cheia", tw: 100, twStatus: "bad", twBadge: "28.232", app: "bad" }), links: LINKS24, flows: [flow("app", "ports", 3, { kind: "bad", label: "connect() falha" })] },
    },
    {
      kind: "conceito",
      nav: "Diagnóstico",
      title: "Confirme com o ss e com a faixa",
      body: [
        "O `ss -s` resume os estados: milhares em `timewait` para um único destino, somados ao erro, fecham o diagnóstico. `ss -tan state time-wait` conta e lista, e o `sysctl` mostra a faixa.",
        "TIME_WAIT em si é normal. O que aponta o problema é o **ritmo de abertura** de conexões para o mesmo destino.",
      ],
      changes: ["timewait 28232 no ss -s"],
      metrics: m24("0", "28.232"),
      terminal: { suggest: ["ss -s", SS_TW_COUNT, RANGE], outputs: { "ss -s": SS_S, [SS_TW_COUNT]: "28233", [RANGE]: "net.ipv4.ip_local_port_range = 32768\t60999" } },
      focus: ["ports", "tw"],
      stage: { mode: "iso", entities: cena24({ used: 100, usedStatus: "bad", usedBadge: "faixa cheia", tw: 100, twStatus: "bad", twBadge: "28.232", app: "bad" }), links: LINKS24 },
    },
    {
      kind: "solucao",
      nav: "Reusar conexões",
      title: "A cura: reaproveitar conexões",
      body: [
        "Com **pool e keep-alive** (aula 23), as mesmas 500 chamadas por segundo passam por algumas dezenas de conexões que ficam abertas. Quase nenhuma porta é consumida, e quase nada vai para TIME_WAIT.",
        "É a única cura que ataca a causa: a conexão por chamada. Também derruba a latência (aula 23).",
      ],
      changes: ["500 conexões/s → poucas conexões fixas", "TIME_WAIT: ~0"],
      metrics: m24("28.212", "0", { id: "con", label: "Conexões abertas", value: 20, tone: "ok" }),
      focus: ["app", "ports", "api"],
      stage: { mode: "iso", entities: cena24({ used: 1, usedStatus: "ok", usedBadge: "20 conexões", tw: 0, app: "ok", appLabel: "serviço + pool" }), links: LINKS24, flows: [flow("app", "api", 4, { via: ["ports"], kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Outras alavancas",
      title: "Se não dá para reaproveitar, há alavancas",
      body: [
        "Mais **IPs de destino ou de origem** multiplicam o espaço (o limite é por quádrupla). Ampliar `ip_local_port_range` adia o teto. `tcp_tw_reuse=1` reaproveita TIME_WAIT em conexões de **saída**, seguro graças aos timestamps (o padrão `2` vale só para loopback).",
        "São paliativos: nenhum substitui o reaproveitamento.",
      ],
      callout: { kind: "atencao", text: "tcp_tw_recycle foi REMOVIDO no Linux 4.12: quebrava clientes atrás de NAT. Nunca o recomende." },
      changes: ["+ API B: mais destinos, mais espaço"],
      extra: [tuneGrid],
      focus: ["ports", "api", "api2"],
      stage: { mode: "iso", entities: cena24({ api2: true, used: 1, usedStatus: "ok", usedBadge: "20 conexões", app: "ok", appLabel: "serviço + pool" }), links: [...LINKS24, link("ports", "api2")], flows: [flow("app", "api", 2, { via: ["ports"], kind: "data" }), flow("app", "api2", 2, { via: ["ports"], kind: "data" })] },
    },
    {
      kind: "tradeoff",
      nav: "O que não é cura",
      title: "SO_REUSEADDR e o NAT Gateway",
      body: [
        "**`SO_REUSEADDR`** serve para o `bind` do **servidor** reiniciar na mesma porta com conexões antigas em TIME_WAIT. Não libera portas efêmeras de cliente. O TIME_WAIT de 60 s também é fixo no Linux; não há `sysctl` para encurtá-lo.",
        "Na nuvem, o NAT Gateway tem o seu limite por destino (aula 8): o mesmo erro vira timeout de conexão, e a cura é a mesma.",
      ],
      callout: { kind: "bom-saber", text: "Reduzir tcp_fin_timeout não encurta o TIME_WAIT: ele controla o FIN_WAIT_2." },
      changes: ["TIME_WAIT: fixo em 60 s"],
      metrics: m24("28.212", "0", { id: "tw", label: "TIME_WAIT", value: "60 s fixos" }),
      focus: ["tw", "ports"],
      stage: { mode: "iso", entities: cena24({ used: 1, usedStatus: "ok", tw: 10, twStatus: "warn", twBadge: "60 s fixo", app: "ok", appLabel: "serviço + pool" }), links: LINKS24 },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "28 mil portas, por destino, presas por 60 s",
      body: [
        "Faixa padrão **32768 a 60999** (28.232), por quádrupla. Quem fecha primeiro fica 60 s em **TIME_WAIT**. Uma conexão por chamada a 500/s esgota a faixa em ~56 s: `Cannot assign requested address`.",
        "Diagnostique com `ss -s`. Cure **reaproveitando conexões**; mais IPs, faixa maior e `tcp_tw_reuse` são paliativos, e `tcp_tw_recycle` não existe mais.",
      ],
      changes: ["Faixa → TIME_WAIT → esgotamento → pool"],
      metrics: m24("28.212", "0", { id: "ok", label: "Conexões", value: "reaproveitadas", tone: "ok" }),
      focus: ["app", "ports", "api"],
      stage: { mode: "iso", entities: cena24({ used: 1, usedStatus: "ok", usedBadge: "20 conexões", app: "ok", appLabel: "serviço + pool" }), links: LINKS24, flows: [flow("app", "api", 2, { via: ["ports"], kind: "data" })] },
    },
  ],
};
