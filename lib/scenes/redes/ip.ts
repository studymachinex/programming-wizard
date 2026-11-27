/**
 * Cenas do módulo "IP: endereços, roteamento e NAT" da trilha Redes para Backend.
 * pacoteIp: camadas + grade do cabeçalho (pacote-ip-ttl-e-fragmentacao).
 * subredesECidr: iso + grade de máscara (subredes-e-cidr).
 * arpEIcmp: sequência, shell bash (arp-icmp-ping-traceroute).
 * roteamento: iso + tabela de rotas, shell bash (roteamento-e-gateway).
 * nat: iso + tabela de tradução, shell bash (nat-e-ip-publico).
 */
import type { IsoEntity, IsoLink, Layer, LayerStack, Metric, SceneDef, SceneStep, SeqLane, SeqMessage, SeqNote, Status } from "../types";
import type { GridPanel, Tone } from "@/lib/visualizers/types";
import { box, flow, link, users, zone } from "../kit/common";
import { andOctets, bin8, ipv4Checksum, maskOctets, maskStr, octets, pingOutput, rowXY, router } from "../kit/net";

// =====================================================================================
// Cena 4: o pacote IP (camadas + grade do cabeçalho)
// =====================================================================================

const SRC = "198.51.100.7";
const DST = "203.0.113.10";
const ID = 0x1c46;

type Hdr = { ttl: number; totalLength?: number; id?: number; flags?: "DF" | "MF" | "–"; offset?: number; src?: string; dst?: string };

const hex4 = (n: number) => "0x" + n.toString(16).padStart(4, "0");

/** Grade com os 12 campos do cabeçalho IPv4. `hi` destaca linhas; `tone` é a cor do destaque. */
function headerGrid(h: Hdr, hi: number[] = [], tone: Tone = "active", label = "Cabeçalho IPv4 (20 bytes)"): GridPanel {
  const totalLength = h.totalLength ?? 121;
  const id = h.id ?? ID;
  const flags = h.flags ?? "DF";
  const offset = h.offset ?? 0;
  const flagBits = flags === "DF" ? 0x4000 : flags === "MF" ? 0x2000 : 0;
  const src = h.src ?? SRC;
  const dst = h.dst ?? DST;
  const checksum = ipv4Checksum({ totalLength, id, flagsFragment: flagBits | offset, ttl: h.ttl, protocol: 6, src, dst });
  const rows: (string | number)[][] = [
    ["Versão", 4, 4],
    ["IHL", 4, "5 (20 B)"],
    ["DSCP / ECN", 8, "0x00"],
    ["Tamanho total", 16, totalLength],
    ["Identificação", 16, hex4(id)],
    ["Flags", 3, flags],
    ["Offset do fragmento", 13, offset],
    ["TTL", 8, h.ttl],
    ["Protocolo", 8, "6 (TCP)"],
    ["Checksum", 16, checksum],
    ["IP de origem", 32, src],
    ["IP de destino", 32, dst],
  ];
  return { kind: "grid", label, colHeaders: ["Campo", "Bits", "Valor"], rows, tones: hi.flatMap((r) => [0, 1, 2].map((c) => ({ r, c, tone }))) };
}

const R = { versao: 0, ihl: 1, total: 3, id: 4, flags: 5, offset: 6, ttl: 7, proto: 8, sum: 9, src: 10, dst: 11 };

const payload = (o: Partial<Layer> = {}): Layer => ({ id: "payload", label: "dados", sub: "TCP + HTTP · 101 B", tone: "mana", ...o });
const ipHdr = (ttl: number, o: Partial<Layer> = {}): Layer => ({
  id: "iph",
  label: "cabeçalho IP",
  sub: `TTL ${ttl} · checksum ${ipv4Checksum({ totalLength: 121, id: ID, flagsFragment: 0x4000, ttl, protocol: 6, src: SRC, dst: DST })}`,
  tone: "arcane",
  ...o,
});
const pkt = (id: string, label: string, layers: Layer[]): LayerStack => ({ id, label, orientation: "nested", layers });

const m4 = (ttl: number | string, size: string, frags: number | string, tone?: Metric["tone"]): Metric[] => [
  { id: "ttl", label: "TTL", value: ttl, tone },
  { id: "size", label: "Tamanho do pacote", value: size },
  { id: "frag", label: "Fragmentos", value: frags },
];

const fragLayers = (n: 1 | 2 | 3, status?: Status): Layer[] => {
  const spec = {
    1: { total: 1500, mf: 1, off: 0, data: "bytes 0–1479 · 1480 B" },
    2: { total: 1500, mf: 1, off: 185, data: "bytes 1480–2959 · 1480 B" },
    3: { total: 1040, mf: 0, off: 370, data: "bytes 2960–3979 · 1020 B" },
  }[n];
  return [
    { id: "iph", label: "cabeçalho IP", sub: `ID 0x7a3b · MF=${spec.mf} · offset ${spec.off} · total ${spec.total}`, tone: "arcane", status },
    { id: "payload", label: "dados", sub: spec.data, tone: "mana", status: status === "bad" ? "bad" : "muted" },
  ];
};

const FRAG_GRID: GridPanel = {
  kind: "grid",
  label: "Os 3 fragmentos (mesma Identificação 0x7a3b)",
  colHeaders: ["Fragmento", "Tamanho total", "Dados", "MF", "Offset"],
  rows: [
    ["1", 1500, 1480, 1, 0],
    ["2", 1500, 1480, 1, 185],
    ["3", 1040, 1020, 0, 370],
  ],
};

const PING_DF = [
  "PING 203.0.113.10 (203.0.113.10) 1472(1500) bytes of data.",
  "From 192.0.2.1 icmp_seq=1 Frag needed and DF set (mtu = 1400)",
  "",
  "--- 203.0.113.10 ping statistics ---",
  "1 packets transmitted, 0 received, +1 errors, 100% packet loss, time 0ms",
].join("\n");

export const pacoteIp: SceneDef = {
  title: "O pacote IP: cabeçalho, TTL e fragmentação",
  summary: "Abra um pacote IPv4 campo a campo, veja o TTL cair a cada salto e o que acontece quando o pacote não cabe no enlace.",
  goals: [
    { text: "Ler os campos do cabeçalho IPv4", step: 2 },
    { text: "Entender por que o TTL existe", step: 5 },
    { text: "Ver como a fragmentação funciona", step: 6 },
    { text: "Conhecer o DF e o Path MTU Discovery", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um pacote IP",
      title: "O envelope da internet",
      body: [
        "O pacote IPv4 tem um cabeçalho de **20 bytes** (no mínimo) seguido dos dados. Dentro dos dados vão o segmento TCP e a mensagem HTTP da aula anterior: no total, 121 bytes.",
        "O cabeçalho carrega só o que um roteador precisa para decidir: para onde vai, de onde veio, quanto tempo ainda vive e como foi cortado, se foi.",
      ],
      metrics: m4(64, "121 B", 1),
      extra: [headerGrid({ ttl: 64 })],
      stage: { mode: "layers", stacks: [pkt("p", "Pacote IPv4", [ipHdr(64), payload()])] },
    },
    {
      kind: "conceito",
      nav: "Endereços",
      title: "Origem e destino: 32 bits cada",
      body: [
        "Um endereço IPv4 tem 32 bits, escritos em 4 números de 0 a 255 (`203.0.113.10`). Isso dá cerca de 4,3 bilhões de endereços, que já não bastam. Dois remendos aliviaram: NAT (aula 8) e IPv6, com 128 bits.",
        "O roteador usa o **destino** para escolher a rota. A **origem** serve para o destino responder. Outros campos úteis: `Protocolo` diz quem recebe os dados (6 = TCP, 17 = UDP, 1 = ICMP) e `Tamanho total` vai até 65.535 bytes.",
      ],
      metrics: m4(64, "121 B", 1),
      extra: [headerGrid({ ttl: 64 }, [R.src, R.dst, R.proto])],
      stage: { mode: "layers", stacks: [pkt("p", "Pacote IPv4", [ipHdr(64), payload()])] },
    },
    {
      kind: "conceito",
      nav: "TTL cai",
      title: "O TTL cai a cada salto",
      body: [
        "O **TTL** (time to live) começa em 64 no Linux, 128 no Windows e 255 em muitos roteadores. Cada roteador que encaminha o pacote subtrai 1 e **recalcula o checksum**, porque o cabeçalho mudou.",
        "O roteador não calcula tempo nenhum: o nome é histórico. Na prática o TTL conta saltos.",
      ],
      callout: { kind: "chave", text: "TTL é um contador de saltos. Quando chega a zero, o pacote é descartado." },
      metrics: m4(62, "121 B", 1),
      extra: [headerGrid({ ttl: 62 }, [R.ttl, R.sum])],
      stage: {
        mode: "layers",
        stacks: [
          pkt("o", "Origem", [ipHdr(64), payload({ status: "muted" })]),
          pkt("r1", "Roteador 1", [ipHdr(63), payload({ status: "muted" })]),
          pkt("r2", "Roteador 2", [ipHdr(62, { status: "warn" }), payload({ status: "muted" })]),
        ],
        wires: [
          { from: "o", to: "r1" },
          { from: "r1", to: "r2" },
        ],
      },
    },
    {
      kind: "problema",
      nav: "Laço de rotas",
      title: "Por que um limite? Os laços de rota",
      body: [
        "Imagine que dois roteadores estejam mal configurados e cada um aponte para o outro como caminho ao destino. O pacote vai e volta entre eles, sem chegar a lugar nenhum, ocupando banda a cada volta.",
        "Sem o TTL ele circularia para sempre, e cada novo pacote engrossaria o laço até derrubar o enlace.",
      ],
      metrics: m4(1, "121 B", 1, "warn"),
      extra: [headerGrid({ ttl: 1 }, [R.ttl, R.sum], "compare")],
      stage: {
        mode: "layers",
        stacks: [
          pkt("l1", "R1 recebe · TTL 3", [ipHdr(3), payload({ status: "muted" })]),
          pkt("l2", "R2 recebe · TTL 2", [ipHdr(2), payload({ status: "muted" })]),
          pkt("l3", "R1 de novo · TTL 1", [ipHdr(1, { status: "warn" }), payload({ status: "muted" })]),
        ],
        wires: [
          { from: "l1", to: "l2", kind: "bad" },
          { from: "l2", to: "l3", kind: "bad" },
        ],
      },
    },
    {
      kind: "solucao",
      nav: "TTL chega a 0",
      title: "TTL zero: descartar e avisar",
      body: [
        "Ao subtrair 1 de um TTL que era 1, o R1 chega a 0. Ele **descarta o pacote** e devolve à origem uma mensagem **ICMP Time Exceeded** (tipo 11, código 0), com o cabeçalho IP original e os primeiros 8 bytes dos dados.",
        "A origem fica sabendo quem descartou: o endereço de origem do ICMP é o do R1. É exatamente essa mensagem que o `traceroute` usa (aula 6).",
      ],
      callout: { kind: "bom-saber", text: "O laço acabou depois de 3 passagens. O custo foi limitado pelo TTL inicial, não infinito." },
      metrics: m4(0, "121 B", 1, "bad"),
      extra: [headerGrid({ ttl: 0 }, [R.ttl], "bad")],
      stage: {
        mode: "layers",
        stacks: [
          pkt("l3", "R1 descarta o pacote", [ipHdr(0, { status: "bad" }), payload({ status: "muted" })]),
          pkt("icmp", "R1 avisa a origem", [
            { id: "ih", label: "IP", sub: `192.0.2.1 → ${SRC} · protocolo 1 (ICMP)`, tone: "arcane" },
            { id: "ic", label: "ICMP tipo 11, código 0", sub: "Time Exceeded in transit", tone: "rose", status: "new" },
            { id: "orig", label: "cabeçalho original + 8 B", sub: "para a origem identificar o pacote", tone: "zinc" },
          ]),
        ],
        wires: [{ from: "l3", to: "icmp", label: "ICMP", kind: "bad" }],
      },
    },
    {
      kind: "problema",
      nav: "MTU 1500",
      title: "E se o pacote não cabe no enlace?",
      body: [
        "Cada tipo de enlace tem um **MTU**, o maior pacote IP que aceita: 1500 bytes na Ethernet. Um pacote de 4000 bytes (20 de cabeçalho e 3980 de dados) não passa inteiro.",
        "Se o bit **DF** (don't fragment) estiver desligado, o roteador **fragmenta**: parte os dados em pedaços de até 1480 bytes (múltiplo de 8) e manda cada um com cabeçalho IP próprio.",
      ],
      metrics: m4(64, "4000 B", 3),
      extra: [FRAG_GRID],
      stage: {
        mode: "layers",
        stacks: [pkt("f1", "Fragmento 1", fragLayers(1)), pkt("f2", "Fragmento 2", fragLayers(2)), pkt("f3", "Fragmento 3", fragLayers(3))],
      },
    },
    {
      kind: "tradeoff",
      nav: "Remontagem",
      title: "Quem remonta, e o custo de perder um",
      body: [
        "Só o **destino** remonta, juntando os fragmentos pela mesma Identificação e pelo offset (contado em blocos de 8 bytes: 185 × 8 = 1480). O último é o que tem MF=0.",
        "Se um fragmento se perder, o destino espera um tempo (30 s no Linux) e descarta tudo, e o remetente reenvia o pacote inteiro. Um enlace com 1% de perda perde bem mais que 1% dos pacotes grandes.",
      ],
      callout: { kind: "atencao", text: "Fragmentação é cara e frágil: firewalls descartam fragmentos e a perda de um estraga o resto. Por isso se tenta evitá-la." },
      metrics: m4(64, "4000 B", "2 de 3", "bad"),
      extra: [FRAG_GRID],
      stage: {
        mode: "layers",
        stacks: [pkt("f1", "Fragmento 1", fragLayers(1)), pkt("f2", "Fragmento 2 · perdido", fragLayers(2, "bad")), pkt("f3", "Fragmento 3", fragLayers(3))],
      },
    },
    {
      kind: "solucao",
      nav: "DF e PMTUD",
      title: "DF ligado: descubra o MTU do caminho",
      body: [
        "O TCP moderno liga o DF e evita fragmentar. Se o pacote não couber, o roteador o descarta e devolve **ICMP tipo 3, código 4** (“fragmentation needed”) com o MTU do enlace, no exemplo 1400.",
        "A origem diminui o tamanho e tenta de novo: é o **Path MTU Discovery** (RFC 1191). Só funciona se esse ICMP não for bloqueado por firewall. Quando é, a conexão trava com pacotes grandes (aula 21).",
      ],
      metrics: m4(64, "1500 B", 0, "warn"),
      terminal: { suggest: ["ping -M do -s 1472 -c 1 203.0.113.10"], outputs: { "ping -M do -s 1472 -c 1 203.0.113.10": PING_DF } },
      extra: [headerGrid({ ttl: 64, totalLength: 1500, flags: "DF" }, [R.total, R.flags], "compare")],
      stage: {
        mode: "layers",
        stacks: [
          pkt("o", "Origem · 1500 B · DF", [{ id: "iph", label: "cabeçalho IP", sub: "DF=1 · total 1500", tone: "arcane" }, payload({ sub: "1480 B", status: "muted" })]),
          pkt("rt", "Roteador · enlace MTU 1400", [{ id: "iph", label: "cabeçalho IP", sub: "não cabe e não pode fragmentar", tone: "arcane", status: "bad" }, payload({ sub: "1480 B", status: "bad" })]),
          pkt("ic", "Aviso à origem", [
            { id: "ih", label: "IP", sub: "192.0.2.1 → origem", tone: "arcane" },
            { id: "ic", label: "ICMP tipo 3, código 4", sub: "Fragmentation needed · MTU 1400", tone: "rose", status: "new" },
          ]),
        ],
        wires: [
          { from: "o", to: "rt" },
          { from: "rt", to: "ic", kind: "bad" },
        ],
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que o cabeçalho IP resolve",
      body: [
        "O IP entrega o pacote de uma máquina a outra, sem garantia: sem confirmação, sem ordem. Cabe ao TCP, acima dele, resolver isso. O cabeçalho tem só o necessário: endereços, TTL, protocolo e controle de fragmentos.",
        "Lembre: TTL protege a rede de laços, DF e MTU definem o tamanho do pacote, e ICMP é o canal de aviso entre roteadores e origem.",
      ],
      changes: ["Pacote completo, TTL 64", "Os campos em uso"],
      metrics: m4(64, "121 B", 1),
      extra: [headerGrid({ ttl: 64 })],
      stage: { mode: "layers", stacks: [pkt("p", "Pacote IPv4", [ipHdr(64), payload()])] },
    },
  ],
};

// =====================================================================================
// Cena 5: sub-redes e CIDR (iso + grade de máscara bit a bit)
// =====================================================================================

const SUB_Z = 10; // elevação das sub-redes: sobre a espessura da VPC
const SUB_W = 3.4;
const SUB_D = 6.5;

function vpcZone(label = "VPC 10.0.0.0/16", status?: Status): IsoEntity {
  return zone("vpc", 0, 0, 11.6, 7.4, { label, tone: "sky", status });
}

function subnet(id: string, i: number, label: string, tone: Tone2): IsoEntity {
  return zone(id, 0.4 + i * (SUB_W + 0.3), 0.4, SUB_W, SUB_D, { z: SUB_Z, label, tone, dashed: true });
}
type Tone2 = "mana" | "rune" | "ember" | "arcane" | "rose";

const inSub = (id: string, parent: string, x: number, y: number, icon: "server" | "database" | "scale" | "router", label: string, o: { tone?: Tone2; status?: Status } = {}): IsoEntity =>
  box(id, x, y, icon, label, { parent, size: "sm", tone: o.tone ?? "arcane", status: o.status });

const pubSubnet = (): IsoEntity[] => [
  subnet("pub", 0, "pública 10.0.1.0/24", "mana"),
  inSub("alb", "pub", 1.7, 1.1, "scale", "balanceador", { tone: "mana" }),
  inSub("nat", "pub", 1.7, 3.9, "router", "NAT gw", { tone: "mana" }),
];
const appSubnet = (hi?: Status): IsoEntity[] => [
  subnet("app", 1, "app 10.0.2.0/24", "rune"),
  inSub("app1", "app", 1.7, 1.1, "server", "app-1", { tone: "rune", status: hi }),
  inSub("app2", "app", 1.7, 3.9, "server", "app-2", { tone: "rune" }),
];
const dbSubnet = (): IsoEntity[] => [subnet("db", 2, "dados 10.0.3.0/24", "ember"), inSub("db1", "db", 1.7, 2.5, "database", "postgres", { tone: "ember" })];

const octGrid = (rows: { name: string; ip: number[]; tones?: Tone[] }[], label: string): GridPanel => ({
  kind: "grid",
  label,
  colHeaders: ["", "octeto 1", "octeto 2", "octeto 3", "octeto 4"],
  rows: rows.map((r) => [r.name, ...r.ip.map(bin8)]),
  tones: rows.flatMap((r, ri) => (r.tones ?? []).map((tone, ci) => ({ r: ri, c: ci + 1, tone }))),
});

/** Tons por octeto para um prefixo: octetos inteiros de rede, o octeto que divide e os de host. */
const netTones = (prefix: number): Tone[] => [0, 1, 2, 3].map((i) => (prefix >= (i + 1) * 8 ? "done" : prefix > i * 8 ? "compare" : "default"));

const m5 = (cidr: string, addrs: string, hosts: string): Metric[] => [
  { id: "cidr", label: "Bloco", value: cidr },
  { id: "addr", label: "Endereços", value: addrs },
  { id: "hosts", label: "Hosts úteis", value: hosts },
];

const IP_BR = ["lo               UNKNOWN        127.0.0.1/8", "eth0             UP             10.0.2.10/24"].join("\n");
const IP_ROUTE_APP = ["default via 10.0.2.1 dev eth0 proto dhcp src 10.0.2.10 metric 100", "10.0.2.0/24 dev eth0 proto kernel scope link src 10.0.2.10 metric 100"].join("\n");

const PREFIX_GRID: GridPanel = {
  kind: "grid",
  label: "Quantos endereços cabem em cada prefixo",
  colHeaders: ["Prefixo", "Máscara", "Endereços", "Hosts úteis"],
  rows: [
    ["/16", maskStr(16), "65.536", "65.534"],
    ["/24", maskStr(24), "256", "254"],
    ["/25", maskStr(25), "128", "126"],
    ["/26", maskStr(26), "64", "62"],
    ["/27", maskStr(27), "32", "30"],
    ["/28", maskStr(28), "16", "14"],
    ["/30", maskStr(30), "4", "2"],
    ["/31", maskStr(31), "2", "2 (ponto a ponto)"],
    ["/32", maskStr(32), "1", "1 (um host)"],
  ],
  tones: [{ r: 1, c: 0, tone: "active" }, { r: 1, c: 1, tone: "active" }, { r: 1, c: 2, tone: "active" }, { r: 1, c: 3, tone: "active" }],
};

const PRIVATE_GRID: GridPanel = {
  kind: "grid",
  label: "Faixas reservadas",
  colHeaders: ["Bloco", "Endereços", "Uso"],
  rows: [
    ["10.0.0.0/8", "16,7 milhões", "RFC 1918: privado"],
    ["172.16.0.0/12", "1 milhão", "RFC 1918: privado"],
    ["192.168.0.0/16", "65.536", "RFC 1918: privado"],
    ["100.64.0.0/10", "4,2 milhões", "RFC 6598: CGNAT"],
    ["169.254.0.0/16", "65.536", "RFC 3927: link-local"],
    ["127.0.0.0/8", "16,7 milhões", "loopback"],
  ],
  tones: [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c, tone: "done" as const }))),
};

export const subredesECidr: SceneDef = {
  title: "Sub-redes e CIDR: cortando uma VPC",
  summary: "Divida um bloco 10.0.0.0/16 em sub-redes /24, veja a máscara trabalhar bit a bit e entenda os IPs privados.",
  shell: "bash",
  goals: [
    { text: "Ler a notação CIDR (/16, /24)", step: 2 },
    { text: "Aplicar a máscara bit a bit (AND)", step: 4 },
    { text: "Dizer se dois hosts estão na mesma sub-rede", step: 5 },
    { text: "Conhecer os blocos privados e a sobreposição", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um bloco",
      title: "A empresa recebe um bloco de endereços",
      body: [
        "Ao criar uma rede privada na nuvem (uma **VPC**), você escolhe o bloco de endereços dela. Aqui escolhemos `10.0.0.0/16`: um intervalo reservado para uso privado, que ninguém roteia na internet.",
        "Esse bloco é grande demais para ficar plano. Precisamos dividi-lo em pedaços menores e dar um papel a cada um.",
      ],
      metrics: m5("10.0.0.0/16", "65.536", "65.534"),
      stage: { mode: "iso", entities: [vpcZone()] },
    },
    {
      kind: "conceito",
      nav: "O prefixo",
      title: "O que significa /16",
      body: [
        "A notação **CIDR** (`10.0.0.0/16`) diz quantos bits à esquerda identificam a **rede**: aqui, os 16 primeiros. Os 16 restantes numeram os **hosts** dentro dela: 2¹⁶ = 65.536 endereços.",
        "A mesma ideia em máscara: `255.255.0.0` é 16 bits em 1 seguidos de 16 em 0. Quanto **maior** o prefixo, **menor** a rede.",
      ],
      metrics: m5("10.0.0.0/16", "65.536", "65.534"),
      extra: [
        octGrid(
          [
            { name: "endereço", ip: octets("10.0.0.0"), tones: netTones(16) },
            { name: "máscara /16", ip: maskOctets(16), tones: netTones(16) },
          ],
          "Em verde, os bits de rede; em branco, os de host",
        ),
      ],
      stage: { mode: "iso", entities: [vpcZone()] },
    },
    {
      kind: "solucao",
      nav: "Três /24",
      title: "Cortando em sub-redes /24",
      body: [
        "Cada /24 tem 8 bits de host: 256 endereços. Criamos três: `10.0.1.0/24` para o que fala com a internet, `10.0.2.0/24` para as aplicações e `10.0.3.0/24` para o banco.",
        "Em cada /24, o primeiro endereço identifica a rede (`.0`) e o último é o broadcast (`.255`). Sobram **254 hosts úteis**. Na AWS, 5 endereços de cada sub-rede ficam reservados (os 4 primeiros e o último), e sobram 251.",
      ],
      metrics: m5("10.0.2.0/24", "256", "254"),
      terminal: { suggest: ["ip -br -4 addr", "ip route"], outputs: { "ip -br -4 addr": IP_BR, "ip route": IP_ROUTE_APP } },
      extra: [
        octGrid(
          [
            { name: "10.0.2.0/24", ip: octets("10.0.2.0"), tones: netTones(24) },
            { name: "máscara /24", ip: maskOctets(24), tones: netTones(24) },
          ],
          "Sub-rede de aplicação",
        ),
      ],
      stage: { mode: "iso", entities: [vpcZone(), ...pubSubnet(), ...appSubnet(), ...dbSubnet()] },
    },
    {
      kind: "conceito",
      nav: "Máscara (AND)",
      title: "Como o host descobre a própria rede",
      body: [
        "Para saber a que rede um endereço pertence, a máquina faz um **AND bit a bit** do IP com a máscara. Onde a máscara tem 1, o bit do IP é mantido; onde tem 0, vira 0.",
        "`10.0.2.37` AND `255.255.255.0` dá `10.0.2.0`. O resultado é o **endereço de rede**. O broadcast é o contrário: os bits de host todos em 1 (`10.0.2.255`).",
      ],
      callout: { kind: "chave", text: "Dois hosts estão na mesma sub-rede quando (IP AND máscara) dá o mesmo resultado para os dois." },
      metrics: m5("10.0.2.37/24", "256", "254"),
      extra: [
        octGrid(
          [
            { name: "IP 10.0.2.37", ip: octets("10.0.2.37"), tones: netTones(24) },
            { name: "máscara", ip: maskOctets(24), tones: netTones(24) },
            { name: "AND = rede", ip: andOctets(octets("10.0.2.37"), maskOctets(24)), tones: netTones(24) },
          ],
          "Cada bit da máscara filtra o bit do endereço",
        ),
      ],
      stage: { mode: "iso", entities: [vpcZone(), ...pubSubnet().map(dimmed), ...appSubnet("hi"), ...dbSubnet().map(dimmed)] },
    },
    {
      kind: "conceito",
      nav: "Mesma rede?",
      title: "Mesma sub-rede: conversa direta. Outra: gateway",
      body: [
        "`app-1` (`10.0.2.10`) fala com `app-2` (`10.0.2.200`): o AND dá `10.0.2.0` nos dois. Mesma rede, então o quadro vai direto ao MAC do vizinho, por ARP e switch.",
        "Com o `postgres` (`10.0.3.15`) o AND dá `10.0.3.0`: outra rede. `app-1` não tenta falar direto; entrega ao **gateway padrão** (`10.0.2.1`), que roteia para a sub-rede de dados.",
      ],
      metrics: m5("/24", "256", "254"),
      terminal: { suggest: ["ip route"], outputs: { "ip route": IP_ROUTE_APP } },
      extra: [
        {
          kind: "grid",
          label: "IP AND máscara /24",
          colHeaders: ["Host", "IP", "Rede"],
          rows: [
            ["app-1", "10.0.2.10", "10.0.2.0"],
            ["app-2", "10.0.2.200", "10.0.2.0"],
            ["postgres", "10.0.3.15", "10.0.3.0"],
          ],
          tones: [{ r: 0, c: 2, tone: "done" }, { r: 1, c: 2, tone: "done" }, { r: 2, c: 2, tone: "swap" }],
        },
      ],
      stage: {
        mode: "iso",
        entities: [vpcZone(), ...pubSubnet().map(dimmed), ...appSubnet(), ...dbSubnet()],
        flows: [flow("app1", "app2", 2), flow("app1", "db1", 1, { kind: "data" })],
      },
    },
    {
      kind: "conceito",
      nav: "Tamanhos",
      title: "Escolher o prefixo é escolher o tamanho",
      body: [
        "Cada bit a mais no prefixo **divide a rede ao meio**. /24 tem 254 hosts; /25, 126; /26, 62; /27, 30; /28, 14. A fórmula de hosts úteis é 2^(32 − prefixo) − 2.",
        "Dois casos especiais: `/31` tem 2 endereços e ambos são usáveis em enlaces ponto a ponto (RFC 3021), e `/32` é um único host (rota para uma máquina só).",
      ],
      metrics: m5("/24 → /28", "256 → 16", "254 → 14"),
      extra: [PREFIX_GRID],
      stage: { mode: "iso", entities: [vpcZone(), ...pubSubnet(), ...appSubnet(), ...dbSubnet()] },
    },
    {
      kind: "conceito",
      nav: "IPs privados",
      title: "Blocos privados e a ponte com a internet",
      body: [
        "A **RFC 1918** reservou três faixas para redes privadas: `10.0.0.0/8`, `172.16.0.0/12` e `192.168.0.0/16`. Roteadores da internet descartam pacotes com esses endereços, então qualquer empresa pode reutilizá-los.",
        "Para sair, um recurso privado passa por um **NAT gateway** (aula 8). Também existem `100.64.0.0/10` (CGNAT, das operadoras) e `169.254.0.0/16` (endereço automático quando o DHCP falha).",
      ],
      metrics: m5("RFC 1918", "3 blocos", "privados"),
      extra: [PRIVATE_GRID],
      stage: {
        mode: "iso",
        entities: [users("web", -3, 3, 3, "internet"), vpcZone(), ...pubSubnet(), ...appSubnet().map(dimmed), ...dbSubnet().map(dimmed)],
        flows: [flow("web", "alb", 2, { kind: "data" })],
      },
    },
    {
      kind: "problema",
      nav: "Blocos iguais",
      title: "O erro caro: dois blocos que se sobrepõem",
      body: [
        "A matriz usa `10.0.0.0/16`. A filial também escolheu `10.0.0.0/16`. Na hora de ligar as duas por VPN ou peering, um destino `10.0.2.10` pode estar em qualquer uma: o roteador não sabe para que lado mandar.",
        "Redes sobrepostas não podem ser conectadas diretamente. Renumerar uma rede em produção é doloroso, então planeje os blocos antes de criar a primeira.",
      ],
      callout: { kind: "atencao", text: "Reserve uma tabela de blocos da empresa (um por VPC, por região, por filial) antes de criar qualquer rede." },
      metrics: m5("10.0.0.0/16 ×2", "sobreposto", "–"),
      focus: ["vpc", "vpc-b"],
      stage: {
        mode: "iso",
        entities: [
          zone("vpc", 0, 0, 4, 4, { label: "VPC matriz 10.0.0.0/16", tone: "sky", status: "bad" }),
          zone("vpc-b", 4, -4, 4, 4, { label: "VPC filial 10.0.0.0/16", tone: "sky", status: "bad" }),
          box("a1", 2, 2, "server", "10.0.2.10", { parent: "vpc", size: "sm", tone: "rune" }),
          box("b1", 2, 2, "server", "10.0.2.10", { parent: "vpc-b", size: "sm", tone: "rune" }),
        ],
        links: [link("vpc", "vpc-b", { tone: "rose", label: "VPN: qual 10.0.2.10?" })],
      },
    },
    {
      kind: "solucao",
      nav: "Blocos distintos",
      title: "A saída: blocos distintos desde o início",
      body: [
        "A filial passa a usar `10.1.0.0/16`. Agora cada destino tem uma única resposta: `10.0.2.10` é da matriz, `10.1.2.10` é da filial, e a rota na VPN é simples de escrever.",
        "Regra prática: um `/16` por VPC, tirado de um mesmo `/8` privado, e deixe espaço para crescer. Um `/24` por camada e por zona de disponibilidade costuma bastar.",
      ],
      metrics: m5("10.0 e 10.1", "distintos", "–"),
      stage: {
        mode: "iso",
        entities: [
          zone("vpc", 0, 0, 4, 4, { label: "VPC matriz 10.0.0.0/16", tone: "sky" }),
          zone("vpc-b", 6, 0, 4, 4, { label: "VPC filial 10.1.0.0/16", tone: "sky", status: "new" }),
          box("a1", 2, 2, "server", "10.0.2.10", { parent: "vpc", size: "sm", tone: "rune" }),
          box("b1", 2, 2, "server", "10.1.2.10", { parent: "vpc-b", size: "sm", tone: "rune" }),
        ],
        links: [link("vpc", "vpc-b", { tone: "mana", label: "VPN" })],
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "CIDR em uma tela",
      body: [
        "Prefixo = bits de rede. Máscara AND IP = endereço de rede. Mesma rede, conversa direta; rede diferente, gateway. Hosts úteis = 2^(32 − prefixo) − 2 (com as exceções de /31 e /32).",
        "Use blocos RFC 1918, um bloco distinto por rede, e uma sub-rede por papel (pública, aplicação, dados).",
      ],
      changes: ["Três sub-redes /24", "Cada papel isolado"],
      metrics: m5("/16 → 3 × /24", "65.536", "–"),
      stage: { mode: "iso", entities: [vpcZone(), ...pubSubnet(), ...appSubnet(), ...dbSubnet()] },
    },
  ],
};

/** Esmaece uma entidade (sub-rede ou caixa) para dar foco ao resto. */
function dimmed(e: IsoEntity): IsoEntity {
  return e.type === "users" ? e : { ...e, status: "muted" };
}

// =====================================================================================
// Cena 6: ARP, ICMP, ping e traceroute (sequência)
// =====================================================================================

const LANES6: SeqLane[] = [
  { id: "nb", label: "Notebook 192.168.0.23", icon: "globe", tone: "mana" },
  { id: "gw", label: "Gateway 192.168.0.1", icon: "router", tone: "ember" },
  { id: "isp", label: "Roteador 198.51.100.1", icon: "router", tone: "sky" },
  { id: "bb", label: "Roteador 203.0.113.1", icon: "router", tone: "violet" },
  { id: "srv", label: "Servidor 203.0.113.10", icon: "server", tone: "arcane" },
];
const seq6 = (messages: SeqMessage[], extra: Partial<Extract<SceneStep["stage"], { mode: "sequence" }>> = {}): SceneStep["stage"] => ({ mode: "sequence", lanes: LANES6, messages, ...extra });
const msg = (id: string, from: string, to: string, at: number, label: string, o: Partial<SeqMessage> = {}): SeqMessage => ({ id, from, to, at, label, ...o });

const GW_MAC = "a4:91:b1:5c:2e:07";
const A_REQ = msg("a1", "nb", "gw", 0, "ARP who-has 192.168.0.1", { detail: "tell 192.168.0.23 · dst ff:ff:ff:ff:ff:ff", tone: "ctrl" });
const A_REP = msg("a2", "gw", "nb", 3, `ARP reply: is-at ${GW_MAC}`, { detail: "unicast para 3c:22:fb:8a:51:0e", tone: "ok" });

const echoReq = (): SeqMessage[] => [
  msg("e1", "nb", "gw", 0, "echo request · ttl=64"),
  msg("e2", "gw", "isp", 1, "ttl=63"),
  msg("e3", "isp", "bb", 2, "ttl=62"),
  msg("e4", "bb", "srv", 3, "ttl=61"),
];
const echoRep = (): SeqMessage[] => [
  msg("r1", "srv", "bb", 4, "echo reply · ttl=64", { tone: "ok" }),
  msg("r2", "bb", "isp", 5, "ttl=63", { tone: "ok" }),
  msg("r3", "isp", "gw", 6, "ttl=62", { tone: "ok" }),
  msg("r4", "gw", "nb", 7, "ttl=61", { tone: "ok" }),
];

/** Uma rodada de traceroute com TTL = n: n saltos de ida e a resposta ICMP voltando. */
function probe(n: 1 | 2 | 3, o: { silent?: boolean } = {}): { messages: SeqMessage[]; notes: SeqNote[]; lastAt: number } {
  const lanes = ["nb", "gw", "isp", "bb"];
  const messages: SeqMessage[] = [];
  for (let i = 0; i < n; i++) messages.push(msg(`p${i}`, lanes[i], lanes[i + 1], i, i === 0 ? `UDP :33434 · ttl=${n}` : `ttl=${n - i}`));
  const dead = lanes[n];
  if (!o.silent) {
    for (let i = n; i > 0; i--) {
      const at = n + (n - i);
      messages.push(msg(`t${i}`, lanes[i], lanes[i - 1], at, i === n ? "ICMP Time Exceeded (11/0)" : "ICMP Time Exceeded", { tone: "bad" }));
    }
  }
  return {
    messages,
    notes: [{ lane: dead, at: n, text: o.silent ? "descarta e não responde" : "ttl 1 → 0: descarta", tone: o.silent ? "warn" : "bad" }],
    lastAt: n + n - 1,
  };
}

const TR_HEAD = "traceroute to 203.0.113.10 (203.0.113.10), 30 hops max, 60 byte packets";
const H1 = " 1  192.168.0.1  2.114 ms  1.987 ms  2.203 ms";
const H2 = " 2  198.51.100.1  11.804 ms  11.652 ms  12.011 ms";
const H3 = " 3  203.0.113.1  33.215 ms  33.610 ms  33.480 ms";
const H4 = " 4  203.0.113.10  34.102 ms  33.987 ms  34.421 ms";
const trHead = (max: number) => `traceroute to 203.0.113.10 (203.0.113.10), ${max} hops max, 60 byte packets`;
const TR_FULL = [TR_HEAD, H1, H2, H3, H4].join("\n");
const TR_SILENT = [TR_HEAD, H1, " 2  * * *", H3, H4].join("\n");

const ARP_N = ["Address                  HWtype  HWaddress           Flags Mask            Iface", `192.168.0.1              ether   ${GW_MAC}   C                     wlan0`].join("\n");
const IP_NEIGH = `192.168.0.1 dev wlan0 lladdr ${GW_MAC} REACHABLE`;
const ROUTE_GET = ["203.0.113.10 via 192.168.0.1 dev wlan0 src 192.168.0.23 uid 1000", "    cache"].join("\n");
const PING3 = pingOutput({ host: "203.0.113.10", ip: "203.0.113.10", ttl: 61, times: [34.1, 33.9, 34.4] });

const m6 = (a: string, b: string, c?: Metric): Metric[] => [{ id: "a", label: "Mensagem", value: a }, { id: "b", label: "Destino do quadro", value: b }, ...(c ? [c] : [])];

export const arpEIcmp: SceneDef = {
  title: "ARP, ICMP, ping e traceroute",
  summary: "Descubra o MAC do gateway com ARP, meça o caminho com ping e mapeie cada salto com o TTL do traceroute.",
  shell: "bash",
  goals: [
    { text: "Entender por que o ARP existe", step: 3 },
    { text: "Ler o ping: TTL e RTT", step: 4 },
    { text: "Explicar como o traceroute descobre os saltos", step: 7 },
    { text: "Interpretar um * * * sem entrar em pânico", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "ping 203.0.113.10",
      title: "Você roda ping 203.0.113.10",
      body: [
        "O notebook precisa mandar um pacote IP para `203.0.113.10`. Pela tabela de rotas, esse endereço não é da rede local: o próximo salto é o gateway `192.168.0.1`.",
        "Mas quadros Ethernet são entregues por **MAC**, não por IP. O notebook conhece o IP do gateway, não o MAC. Precisa descobrir.",
      ],
      metrics: m6("–", "MAC do gateway?"),
      terminal: { suggest: ["ip route get 203.0.113.10"], outputs: { "ip route get 203.0.113.10": ROUTE_GET } },
      stage: seq6([], { notes: [{ lane: "nb", at: 0, text: "dest. fora da rede: próximo salto 192.168.0.1, MAC desconhecido", tone: "warn" }] }),
    },
    {
      kind: "conceito",
      nav: "ARP request",
      title: "ARP: quem tem o 192.168.0.1?",
      body: [
        "O **ARP** (Address Resolution Protocol) resolve IP em MAC. O notebook manda um quadro em **broadcast**, com destino `ff:ff:ff:ff:ff:ff`: “quem tem o 192.168.0.1? Responda a 192.168.0.23”.",
        "Todos da rede local recebem a pergunta. Quase todos a ignoram.",
      ],
      metrics: m6("ARP request", "ff:ff:ff:ff:ff:ff"),
      stage: seq6([A_REQ]),
    },
    {
      kind: "conceito",
      nav: "ARP reply",
      title: "O dono responde, em unicast",
      body: [
        "O gateway reconhece o próprio IP e responde **direto ao MAC do notebook** (unicast), dizendo `192.168.0.1 is-at a4:91:b1:5c:2e:07`. Não há motivo para incomodar a rede inteira de novo.",
        "O notebook guarda o par IP→MAC num **cache ARP** por algumas dezenas de segundos. As próximas mensagens ao gateway já saem sem perguntar.",
      ],
      metrics: m6("ARP reply", "unicast"),
      terminal: { suggest: ["arp -n", "ip neigh"], outputs: { "arp -n": ARP_N, "ip neigh": IP_NEIGH } },
      stage: seq6([A_REQ, A_REP], { notes: [{ lane: "nb", at: 4, text: "cache ARP: 192.168.0.1 → a4:91:…", tone: "ok" }] }),
    },
    {
      kind: "solucao",
      nav: "Ping",
      title: "O ping cruza a rede",
      body: [
        "Agora o **echo request** (ICMP tipo 8) sai com TTL 64. Cada roteador subtrai 1: ao chegar ao servidor o TTL é 61, o que significa **3 roteadores** no caminho.",
        "O servidor responde com **echo reply** (tipo 0), que também faz o caminho de volta e chega com TTL 61. O `ping` mede o RTT, o tempo da ida e volta: cerca de 34 ms.",
      ],
      callout: { kind: "bom-saber", text: "O ttl que o ping mostra é o da resposta: 64 (inicial do servidor) menos os roteadores do caminho de volta." },
      metrics: m6("ICMP echo", GW_MAC, { id: "rtt", label: "RTT", value: "≈ 34 ms", tone: "ok" }),
      terminal: { suggest: ["ping -c 3 203.0.113.10"], outputs: { "ping -c 3 203.0.113.10": PING3 } },
      stage: seq6([...echoReq(), ...echoRep()], { brackets: [{ fromAt: 0, toAt: 7, label: "RTT ≈ 34 ms" }] }),
    },
    {
      kind: "conceito",
      nav: "TTL 1",
      title: "Traceroute: um TTL de cada vez",
      body: [
        "Como descobrir **quais** são os roteadores? O `traceroute` manda sondas com TTL crescente. Com TTL=1, o primeiro roteador subtrai 1, chega a 0, descarta e responde **ICMP Time Exceeded**.",
        "O endereço de origem dessa resposta é o do roteador: primeiro salto descoberto, `192.168.0.1`, em cerca de 2 ms.",
      ],
      metrics: m6("UDP ttl=1", "gateway", { id: "hop", label: "Salto", value: "1" }),
      terminal: { suggest: ["traceroute -n -m 1 203.0.113.10"], outputs: { "traceroute -n -m 1 203.0.113.10": [trHead(1), H1].join("\n") } },
      stage: seq6(probe(1).messages, { notes: probe(1).notes }),
    },
    {
      kind: "conceito",
      nav: "TTL 2",
      title: "TTL 2: o segundo salto aparece",
      body: [
        "Com TTL=2, o gateway subtrai 1 e encaminha; o segundo roteador chega a 0 e responde. A sonda passa pelo primeiro sem ser notada e denuncia o segundo.",
        "O traceroute manda três sondas por salto (por isso são três tempos por linha). A diferença de RTT entre saltos mostra onde está o trecho lento.",
      ],
      metrics: m6("UDP ttl=2", "gateway", { id: "hop", label: "Salto", value: "2" }),
      terminal: { suggest: ["traceroute -n -m 2 203.0.113.10"], outputs: { "traceroute -n -m 2 203.0.113.10": [trHead(2), H1, H2].join("\n") } },
      stage: seq6(probe(2).messages, { notes: probe(2).notes }),
    },
    {
      kind: "conceito",
      nav: "TTL 3",
      title: "TTL 3: o último roteador",
      body: [
        "Com TTL=3 a sonda alcança o terceiro roteador, que expira e responde com o endereço dele, `203.0.113.1`: o gateway da rede do servidor. RTT de 33 ms.",
        "Cada resposta ICMP volta pelo caminho inverso, e por isso a linha de cada salto inclui a ida e a volta até ele.",
      ],
      metrics: m6("UDP ttl=3", "gateway", { id: "hop", label: "Salto", value: "3" }),
      terminal: { suggest: ["traceroute -n -m 3 203.0.113.10"], outputs: { "traceroute -n -m 3 203.0.113.10": [trHead(3), H1, H2, H3].join("\n") } },
      stage: seq6(probe(3).messages, { notes: probe(3).notes }),
    },
    {
      kind: "solucao",
      nav: "TTL 4: chegou",
      title: "TTL 4: chega ao servidor",
      body: [
        "Com TTL=4, a sonda chega ao servidor com TTL 1, que não é descartado porque o servidor é o destino. O traceroute usa uma **porta UDP alta e improvável** (33434 em diante), que ninguém escuta.",
        "O servidor responde **ICMP Port Unreachable** (tipo 3, código 3): é o sinal de “cheguei”. O traceroute para ali. A saída completa tem 4 linhas: 3 roteadores e o destino.",
      ],
      metrics: m6("UDP ttl=4", "gateway", { id: "hop", label: "Salto", value: "4 (destino)" }),
      terminal: { suggest: ["traceroute -n 203.0.113.10"], outputs: { "traceroute -n 203.0.113.10": TR_FULL } },
      stage: seq6(
        [
          msg("q0", "nb", "gw", 0, "UDP :33434 · ttl=4"),
          msg("q1", "gw", "isp", 1, "ttl=3"),
          msg("q2", "isp", "bb", 2, "ttl=2"),
          msg("q3", "bb", "srv", 3, "ttl=1"),
          msg("u4", "srv", "bb", 4, "ICMP Port Unreachable (3/3)", { tone: "ok" }),
          msg("u3", "bb", "isp", 5, "ICMP Port Unreachable", { tone: "ok" }),
          msg("u2", "isp", "gw", 6, "ICMP Port Unreachable", { tone: "ok" }),
          msg("u1", "gw", "nb", 7, "ICMP Port Unreachable", { tone: "ok" }),
        ],
        { notes: [{ lane: "srv", at: 3, text: "ninguém na porta 33434", tone: "info" }] },
      ),
    },
    {
      kind: "tradeoff",
      nav: "* * *",
      title: "E quando aparece * * *?",
      body: [
        "Alguns roteadores descartam o pacote, mas **não respondem** o ICMP, ou limitam a taxa de respostas. O traceroute espera 3 s por sonda e imprime `* * *`. O tráfego real pode passar normalmente por ali.",
        "Mesma lição para o `ping`: firewalls costumam bloquear ICMP. Um ping sem resposta **não prova** que o servidor caiu. Teste a porta de verdade (`curl`, `nc`) antes de concluir.",
      ],
      callout: { kind: "atencao", text: "Se o salto seguinte ao * * * responde, o caminho funciona. Só um * * * até o fim indica corte ou filtro." },
      metrics: m6("sem resposta", "–", { id: "hop", label: "Salto 2", value: "* * *", tone: "warn" }),
      terminal: { suggest: ["traceroute -n 203.0.113.10"], outputs: { "traceroute -n 203.0.113.10": TR_SILENT } },
      stage: seq6(probe(2, { silent: true }).messages, { notes: probe(2, { silent: true }).notes, brackets: [{ fromAt: 1, toAt: 3, label: "timeout 3 s" }] }),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Três ferramentas, um truque",
      body: [
        "**ARP** liga IP a MAC dentro da rede local (broadcast na pergunta, unicast na resposta). **Ping** usa ICMP echo para medir alcance e RTT. **Traceroute** usa o TTL e o ICMP Time Exceeded para listar os roteadores.",
        "ICMP é o canal de controle do IP. Nunca o bloqueie por inteiro: sem ele, o Path MTU Discovery e vários diagnósticos param de funcionar.",
      ],
      changes: ["Caminho completo", "ARP, ping e traceroute lado a lado"],
      metrics: m6("resumo", "–"),
      terminal: { suggest: ["traceroute -n 203.0.113.10", "arp -n"], outputs: { "traceroute -n 203.0.113.10": TR_FULL, "arp -n": ARP_N } },
      stage: seq6([A_REQ, A_REP, ...echoReq().map((m) => ({ ...m, at: m.at + 5 })), ...echoRep().map((m) => ({ ...m, at: m.at + 5 }))], {
        laneState: { nb: { text: "ARP + ping + traceroute", tone: "info" }, gw: { text: "vizinho ARP" }, srv: { text: "destino", tone: "ok" } },
      }),
    },
  ],
};

// =====================================================================================
// Cena 7: roteamento e longest prefix match (iso + tabela de rotas)
// =====================================================================================

const D7 = 3.4;
const POS7 = { h: [-D7, D7], r1: [0, 0], r2: [-D7, -D7], r3: [D7, D7], isp: [D7, -D7] } as const;

const topo = (o: { h?: Status; r1?: Status; r2?: Status; r3?: Status; isp?: Status } = {}): IsoEntity[] => [
  box("h", ...POS7.h, "server", "host 10.1.0.50", { size: "md", tone: "mana", status: o.h }),
  router("r1", ...POS7.r1, "R1 · gateway", { status: o.r1 }),
  router("r2", ...POS7.r2, "R2 · 10.0.0.0/16", { status: o.r2 }),
  router("r3", ...POS7.r3, "R3 · 10.0.5.0/24", { status: o.r3 }),
  box("isp", ...POS7.isp, "cloud", "ISP · 0.0.0.0/0", { size: "md", tone: "sky", status: o.isp }),
];
const topoLinks = (): IsoLink[] => [link("h", "r1"), link("r1", "r2"), link("r1", "r3"), link("r1", "isp")];

type Match = "sim" | "não";
const ROUTES: { dest: string; hop: string; dev: string }[] = [
  { dest: "10.1.0.0/24", hop: "direto", dev: "eth0" },
  { dest: "10.0.0.0/16", hop: "10.255.0.2 (R2)", dev: "eth1" },
  { dest: "10.0.5.0/24", hop: "10.255.0.3 (R3)", dev: "eth1" },
  { dest: "10.255.0.0/24", hop: "direto", dev: "eth1" },
  { dest: "0.0.0.0/0", hop: "203.0.113.1 (ISP)", dev: "eth2" },
];

/** Tabela de rotas do R1. `match` diz que linhas casam com o destino; `win` é a escolhida. */
function routeGrid(dst?: string, match: Match[] = [], win = -1, drop = -1): GridPanel {
  const rows = ROUTES.filter((_, i) => i !== drop).map((r) => [r.dest, r.hop, r.dev, ...(dst ? [match[ROUTES.indexOf(r)] ?? "não"] : [])]);
  const idx = ROUTES.map((_, i) => i).filter((i) => i !== drop);
  const tones: GridPanel["tones"] = [];
  idx.forEach((orig, r) => {
    const t: Tone | null = orig === win ? "done" : match[orig] === "sim" ? "compare" : null;
    if (t) for (let c = 0; c < rows[r].length; c++) tones.push({ r, c, tone: t });
  });
  return { kind: "grid", label: dst ? `Tabela de rotas do R1 · destino ${dst}` : "Tabela de rotas do R1", colHeaders: ["Destino", "Próximo salto", "Interface", ...(dst ? ["Casa?"] : [])], rows, tones };
}

const m7 = (dst: string, cands: number | string, win: string, tone?: Metric["tone"]): Metric[] => [
  { id: "dst", label: "Destino", value: dst },
  { id: "cand", label: "Rotas que casam", value: cands },
  { id: "win", label: "Escolhida", value: win, tone },
];

const IP_ROUTE_H = ["default via 10.1.0.1 dev eth0 proto static", "10.1.0.0/24 dev eth0 proto kernel scope link src 10.1.0.50"].join("\n");
const IP_ROUTE_R1 = [
  "default via 203.0.113.1 dev eth2 proto static",
  "10.0.0.0/16 via 10.255.0.2 dev eth1 proto static",
  "10.0.5.0/24 via 10.255.0.3 dev eth1 proto static",
  "10.1.0.0/24 dev eth0 proto kernel scope link src 10.1.0.1",
  "10.255.0.0/24 dev eth1 proto kernel scope link src 10.255.0.1",
  "203.0.113.0/24 dev eth2 proto kernel scope link src 203.0.113.2",
].join("\n");
const IP_ROUTE_R1_NODEF = IP_ROUTE_R1.split("\n").slice(1).join("\n");
const RG = (dst: string, via: string, dev: string, src: string) => [`${dst} via ${via} dev ${dev} src ${src} uid 0`, "    cache"].join("\n");
const PING_NET_UNREACH = [
  "PING 198.51.100.7 (198.51.100.7) 56(84) bytes of data.",
  "From 10.1.0.1 icmp_seq=1 Destination Net Unreachable",
  "",
  "--- 198.51.100.7 ping statistics ---",
  "1 packets transmitted, 0 received, +1 errors, 100% packet loss, time 0ms",
].join("\n");

export const roteamento: SceneDef = {
  title: "Roteamento: tabela, gateway e longest prefix match",
  summary: "Acompanhe o R1 escolher a rota certa quando vários prefixos casam com o mesmo destino.",
  shell: "bash",
  goals: [
    { text: "Ler uma tabela de rotas", step: 2 },
    { text: "Aplicar o longest prefix match", step: 4 },
    { text: "Saber o papel da rota padrão", step: 5 },
    { text: "Diagnosticar “sem rota”", step: 6 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Host e gateway",
      title: "O host só conhece o gateway",
      body: [
        "O host `10.1.0.50` quer falar com `10.0.9.4`. Ele compara o destino com a própria rede (`10.1.0.0/24`): não está nela. Então entrega ao **gateway padrão**, `10.1.0.1`, o R1.",
        "O host não sabe nada sobre o resto da topologia. Decidir o caminho é trabalho do roteador.",
      ],
      metrics: m7("10.0.9.4", "–", "gateway padrão"),
      terminal: { suggest: ["ip route"], outputs: { "ip route": IP_ROUTE_H } },
      stage: { mode: "iso", entities: topo({ h: "hi" }), links: topoLinks(), flows: [flow("h", "r1", 2)] },
    },
    {
      kind: "conceito",
      nav: "Tabela de rotas",
      title: "O R1 consulta a tabela de rotas",
      body: [
        "Cada linha da tabela diz: “para este **prefixo**, mande ao **próximo salto** por esta **interface**”. Rotas diretas (`proto kernel`) existem porque o R1 tem interfaces nessas redes; as demais foram configuradas ou aprendidas.",
        "A última, `0.0.0.0/0`, é a **rota padrão**: o prefixo de zero bits casa com qualquer endereço. Serve para o que nenhuma outra rota cobre, e aponta ao provedor.",
      ],
      metrics: m7("–", "–", "–"),
      terminal: { suggest: ["ip route"], outputs: { "ip route": IP_ROUTE_R1 } },
      extra: [routeGrid()],
      stage: { mode: "iso", entities: topo({ r1: "hi" }), links: topoLinks() },
    },
    {
      kind: "conceito",
      nav: "Mais de uma casa",
      title: "Destino 10.0.9.4: duas rotas casam",
      body: [
        "`10.0.9.4` está dentro de `10.0.0.0/16`, e também cai na rota padrão `0.0.0.0/0`, que casa com tudo. Quando mais de uma rota casa, vale a regra do roteamento IP: a de **prefixo mais longo**.",
        "O `/16` tem 16 bits fixos e o `/0` tem zero, então o `/16` é mais específico e ganha. O pacote vai ao R2.",
      ],
      metrics: m7("10.0.9.4", 2, "/16 → R2"),
      terminal: { suggest: ["ip route get 10.0.9.4"], outputs: { "ip route get 10.0.9.4": RG("10.0.9.4", "10.255.0.2", "eth1", "10.255.0.1") } },
      extra: [routeGrid("10.0.9.4", ["não", "sim", "não", "não", "sim"], 1)],
      stage: { mode: "iso", entities: topo({ r1: "hi", r2: "ok" }), links: topoLinks(), flows: [flow("h", "r2", 2, { via: ["r1"] })] },
    },
    {
      kind: "conceito",
      nav: "O mais específico",
      title: "Destino 10.0.5.20: o /24 vence o /16",
      body: [
        "Agora o destino é `10.0.5.20`. Casam **três** rotas: o `/16` da rede interna, o `/24` da filial e a rota padrão. O `/24` tem 24 bits fixos, o mais longo, e é escolhido.",
        "É assim que se abre uma exceção dentro de uma rede grande: a filial `10.0.5.0/24` mora dentro do `10.0.0.0/16`, mas o seu tráfego vai ao R3, não ao R2.",
      ],
      callout: { kind: "chave", text: "Longest prefix match: entre as rotas que casam, vence a de maior prefixo, e não a primeira da lista nem a mais antiga." },
      metrics: m7("10.0.5.20", 3, "/24 → R3", "ok"),
      terminal: { suggest: ["ip route get 10.0.5.20"], outputs: { "ip route get 10.0.5.20": RG("10.0.5.20", "10.255.0.3", "eth1", "10.255.0.1") } },
      extra: [routeGrid("10.0.5.20", ["não", "sim", "sim", "não", "sim"], 2)],
      stage: { mode: "iso", entities: topo({ r1: "hi", r3: "ok" }), links: topoLinks(), flows: [flow("h", "r3", 2, { via: ["r1"] })] },
    },
    {
      kind: "solucao",
      nav: "Rota padrão",
      title: "Destino 198.51.100.7: só a padrão casa",
      body: [
        "`198.51.100.7` não está em nenhuma rede privada da empresa. Só a rota padrão casa, e ela manda o pacote ao provedor (`203.0.113.1`), que o encaminha adiante.",
        "A rota padrão é a saída para “todo o resto da internet”: um único endereço de próximo salto substitui as centenas de milhares de prefixos da tabela global. Como o endereço de origem é privado, a saída exige NAT (aula 8).",
      ],
      metrics: m7("198.51.100.7", 1, "/0 → ISP"),
      terminal: { suggest: ["ip route get 198.51.100.7"], outputs: { "ip route get 198.51.100.7": RG("198.51.100.7", "203.0.113.1", "eth2", "203.0.113.2") } },
      extra: [routeGrid("198.51.100.7", ["não", "não", "não", "não", "sim"], 4)],
      stage: { mode: "iso", entities: topo({ r1: "hi", isp: "ok" }), links: topoLinks(), flows: [flow("h", "isp", 2, { via: ["r1"], kind: "data" })] },
    },
    {
      kind: "problema",
      nav: "Sem rota",
      title: "Sem rota padrão, sem para onde mandar",
      body: [
        "Suponha que alguém apague a rota padrão. Para `198.51.100.7`, nenhuma linha casa. O R1 não adivinha: **descarta** o pacote e devolve ao host um ICMP **Destination Net Unreachable** (tipo 3, código 0).",
        "No host isso aparece como `Destination Net Unreachable`, vindo do gateway. Se a mensagem fosse `Network is unreachable` sem vir de ninguém, o erro estaria no próprio host (ele não tem rota nenhuma).",
      ],
      metrics: m7("198.51.100.7", 0, "nenhuma", "bad"),
      terminal: { suggest: ["ping -c 1 198.51.100.7", "ip route"], outputs: { "ping -c 1 198.51.100.7": PING_NET_UNREACH, "ip route": IP_ROUTE_R1_NODEF } },
      extra: [routeGrid("198.51.100.7", ["não", "não", "não", "não", "não"], -1, 4)],
      stage: {
        mode: "iso",
        entities: topo({ r1: "bad", isp: "dead" }),
        links: topoLinks().map((l) => (l.to === "isp" ? { ...l, style: "dashed" as const, tone: "rose" as const } : l)),
        flows: [flow("h", "r1", 2, { kind: "bad" })],
      },
    },
    {
      kind: "conceito",
      nav: "Quem preenche",
      title: "De onde vêm as linhas da tabela",
      body: [
        "Três origens: **diretas** (as redes das interfaces), **estáticas** (alguém escreveu com `ip route add 10.0.5.0/24 via 10.255.0.3`) e **dinâmicas**, aprendidas de vizinhos por um protocolo de roteamento.",
        "Dentro de uma empresa usa-se OSPF; entre operadoras e na internet, o **BGP**. Se duas rotas têm o mesmo prefixo, desempatam a distância administrativa e a métrica; com empate total, o tráfego pode ser dividido entre elas (ECMP).",
      ],
      metrics: m7("–", "–", "–"),
      extra: [routeGrid()],
      stage: {
        mode: "iso",
        entities: topo({ r1: "hi" }),
        links: topoLinks(),
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O pacote segue a rota mais específica",
      body: [
        "O host decide só entre local e gateway. O roteador compara o destino com cada prefixo, **fica com os que casam** e escolhe o de maior prefixo. A rota padrão (`0.0.0.0/0`) é a rede de segurança.",
        "Sem rota que case, o pacote é descartado e o ICMP avisa a origem. Ao depurar, use `ip route get <destino>` para ver qual rota o kernel escolheu.",
      ],
      changes: ["Três destinos, três rotas", "A mais específica sempre vence"],
      metrics: m7("–", "–", "LPM"),
      extra: [routeGrid()],
      stage: {
        mode: "iso",
        entities: topo(),
        links: topoLinks(),
        flows: [flow("h", "r2", 1, { via: ["r1"] }), flow("h", "r3", 1, { via: ["r1"] }), flow("h", "isp", 1, { via: ["r1"], kind: "data" })],
      },
    },
  ],
};

// =====================================================================================
// Cena 8: NAT e IP público (iso + tabela de tradução)
// =====================================================================================

const G8 = 3.6;
const P8 = (i: number) => rowXY(i, G8);
const PUB = "203.0.113.45";
const SRV = "198.51.100.10";

function lan(web = false): IsoEntity[] {
  const [cx, cy] = P8(0);
  return [
    zone("lan", cx - 1.95, cy - 1.95, 3.9, 3.9, { label: "casa", tone: "zinc" }),
    box("cel", 0.7, 0.7, "user", "celular", { parent: "lan", size: "sm", tone: "mana" }),
    box("nb", 3.2, 0.7, "globe", "notebook", { parent: "lan", size: "sm", tone: "mana" }),
    box("tv", 0.7, 3.2, "eye", "TV", { parent: "lan", size: "sm", tone: "mana" }),
    ...(web ? [box("web", 3.2, 3.2, "server", "web local", { parent: "lan", size: "sm", tone: "rune", status: "new" as Status })] : []),
  ];
}
const NATR = (status?: Status, badges?: { text: string; tone?: "ok" | "warn" | "bad" | "info" }[]) => box("rt", ...P8(1), "router", "roteador NAT", { size: "md", tone: "ember", status, badges });
const INET = () => box("inet", ...P8(2), "cloud", "internet", { size: "md", tone: "sky" });
const SRV8 = () => box("srv", ...P8(3), "server", `servidor ${SRV}`, { size: "md", tone: "arcane" });

type NatRow = [string, string, string];
const T1: NatRow = ["192.168.0.23:51514", `${PUB}:40001`, `${SRV}:443`];
const T2: NatRow = ["192.168.0.31:51514", `${PUB}:40002`, `${SRV}:443`];
const T3: NatRow = ["192.168.0.40:48210", `${PUB}:40003`, "198.51.100.77:443"];

const natGrid = (rows: NatRow[], hi = -1, label = "Tabela de tradução do roteador"): GridPanel => ({
  kind: "grid",
  label,
  colHeaders: ["Interno (IP:porta)", "Externo (IP:porta)", "Destino"],
  rows: rows.length ? rows : [["(vazia)", "", ""]],
  tones: hi >= 0 ? [0, 1, 2].map((c) => ({ r: hi, c, tone: "active" as const })) : [],
});

const m8 = (entries: number, ips: string, ports?: string): Metric[] => [
  { id: "ent", label: "Entradas na tabela", value: entries },
  { id: "ip", label: "IP público usado", value: ips },
  ...(ports ? [{ id: "ports", label: "Portas em uso", value: ports }] : []),
];

const CT1 = `tcp      6 431997 ESTABLISHED src=192.168.0.23 dst=${SRV} sport=51514 dport=443 src=${SRV} dst=${PUB} sport=443 dport=40001 [ASSURED] mark=0 use=1`;
const CT2 = `tcp      6 431999 ESTABLISHED src=192.168.0.31 dst=${SRV} sport=51514 dport=443 src=${SRV} dst=${PUB} sport=443 dport=40002 [ASSURED] mark=0 use=1`;
const CT_FOOT = (n: number) => `conntrack v1.4.7 (conntrack-tools): ${n} flow entries have been shown.`;
const IPT_POST = ["-P POSTROUTING ACCEPT", "-A POSTROUTING -s 192.168.0.0/24 -o eth1 -j MASQUERADE"].join("\n");
const IPT_PRE = ["-P PREROUTING ACCEPT", "-A PREROUTING -i eth1 -p tcp -m tcp --dport 443 -j DNAT --to-destination 192.168.0.50:443"].join("\n");
const CT_CMD = "sudo conntrack -L";
const MASQ = "sudo iptables -t nat -S POSTROUTING";
const MYIP = "curl -s https://ifconfig.me";

export const nat: SceneDef = {
  title: "NAT: dez celulares saem por um IP",
  summary: "Veja o roteador de casa reescrever IP e porta de origem, guardar a tabela e traduzir a volta de cada resposta.",
  shell: "bash",
  goals: [
    { text: "Entender por que o NAT existe", step: 2 },
    { text: "Ver o roteador reescrever IP e porta de origem", step: 3 },
    { text: "Acompanhar a resposta voltando pela tabela", step: 5 },
    { text: "Conhecer os limites: timeout, portas e CGNAT", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um IP público",
      title: "Vários aparelhos, um endereço de fora",
      body: [
        "Em casa, celular, notebook e TV têm IPs privados (`192.168.0.x`). O provedor entrega **um** IP público ao roteador: `203.0.113.45`. Vista da internet, a casa inteira é essa única máquina.",
        "Ao perguntar a um serviço qual é o seu IP, qualquer aparelho da casa recebe a mesma resposta.",
      ],
      metrics: m8(0, "1"),
      terminal: { suggest: [MYIP, "ip -br -4 addr"], outputs: { [MYIP]: PUB, "ip -br -4 addr": ["lo               UNKNOWN        127.0.0.1/8", "wlan0            UP             192.168.0.23/24"].join("\n") } },
      extra: [natGrid([])],
      stage: { mode: "iso", entities: [...lan(), NATR(), INET(), SRV8()], links: [link("lan", "rt"), link("rt", "inet", { label: PUB }), link("inet", "srv")] },
    },
    {
      kind: "problema",
      nav: "Origem privada",
      title: "Um IP privado não volta",
      body: [
        "O celular (`192.168.0.23`, porta de origem `51514`) abre uma conexão com `198.51.100.10:443`. Se o pacote saísse como está, o servidor até receberia, mas **responderia a 192.168.0.23**, um endereço que milhões de redes usam e nenhum roteador da internet encaminha.",
        "A resposta se perde. Falta alguém que troque a origem por um endereço que a internet saiba rotear.",
      ],
      metrics: m8(0, "–"),
      focus: ["rt", "inet", "cel"],
      extra: [natGrid([])],
      stage: {
        mode: "iso",
        entities: [...lan(), NATR(), INET(), SRV8()],
        links: [link("lan", "rt"), link("rt", "inet"), link("inet", "srv")],
        flows: [flow("cel", "srv", 1, { via: ["rt", "inet"], kind: "bad" })],
      },
    },
    {
      kind: "solucao",
      nav: "NAT de saída",
      title: "O roteador reescreve a origem",
      body: [
        "O roteador troca o IP de origem `192.168.0.23` pelo público `203.0.113.45` e a porta `51514` por uma que ele escolheu (`40001`). Guarda a troca numa **tabela de tradução**: interno ↔ externo ↔ destino.",
        "É o **NAPT**, ou PAT, o tipo de NAT mais comum. Quem recebe o pacote vê só `203.0.113.45:40001` e jamais enxerga o celular.",
      ],
      callout: { kind: "chave", text: "O NAT reescreve IP E porta de origem. É a porta que permite que muitos aparelhos dividam um único IP." },
      changes: ["Origem 192.168.0.23:51514 → 203.0.113.45:40001", "+ linha na tabela de tradução"],
      metrics: m8(1, "1", "1"),
      terminal: { suggest: [CT_CMD, MASQ], outputs: { [CT_CMD]: [CT1, CT_FOOT(1)].join("\n"), [MASQ]: IPT_POST } },
      extra: [natGrid([T1], 0)],
      stage: {
        mode: "iso",
        entities: [...lan(), NATR("hi"), INET(), SRV8()],
        links: [link("lan", "rt"), link("rt", "inet", { label: PUB }), link("inet", "srv")],
        flows: [flow("cel", "rt", 1), flow("rt", "srv", 1, { via: ["inet"], kind: "data" })],
      },
    },
    {
      kind: "conceito",
      nav: "Mesma porta",
      title: "Duas máquinas, a mesma porta de origem",
      body: [
        "O notebook (`192.168.0.31`) também abre uma conexão ao mesmo servidor e, por coincidência, usa a mesma porta de origem, `51514`. Sem tradução, as duas conexões seriam indistinguíveis lá fora.",
        "O roteador resolve atribuindo outra porta externa: `40002`. A chave de cada conversa é a quádrupla (IP externo, porta externa, IP de destino, porta de destino).",
      ],
      changes: ["Origem 192.168.0.31:51514 → 203.0.113.45:40002", "+ linha na tabela de tradução"],
      metrics: m8(2, "1", "2"),
      terminal: { suggest: [CT_CMD], outputs: { [CT_CMD]: [CT1, CT2, CT_FOOT(2)].join("\n") } },
      extra: [natGrid([T1, T2], 1)],
      stage: {
        mode: "iso",
        entities: [...lan(), NATR("hi"), INET(), SRV8()],
        links: [link("lan", "rt"), link("rt", "inet", { label: PUB }), link("inet", "srv")],
        flows: [flow("nb", "rt", 1), flow("rt", "srv", 1, { via: ["inet"], kind: "data" })],
      },
    },
    {
      kind: "conceito",
      nav: "A volta",
      title: "A resposta volta pela tabela",
      body: [
        "O servidor responde a `203.0.113.45:40001`. O roteador recebe, procura `40001` na tabela, descobre que é do celular e **reescreve o destino** para `192.168.0.23:51514` antes de entregar.",
        "Por isso o NAT é **com estado**: ele precisa lembrar cada conversa para traduzir a volta. Para o celular, tudo aconteceu como se falasse direto com o servidor.",
      ],
      changes: ["Destino 203.0.113.45:40001 → 192.168.0.23:51514", "Entrega ao celular"],
      metrics: m8(2, "1", "2"),
      extra: [natGrid([T1, T2], 0)],
      stage: {
        mode: "iso",
        entities: [...lan(), NATR("hi"), INET(), SRV8()],
        links: [link("lan", "rt"), link("rt", "inet", { label: PUB }), link("inet", "srv")],
        flows: [flow("srv", "rt", 1, { via: ["inet"], kind: "data" }), flow("rt", "cel", 1)],
      },
    },
    {
      kind: "problema",
      nav: "Sem convite",
      title: "Quem chega de fora sem convite é barrado",
      body: [
        "Alguém na internet envia um pacote para `203.0.113.45:8080`. A tabela não tem nenhuma linha para essa porta: o roteador não sabe a qual aparelho entregar e **descarta**.",
        "Esse efeito colateral protege a rede, mas **o NAT não é firewall**: não foi desenhado para segurança, e regras de filtragem de verdade continuam necessárias.",
      ],
      metrics: m8(2, "1", "2"),
      focus: ["rt", "inet"],
      extra: [natGrid([T1, T2])],
      stage: {
        mode: "iso",
        entities: [...lan(), NATR("bad"), INET(), SRV8()],
        links: [link("lan", "rt"), link("rt", "inet", { label: PUB }), link("inet", "srv")],
        flows: [flow("srv", "rt", 1, { via: ["inet"], kind: "bad" })],
      },
    },
    {
      kind: "solucao",
      nav: "Port forwarding",
      title: "Port forwarding: um convite fixo",
      body: [
        "Para publicar um serviço de dentro da casa, cria-se uma entrada **estática**: tudo que chegar em `203.0.113.45:443` vai para `192.168.0.50:443`. É o NAT de destino (**DNAT**), também chamado de port forwarding.",
        "Em servidores, é o que o `docker run -p 443:443` e o Service do tipo NodePort fazem por baixo. Aqui a regra é escrita à mão.",
      ],
      changes: ["+ web local (192.168.0.50)", "Destino 203.0.113.45:443 → 192.168.0.50:443"],
      metrics: m8(3, "1", "2 + 1 fixa"),
      terminal: { suggest: ["sudo iptables -t nat -S PREROUTING"], outputs: { "sudo iptables -t nat -S PREROUTING": IPT_PRE } },
      extra: [natGrid([T1, T2, ["(estática) 192.168.0.50:443", `${PUB}:443`, "qualquer origem"]], 2)],
      stage: {
        mode: "iso",
        entities: [...lan(true), NATR("hi"), INET(), SRV8()],
        links: [link("lan", "rt"), link("rt", "inet", { label: PUB }), link("inet", "srv")],
        flows: [flow("srv", "rt", 1, { via: ["inet"] }), flow("rt", "web", 1, { kind: "data" })],
      },
    },
    {
      kind: "tradeoff",
      nav: "Limites",
      title: "Limites: tempo, portas e CGNAT",
      body: [
        "Cada entrada expira: no Linux, UDP ocioso some em ~30 s e TCP estabelecido em 5 dias. O limite de portas é de ~64 mil conexões simultâneas por (IP público, destino, porta de destino): um serviço que abre muitas ao mesmo destino esgota as portas (aula 24).",
        "Operadoras também fazem NAT: o **CGNAT**, com o bloco `100.64.0.0/10`. Dois NATs em cascata quebram o port forwarding e atrapalham jogos e chamadas ponto a ponto. IPv6 elimina a necessidade de NAT.",
      ],
      callout: { kind: "atencao", text: "Backends que fazem milhares de chamadas ao mesmo destino por um NAT gateway podem esgotar portas. Reuse conexões." },
      metrics: m8(3, "1", "perto do limite"),
      focus: ["rt", "cgnat", "inet"],
      extra: [natGrid([T1, T2, T3])],
      stage: {
        mode: "iso",
        entities: [...lan(), NATR("warn", [{ text: "tabela cheia?", tone: "warn" }]), box("cgnat", P8(1.5)[0] - 2.6, P8(1.5)[1] - 2.6, "router", "CGNAT", { size: "sm", tone: "violet", status: "new" }), INET(), SRV8()],
        links: [link("lan", "rt"), link("rt", "cgnat"), link("cgnat", "inet"), link("rt", "inet", { style: "dashed" }), link("inet", "srv")],
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "NAT em uma frase",
      body: [
        "O NAT troca o IP e a porta de origem na saída, guarda a troca numa tabela e a desfaz na volta. Muitos aparelhos dividem um endereço público, e quem não foi convidado não entra, a menos que haja port forwarding.",
        "Como backend, lembre: o IP que seu servidor vê pode ser o do NAT, as entradas expiram e as portas acabam. Por isso existem keep-alive e pool de conexões.",
      ],
      changes: ["Tabela completa", "Um IP público para todos"],
      metrics: m8(3, "1", "3"),
      terminal: { suggest: [CT_CMD, MASQ], outputs: { [CT_CMD]: [CT1, CT2, CT_FOOT(2)].join("\n"), [MASQ]: IPT_POST } },
      extra: [natGrid([T1, T2, T3])],
      stage: { mode: "iso", entities: [...lan(), NATR(), INET(), SRV8()], links: [link("lan", "rt"), link("rt", "inet", { label: PUB }), link("inet", "srv")] },
    },
  ],
};

