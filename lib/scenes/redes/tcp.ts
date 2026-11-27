/**
 * Cenas do módulo "TCP por dentro" da trilha Redes para Backend.
 * handshakeTcp: sequência, shell bash (tcp-segmento-e-handshake).
 * estadosTcp: sequência, shell bash (estados-e-fechamento-tcp).
 * controleDeFluxo: sequência + gráficos, shell bash (controle-de-fluxo).
 * congestionamento: sequência + gráfico de cwnd, shell bash (controle-de-congestionamento).
 * filasDoKernel: isométrico, shell bash (sockets-e-filas-do-kernel).
 * servidorTcp: isométrico + tabela (servidor-tcp-em-java).
 */
import type { IsoEntity, Metric, SceneDef, SceneStep, SeqLane, SeqMessage, SeqNote, Status } from "../types";
import type { ChartPanel, GridPanel, Panel } from "@/lib/visualizers/types";
import { box, flow, link, users, zone } from "../kit/common";
import { rowXY } from "../kit/net";

type Seq = Extract<SceneStep["stage"], { mode: "sequence" }>;
type Tone4 = "ok" | "warn" | "bad" | "info";

const msg = (id: string, from: string, to: string, at: number, label: string, o: Partial<SeqMessage> = {}): SeqMessage => ({ id, from, to, at, label, ...o });
const note = (lane: string, at: number, text: string, tone: Tone4 = "info"): SeqNote => ({ lane, at, text, tone });
const state = (text: string, tone: Tone4 = "info") => ({ text, tone });

// =====================================================================================
// Cena 11: segmento TCP e three-way handshake
// =====================================================================================

const X = 3104581200; // ISN do cliente (aleatório)
const Y = 871250770; // ISN do servidor (aleatório)

const LANES11: SeqLane[] = [
  { id: "cli", label: "Cliente 198.51.100.7:51514", icon: "globe", tone: "mana" },
  { id: "srv", label: "Servidor 203.0.113.10:8080", icon: "server", tone: "arcane" },
];
const seq11 = (messages: SeqMessage[], extra: Partial<Seq> = {}): Seq => ({ mode: "sequence", lanes: LANES11, messages, ...extra });
const m11 = (a: string, b: string, c?: Metric): Metric[] => [{ id: "a", label: "Cliente", value: a }, { id: "b", label: "Servidor", value: b }, ...(c ? [c] : [])];

const OPTS = "MSS 1460 · SACK · WS 7";
const H1 = msg("h1", "cli", "srv", 0, `SYN seq=${X}`, { span: 1, detail: `${OPTS} · win 64240`, tone: "ctrl" });
const H2 = msg("h2", "srv", "cli", 3, `SYN-ACK seq=${Y} ack=${X + 1}`, { span: 1, detail: `${OPTS} · win 65160`, tone: "ctrl" });
const H3 = msg("h3", "cli", "srv", 6, `ACK seq=${X + 1} ack=${Y + 1}`, { span: 1, detail: "conexão estabelecida", tone: "ok" });
const G1 = msg("g1", "cli", "srv", 9, `GET /pedidos · 83 B · seq=${X + 1}`, { span: 1, detail: "len 83", tone: "data" });
const G2 = msg("g2", "srv", "cli", 12, `ACK ack=${X + 84}`, { span: 1, tone: "ok" });

const tcpGrid = (rows: (string | number)[][], hi: number[] = [], label = "Segmento TCP (campos principais)"): GridPanel => ({
  kind: "grid",
  label,
  colHeaders: ["Porta origem", "Porta destino", "seq", "ack", "Flags", "Janela"],
  rows,
  tones: rows.flatMap((_, r) => hi.map((c) => ({ r, c, tone: "active" as const }))),
});

const SS_LISTEN = ["State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process", "LISTEN  0       4096           0.0.0.0:8080         0.0.0.0:*"].join("\n");
const SS_SYNRECV = ["Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process", "0       0         203.0.113.10:8080    198.51.100.7:51514"].join("\n");
const SS_ESTAB = [
  "State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process",
  "LISTEN  0       4096           0.0.0.0:8080         0.0.0.0:*",
  "ESTAB   0       0         203.0.113.10:8080    198.51.100.7:51514",
].join("\n");
const DUMP_CMD = "sudo tcpdump -nS -c 3 -i eth0 tcp port 8080";
const DUMP_HS = [
  "tcpdump: listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes",
  `14:02:11.100001 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [S], seq ${X}, win 64240, options [mss 1460,sackOK,TS val 1923001 ecr 0,nop,wscale 7], length 0`,
  `14:02:11.112310 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [S.], seq ${Y}, ack ${X + 1}, win 65160, options [mss 1460,sackOK,TS val 774412 ecr 1923001,nop,wscale 7], length 0`,
  `14:02:11.112342 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack ${Y + 1}, win 502, options [nop,nop,TS val 1923013 ecr 774412], length 0`,
].join("\n");
const SS_TI = [
  "State  Recv-Q  Send-Q   Local Address:Port    Peer Address:Port",
  "ESTAB  0       0         198.51.100.7:51514   203.0.113.10:8080",
  "\t cubic wscale:7,7 rto:212 rtt:12.5/6.2 mss:1448 pmtu:1500 cwnd:10",
].join("\n");
const SS_TI_CMD = "ss -ti dst 203.0.113.10";
const SYN_RETRIES = "sysctl net.ipv4.tcp_syn_retries";

export const handshakeTcp: SceneDef = {
  title: "TCP: segmento e three-way handshake",
  summary: "Acompanhe o SYN, o SYN-ACK e o ACK com os números de sequência reais, as opções negociadas e o primeiro byte de dados.",
  shell: "bash",
  goals: [
    { text: "Ler os três segmentos do handshake com seq e ack", step: 4 },
    { text: "Entender as opções negociadas: MSS, SACK e escala de janela", step: 5 },
    { text: "Ver como um SYN perdido é retransmitido", step: 8 },
    { text: "Explicar por que o handshake tem três vias", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "connect()",
      title: "O servidor escuta, o cliente chama connect()",
      body: [
        "O servidor chamou `listen()` na porta `8080`: o socket está em **LISTEN**, pronto para receber pedidos de conexão. O cliente, com o IP `198.51.100.7`, chama `connect()` e o kernel escolhe uma porta de origem efêmera (`51514`).",
        "Nenhum dado trafega antes de as duas pontas combinarem **onde cada fluxo de bytes começa**. É isso que o handshake faz.",
      ],
      metrics: m11("CLOSED", "LISTEN"),
      terminal: { suggest: ["ss -ltn"], outputs: { "ss -ltn": SS_LISTEN } },
      stage: seq11([], { laneState: { cli: state("CLOSED"), srv: state("LISTEN", "ok") }, notes: [note("cli", 0, "connect(203.0.113.10:8080)", "info")] }),
    },
    {
      kind: "conceito",
      nav: "SYN",
      title: "SYN: o cliente propõe o seu número inicial",
      body: [
        `O primeiro segmento leva a flag **SYN** e o **ISN** do cliente (*initial sequence number*): \`${X}\`. O ISN é **aleatório**, não começa em 0: impede que segmentos de uma conexão antiga sejam confundidos com os de uma nova, e dificulta que um atacante os forje.`,
        "As opções vão na mesma mensagem: MSS 1460, SACK permitido e escala de janela 7. Mais abaixo, o que cada uma faz.",
      ],
      callout: { kind: "chave", text: "O SYN consome 1 número de sequência, embora não carregue nenhum byte de dados." },
      changes: ["+ SYN do cliente", "cliente: SYN_SENT"],
      metrics: m11("SYN_SENT", "LISTEN"),
      terminal: { suggest: [DUMP_CMD], outputs: { [DUMP_CMD]: DUMP_HS } },
      extra: [tcpGrid([[51514, 8080, X, 0, "SYN", 64240]], [2, 4])],
      stage: seq11([H1], { laneState: { cli: state("SYN_SENT", "warn"), srv: state("LISTEN", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "SYN-ACK",
      title: "SYN-ACK: o servidor confirma e propõe o dele",
      body: [
        `O servidor responde com **SYN + ACK**: seu próprio ISN (\`${Y}\`) e \`ack=${X + 1}\`. O ACK diz **o próximo byte que o servidor espera receber**. Como o SYN ocupou o número \`${X}\`, o próximo esperado é \`${X}\` + 1.`,
        "O servidor guarda um registro da conexão incompleta (**SYN_RECV**) na fila de SYN e espera o terceiro segmento. Mais sobre essa fila na aula de sockets e backlog.",
      ],
      changes: ["+ SYN-ACK do servidor", "servidor: SYN_RECV"],
      metrics: m11("SYN_SENT", "SYN_RECV"),
      terminal: { suggest: ["ss -tan state syn-recv"], outputs: { "ss -tan state syn-recv": SS_SYNRECV } },
      extra: [tcpGrid([[8080, 51514, Y, X + 1, "SYN, ACK", 65160]], [2, 3, 4])],
      stage: seq11([H1, H2], { laneState: { cli: state("SYN_SENT", "warn"), srv: state("SYN_RECV", "warn") } }),
    },
    {
      kind: "solucao",
      nav: "ACK",
      title: "ACK: as duas pontas ficam ESTABLISHED",
      body: [
        `O cliente confirma o ISN do servidor: \`ack=${Y + 1}\` (de novo, o SYN ocupou 1 número). Esse ACK já pode carregar dados, e o cliente passa a **ESTABLISHED** assim que recebe o SYN-ACK. O servidor passa a ESTABLISHED ao receber este ACK.`,
        "O custo foi **1 RTT** antes de o primeiro byte útil sair: com 120 ms de RTT, são 120 ms só de preparação.",
      ],
      callout: { kind: "bom-saber", text: "O ACK do SYN-ACK é ISN do servidor + 1; o ACK do SYN é ISN do cliente + 1. O ISN em si nunca é reconhecido sozinho." },
      changes: ["+ ACK do cliente", "os dois lados: ESTABLISHED"],
      metrics: m11("ESTABLISHED", "ESTABLISHED", { id: "rtt", label: "Custo", value: "1 RTT", tone: "warn" }),
      terminal: { suggest: ["ss -tan"], outputs: { "ss -tan": SS_ESTAB } },
      extra: [tcpGrid([[51514, 8080, X + 1, Y + 1, "ACK", 502]], [2, 3, 4])],
      stage: seq11([H1, H2, H3], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [{ fromAt: 0, toAt: 7, label: "1 RTT" }] }),
    },
    {
      kind: "conceito",
      nav: "Opções",
      title: "O que foi negociado nas opções",
      body: [
        "**MSS 1460**: o maior bloco de dados por segmento (1500 de MTU menos 20 de IP e 20 de TCP). **SACK**: permite confirmar blocos fora de ordem, para retransmitir só o que faltou. **Escala de janela 7**: multiplica a janela de 16 bits por 2⁷.",
        "A escala só pode ser combinada **no SYN**; depois o valor não muda. Com o `ss -ti`, o `mss:1448` aparece menor porque a opção de timestamps consome 12 bytes de cada segmento.",
      ],
      changes: ["MSS, SACK e escala de janela acordados"],
      metrics: m11("ESTABLISHED", "ESTABLISHED", { id: "mss", label: "MSS efetivo", value: "1448 B" }),
      terminal: { suggest: [SS_TI_CMD], outputs: { [SS_TI_CMD]: SS_TI } },
      extra: [
        {
          kind: "grid",
          label: "Opções do SYN",
          colHeaders: ["Opção", "Valor", "Efeito"],
          rows: [
            ["MSS", 1460, "segmentos de até 1460 B de dados"],
            ["SACK permitido", "sim", "ACK de blocos fora de ordem"],
            ["Escala de janela", "7", "janela × 128: até ~8 MB"],
            ["Timestamps", "sim", "mede RTT; reduz o MSS efetivo a 1448"],
          ],
        },
      ],
      stage: seq11([H1, H2, H3], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "Dados e ACK",
      title: "O ACK é cumulativo e aponta o próximo byte",
      body: [
        `O cliente envia 83 bytes de requisição com \`seq=${X + 1}\`. O servidor responde \`ack=${X + 84}\`: **"recebi tudo até ${X + 83}; quero o byte ${X + 84}"**. Seq conta bytes, não segmentos.`,
        "Um ACK **cumulativo** confirma tudo o que veio antes. Por isso um ACK perdido raramente atrapalha: o próximo ACK já cobre o anterior.",
      ],
      changes: ["+ 83 bytes de dados", "ack avança de 83"],
      metrics: m11("ESTABLISHED", "ESTABLISHED", { id: "ack", label: "ack do servidor", value: X + 84 }),
      extra: [tcpGrid([[51514, 8080, X + 1, Y + 1, "PSH, ACK", 502], [8080, 51514, Y + 1, X + 84, "ACK", 510]], [2, 3])],
      stage: seq11([H1, H2, H3, G1, G2], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "Segmentos (MSS)",
      title: "Uma resposta de 4000 bytes vira 3 segmentos",
      body: [
        `Com MSS 1460, os 4000 bytes da resposta saem em segmentos de 1460, 1460 e 1080 bytes, com \`seq\` ${Y + 1}, ${Y + 1461} e ${Y + 2921}. O receptor confirma a cada dois segmentos cheios, no mínimo.`,
        `O último ACK, \`ack=${Y + 4001}\`, mostra a soma: ${Y + 1} + 4000. Tudo o que o TCP faz acima disso (reordenar, retransmitir, controlar a vazão) usa esses dois números.`,
      ],
      changes: ["+ 3 segmentos de dados", "ACK cumulativo cobre os 4000 B"],
      metrics: m11("recebe", "envia 4000 B", { id: "seg", label: "Segmentos", value: 3 }),
      stage: seq11(
        [
          msg("d1", "srv", "cli", 0, `seg 1 · 1460 B · seq=${Y + 1}`, { tone: "data" }),
          msg("d2", "srv", "cli", 1, `seg 2 · 1460 B · seq=${Y + 1461}`, { tone: "data" }),
          msg("k1", "cli", "srv", 2, `ACK ack=${Y + 2921}`, { tone: "ok" }),
          msg("d3", "srv", "cli", 3, `seg 3 · 1080 B · seq=${Y + 2921}`, { tone: "data" }),
          msg("k2", "cli", "srv", 4, `ACK ack=${Y + 4001}`, { tone: "ok" }),
        ],
        { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") } },
      ),
    },
    {
      kind: "problema",
      nav: "SYN perdido",
      title: "E se o SYN se perde?",
      body: [
        "O cliente fica em SYN_SENT e **dispara um temporizador de 1 s** (RTO inicial, RFC 6298). Sem SYN-ACK, reenvia o SYN e dobra a espera: 2 s, 4 s, 8 s...",
        "No Linux, `tcp_syn_retries=6` leva a desistir após cerca de **127 s** (1+2+4+8+16+32+64). O `connect()` fica pendurado esse tempo todo, por isso toda chamada de rede precisa de um **timeout de conexão** próprio.",
      ],
      callout: { kind: "atencao", text: "Um connect() sem timeout pode esperar mais de dois minutos por um host que não responde." },
      changes: ["SYN perdido", "+ SYN retransmitido após 1 s"],
      metrics: m11("SYN_SENT", "LISTEN", { id: "rto", label: "Espera até retentar", value: "1 s", tone: "warn" }),
      terminal: { suggest: [SYN_RETRIES], outputs: { [SYN_RETRIES]: "net.ipv4.tcp_syn_retries = 6" } },
      stage: seq11(
        [
          msg("l1", "cli", "srv", 0, `SYN seq=${X}`, { tone: "bad", lost: true }),
          msg("l2", "cli", "srv", 4, `SYN seq=${X} (retransmissão)`, { span: 1, tone: "ctrl" }),
          msg("l3", "srv", "cli", 6, `SYN-ACK ack=${X + 1}`, { span: 1, tone: "ok" }),
        ],
        { laneState: { cli: state("SYN_SENT", "warn"), srv: state("LISTEN", "ok") }, brackets: [{ fromAt: 0, toAt: 4, label: "RTO = 1 s" }] },
      ),
    },
    {
      kind: "tradeoff",
      nav: "Por que 3 vias",
      title: "Por que não bastam duas mensagens",
      body: [
        "Um SYN **antigo e duplicado**, atrasado na rede, chega ao servidor muito depois de a conexão original ter terminado. Sem o terceiro segmento, o servidor abriria uma conexão que ninguém quer.",
        "Com o handshake de três vias, o servidor responde SYN-ACK, o cliente vê um `ack` que não corresponde a nenhum `seq` seu e responde **RST**. A conexão fantasma é desfeita antes de existir.",
      ],
      changes: ["+ SYN antigo chega ao servidor", "+ RST do cliente desfaz a conexão"],
      metrics: m11("CLOSED", "SYN_RECV → LISTEN", { id: "risk", label: "Conexão indevida", value: "evitada", tone: "ok" }),
      stage: seq11(
        [
          msg("o1", "cli", "srv", 0, "SYN antigo seq=2999000000 (atrasado)", { span: 4, tone: "bad" }),
          msg("o2", "srv", "cli", 5, "SYN-ACK ack=2999000001", { span: 1, tone: "ctrl" }),
          msg("o3", "cli", "srv", 8, "RST seq=2999000001", { span: 1, tone: "bad" }),
        ],
        { notes: [note("cli", 7, "esse ack não corresponde a um seq meu", "warn"), note("srv", 10, "desfaz a conexão incompleta", "ok")] },
      ),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Três segmentos, um acordo",
      body: [
        "SYN propõe o ISN do cliente, SYN-ACK confirma e propõe o do servidor, ACK confirma. Os dois lados combinam ISNs, opções (MSS, SACK, escala de janela) e passam a contar bytes com `seq` e `ack`. O custo é **1 RTT** antes do primeiro byte.",
        "Cada SYN consome 1 número de sequência; o ACK é sempre o **próximo byte esperado**; e um SYN perdido é retentado em 1, 2, 4 s... até cerca de 127 s no Linux.",
      ],
      changes: ["Handshake completo", "1 RTT até o primeiro byte"],
      metrics: m11("ESTABLISHED", "ESTABLISHED", { id: "rtt", label: "Custo", value: "1 RTT" }),
      stage: seq11([H1, H2, H3], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") } }),
    },
  ],
};

// =====================================================================================
// Cena 12: estados e fechamento (FIN, TIME_WAIT, CLOSE_WAIT)
// =====================================================================================

const LANES12: SeqLane[] = [
  { id: "cli", label: "Cliente 198.51.100.7:51514", icon: "globe", tone: "mana" },
  { id: "ker", label: "Kernel do servidor", icon: "cpu", tone: "sky" },
  { id: "app", label: "Aplicação (JVM)", icon: "server", tone: "arcane" },
];
const seq12 = (messages: SeqMessage[], extra: Partial<Seq> = {}): Seq => ({ mode: "sequence", lanes: LANES12, messages, ...extra });
const m12 = (a: string, b: string, c?: Metric): Metric[] => [{ id: "a", label: "Cliente", value: a }, { id: "b", label: "Servidor", value: b }, ...(c ? [c] : [])];

const CA = X + 84; // seq do cliente depois da requisição
const SA = Y + 4001; // seq do servidor depois da resposta
const C_CLOSE = msg("c0", "cli", "cli", 0, "close()", { tone: "ctrl" });
const C_FIN = msg("c1", "cli", "ker", 1, `FIN, ACK seq=${CA}`, { span: 1, detail: `ack=${SA}`, tone: "ctrl" });
const C_ACK = msg("c2", "ker", "cli", 4, `ACK ack=${CA + 1}`, { tone: "ok" });
const C_EOF = msg("c3", "ker", "app", 5, "EOF: read() devolve -1", { tone: "ctrl" });
const C_APPCLOSE = msg("c4", "app", "ker", 7, "close()", { tone: "ctrl" });
const C_SFIN = msg("c5", "ker", "cli", 8, `FIN, ACK seq=${SA}`, { span: 1, detail: `ack=${CA + 1}`, tone: "ctrl" });
const C_LAST = msg("c6", "cli", "ker", 11, `ACK ack=${SA + 1}`, { tone: "ok" });

const TW_CMD = "ss -tano state time-wait";
const SS_TW = ["Recv-Q Send-Q  Local Address:Port    Peer Address:Port  Process", "0      0         198.51.100.7:51514   203.0.113.10:8080   timer:(timewait,57sec,0)"].join("\n");
const CW_CMD = "ss -H -tan state close-wait | wc -l";
const SS_CW = ["Recv-Q Send-Q   Local Address:Port    Peer Address:Port  Process", "0      0          203.0.113.10:8080    198.51.100.7:51514"].join("\n");

export const estadosTcp: SceneDef = {
  title: "Estados do TCP: FIN, TIME_WAIT e CLOSE_WAIT",
  summary: "Siga o fechamento em quatro vias, veja quem paga o TIME_WAIT e por que CLOSE_WAIT acumulando é sempre um bug da aplicação.",
  shell: "bash",
  goals: [
    { text: "Ler o fechamento em 4 vias e os estados de cada lado", step: 5 },
    { text: "Explicar o TIME_WAIT e o 2×MSL", step: 6 },
    { text: "Diagnosticar CLOSE_WAIT acumulando", step: 7 },
    { text: "Distinguir o fechamento normal (FIN) do abrupto (RST)", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "close()",
      title: "O cliente terminou e chama close()",
      body: [
        "A requisição foi atendida e a resposta recebida. A conexão está **ESTABLISHED** nos dois lados. Agora o cliente chama `close()`.",
        "Em TCP, cada sentido do fluxo é fechado **separadamente**: por isso o fechamento usa quatro segmentos, e não três. O lado que fecha primeiro é o **fechamento ativo**.",
      ],
      changes: ["cliente chama close()"],
      metrics: m12("ESTABLISHED", "ESTABLISHED"),
      stage: seq12([C_CLOSE], { laneState: { cli: state("ESTABLISHED", "ok"), ker: state("ESTABLISHED", "ok"), app: state("lendo/escrevendo") } }),
    },
    {
      kind: "conceito",
      nav: "FIN",
      title: "FIN: não tenho mais nada a enviar",
      body: [
        `O cliente envia um segmento com a flag **FIN**. Assim como o SYN, o FIN consome **1 número de sequência**: \`seq=${CA}\` e o próximo será ${CA + 1}.`,
        "O cliente passa a **FIN_WAIT_1**: já avisou que não vai mais enviar, mas ainda pode **receber** dados. É o que se chama de *half-close*.",
      ],
      callout: { kind: "chave", text: "Fechar um sentido não fecha o outro: o par ainda pode enviar até chamar o seu próprio close()." },
      changes: ["+ FIN do cliente", "cliente: FIN_WAIT_1"],
      metrics: m12("FIN_WAIT_1", "ESTABLISHED"),
      stage: seq12([C_CLOSE, C_FIN], { laneState: { cli: state("FIN_WAIT_1", "warn"), ker: state("ESTABLISHED", "ok"), app: state("lendo/escrevendo") } }),
    },
    {
      kind: "conceito",
      nav: "CLOSE_WAIT",
      title: "O kernel confirma; falta a aplicação fechar",
      body: [
        `O kernel do servidor responde ACK (\`ack=${CA + 1}\`) **sozinho**, sem consultar a aplicação. O cliente passa a **FIN_WAIT_2** e o servidor a **CLOSE_WAIT**: "recebi o FIN do par e estou esperando a *minha aplicação* fechar".`,
        "Para a aplicação, o FIM do fluxo aparece como **EOF**: `read()` devolve -1. É o sinal para encerrar o que estiver fazendo e chamar `close()`.",
      ],
      changes: ["+ ACK do FIN", "+ EOF para a aplicação", "servidor: CLOSE_WAIT"],
      metrics: m12("FIN_WAIT_2", "CLOSE_WAIT", { id: "who", label: "Quem precisa agir", value: "a aplicação", tone: "warn" }),
      stage: seq12([C_CLOSE, C_FIN, C_ACK, C_EOF], { laneState: { cli: state("FIN_WAIT_2", "warn"), ker: state("CLOSE_WAIT", "warn"), app: state("recebeu EOF", "warn") } }),
    },
    {
      kind: "conceito",
      nav: "LAST_ACK",
      title: "A aplicação chama close(): o servidor envia o seu FIN",
      body: [
        `Quando a aplicação chama \`close()\`, o kernel envia o **FIN do servidor** (\`seq=${SA}\`) e passa a **LAST_ACK**, esperando a confirmação final.`,
        "É a quarta via: o segundo sentido da conexão está sendo fechado.",
      ],
      changes: ["+ close() da aplicação", "+ FIN do servidor", "servidor: LAST_ACK"],
      metrics: m12("FIN_WAIT_2", "LAST_ACK"),
      stage: seq12([C_CLOSE, C_FIN, C_ACK, C_EOF, C_APPCLOSE, C_SFIN], { laneState: { cli: state("FIN_WAIT_2", "warn"), ker: state("LAST_ACK", "warn"), app: state("fechou") } }),
    },
    {
      kind: "solucao",
      nav: "TIME_WAIT",
      title: "O ACK final: o servidor fecha, o cliente espera",
      body: [
        `O cliente confirma o FIN do servidor (\`ack=${SA + 1}\`). O servidor vai para **CLOSED** e libera tudo. Já o cliente, que fechou primeiro, entra em **TIME_WAIT**, e o socket continua ocupado por um tempo.`,
        "São quatro segmentos no total: FIN, ACK, FIN, ACK. Em muitas implementações o ACK do primeiro FIN e o FIN do servidor podem vir juntos (3 segmentos), quando a aplicação fecha logo.",
      ],
      changes: ["+ ACK final", "servidor: CLOSED", "cliente: TIME_WAIT"],
      metrics: m12("TIME_WAIT", "CLOSED"),
      terminal: { suggest: [TW_CMD], outputs: { [TW_CMD]: SS_TW } },
      stage: seq12([C_CLOSE, C_FIN, C_ACK, C_EOF, C_APPCLOSE, C_SFIN, C_LAST], { laneState: { cli: state("TIME_WAIT", "warn"), ker: state("CLOSED"), app: state("fechou") } }),
    },
    {
      kind: "conceito",
      nav: "2×MSL",
      title: "Por que esperar no TIME_WAIT",
      body: [
        "O tempo de espera é **2×MSL** (*maximum segment lifetime*); no Linux é fixo em **60 s**. Há dois motivos: (1) o ACK final pode se perder, e o servidor reenviaria o FIN, que o cliente precisa estar lá para confirmar; (2) segmentos atrasados da conexão antiga não podem ser confundidos com os de uma conexão nova na mesma quádrupla (IP e porta de origem e destino).",
        "Quem fecha **primeiro** paga o TIME_WAIT. Se for o servidor que fecha, é ele que acumula sockets nesse estado.",
      ],
      callout: { kind: "bom-saber", text: "TIME_WAIT não é erro. Dezenas de milhares dele em quem abre uma conexão por requisição são normais, mas podem esgotar as portas efêmeras." },
      changes: ["cliente: espera 60 s antes de liberar a porta"],
      metrics: m12("TIME_WAIT", "CLOSED", { id: "tw", label: "Espera", value: "60 s", tone: "warn" }),
      terminal: { suggest: [TW_CMD], outputs: { [TW_CMD]: SS_TW } },
      stage: seq12([C_CLOSE, C_FIN, C_ACK, C_EOF, C_APPCLOSE, C_SFIN, C_LAST], {
        laneState: { cli: state("TIME_WAIT", "warn"), ker: state("CLOSED"), app: state("fechou") },
        brackets: [{ fromAt: 12, toAt: 14, label: "2×MSL = 60 s" }],
      }),
    },
    {
      kind: "problema",
      nav: "CLOSE_WAIT sobe",
      title: "O bug: CLOSE_WAIT que não sai mais",
      body: [
        "Se a aplicação **nunca** chama `close()` (uma conexão esquecida num erro, um `finally` ausente), o servidor fica em CLOSE_WAIT **para sempre**: o kernel não fecha por ela. O cliente, em FIN_WAIT_2, desiste depois do `tcp_fin_timeout` (60 s), mas o servidor não.",
        "Cada conexão presa segura um descritor de arquivo e memória. A contagem sobe até **Too many open files**. CLOSE_WAIT acumulando é sempre bug da aplicação.",
      ],
      callout: { kind: "atencao", text: "CLOSE_WAIT acumulando não se resolve no kernel nem com sysctl: a correção é chamar close() em todos os caminhos." },
      changes: ["a aplicação não chama close()", "CLOSE_WAIT: 4.210 e subindo"],
      metrics: m12("FIN_WAIT_2 → fechado", "CLOSE_WAIT", { id: "cw", label: "CLOSE_WAIT", value: "4.210", tone: "bad" }),
      terminal: { suggest: [CW_CMD, "ss -tan state close-wait"], outputs: { [CW_CMD]: "4210", "ss -tan state close-wait": SS_CW } },
      stage: seq12([C_CLOSE, C_FIN, C_ACK, C_EOF], {
        laneState: { cli: state("FIN_WAIT_2", "warn"), ker: state("CLOSE_WAIT", "bad"), app: state("nunca chama close()", "bad") },
        notes: [note("app", 6, "conexão esquecida: vazamento de descritor", "bad")],
      }),
    },
    {
      kind: "solucao",
      nav: "Sempre close()",
      title: "A cura: fechar em todos os caminhos",
      body: [
        "Use `try-with-resources` para que `close()` rode em sucesso, exceção e timeout. Ao receber o EOF (`read()` igual a -1), encerre a conexão imediatamente.",
        "Com isso, o servidor vai de CLOSE_WAIT a LAST_ACK e CLOSED em milissegundos, e os 4.210 sockets presos somem na próxima implantação.",
      ],
      changes: ["+ close() no finally", "CLOSE_WAIT volta a 0"],
      metrics: m12("TIME_WAIT", "CLOSED", { id: "cw", label: "CLOSE_WAIT", value: 0, tone: "ok" }),
      stage: seq12([C_CLOSE, C_FIN, C_ACK, C_EOF, msg("c4", "app", "ker", 6, "close() no finally", { tone: "ok" }), msg("c5", "ker", "cli", 7, `FIN, ACK seq=${SA}`, { tone: "ctrl" }), msg("c6", "cli", "ker", 8, `ACK ack=${SA + 1}`, { tone: "ok" })], {
        laneState: { cli: state("TIME_WAIT", "warn"), ker: state("CLOSED"), app: state("fechou", "ok") },
      }),
    },
    {
      kind: "conceito",
      nav: "RST",
      title: "RST: o fechamento abrupto",
      body: [
        "Nem todo fim é um FIN. O **RST** derruba a conexão na hora, sem espera nem TIME_WAIT. Surge quando alguém escreve num socket que o par já fechou, quando um SYN chega a uma porta sem processo ouvindo, ou quando a aplicação usa `SO_LINGER` com tempo 0.",
        "O outro lado vê `Connection reset by peer` (`ECONNRESET`) e perde qualquer dado ainda não lido. É o erro que um cliente recebe de um servidor que caiu ou de um firewall que descartou o estado da conexão.",
      ],
      changes: ["+ dados para socket fechado", "+ RST derruba a conexão"],
      metrics: m12("CLOSED", "CLOSED", { id: "err", label: "Erro no cliente", value: "ECONNRESET", tone: "bad" }),
      stage: seq12(
        [msg("r1", "cli", "ker", 0, "dados · seq=" + CA, { tone: "data" }), msg("r2", "ker", "cli", 1, "RST (porta sem socket)", { tone: "bad" })],
        { laneState: { cli: state("CLOSED", "bad"), ker: state("sem estado"), app: state("–") }, notes: [note("cli", 2, "Connection reset by peer", "bad")] },
      ),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Quem fecha, espera; quem esquece, vaza",
      body: [
        "Fechamento normal: **FIN, ACK, FIN, ACK**. O lado ativo passa por FIN_WAIT_1, FIN_WAIT_2 e TIME_WAIT (60 s); o passivo, por CLOSE_WAIT e LAST_ACK. O kernel confirma o FIN sozinho, mas só a aplicação pode disparar o FIN do seu lado.",
        "**TIME_WAIT** é saudável; **CLOSE_WAIT acumulando** é bug. **RST** é o fechamento abrupto, com perda de dados.",
      ],
      changes: ["Todos os estados do fechamento"],
      metrics: m12("TIME_WAIT", "CLOSED"),
      stage: seq12([C_CLOSE, C_FIN, C_ACK, C_EOF, C_APPCLOSE, C_SFIN, C_LAST], { laneState: { cli: state("TIME_WAIT", "warn"), ker: state("CLOSED"), app: state("fechou") } }),
    },
  ],
};

// =====================================================================================
// Cena 13: controle de fluxo e janela deslizante (sequência + gráficos)
// =====================================================================================

const LANES13: SeqLane[] = [
  { id: "snd", label: "Remetente (rápido)", icon: "server", tone: "arcane" },
  { id: "rcv", label: "Receptor (aplicação lenta)", icon: "cpu", tone: "ember" },
];
const seq13 = (messages: SeqMessage[], extra: Partial<Seq> = {}): Seq => ({ mode: "sequence", lanes: LANES13, messages, ...extra });
const m13 = (win: string, buf: string, c?: Metric): Metric[] => [{ id: "win", label: "Janela anunciada", value: win, tone: win.startsWith("0") ? "bad" : undefined }, { id: "buf", label: "Buffer ocupado", value: buf }, ...(c ? [c] : [])];

/** Janela anunciada (KB) ao longo do tempo (ms), com RTT de 20 ms e buffer de 16 KB. */
const RWND_FULL: [number, number][] = [[0, 16], [10, 8], [30, 0], [260, 0], [300, 8], [320, 0]];
const rwndChart = (k: number): ChartPanel => ({
  kind: "chart",
  label: "Janela de recepção anunciada (KB)",
  xLabel: "tempo (ms)",
  yLabel: "KB",
  series: [
    { label: " ", points: RWND_FULL, tone: "muted" },
    { label: "janela", points: RWND_FULL.slice(0, k), tone: "active" },
  ],
  markerX: RWND_FULL[k - 1][0],
});
const bufferBars = (used: number): Panel => ({
  kind: "bars",
  label: "Buffer de recepção de 16 KB",
  values: [used, 16 - used],
  tones: { 0: "compare", 1: "done" },
  pointers: [{ index: 0, label: "ocupado" }, { index: 1, label: "livre" }],
});

const F1 = msg("f1", "snd", "rcv", 0, "dados 8 KB · seq=1", { span: 1, tone: "data" });
const F2 = msg("f2", "rcv", "snd", 2, "ACK ack=8193 · win=8192", { span: 1, tone: "ok" });
const F3 = msg("f3", "snd", "rcv", 4, "dados 8 KB · seq=8193", { span: 1, tone: "data" });
const F4 = msg("f4", "rcv", "snd", 6, "ACK ack=16385 · win=0", { span: 1, tone: "bad" });
const P1 = msg("p1", "snd", "rcv", 0, "sonda de janela zero", { span: 1, tone: "ctrl" });
const P2 = msg("p2", "rcv", "snd", 2, "ACK ack=16385 · win=0", { span: 1, tone: "bad" });

const SS_FULL = ["# no receptor (203.0.113.10)", "State  Recv-Q  Send-Q   Local Address:Port    Peer Address:Port", "ESTAB  16384   0         203.0.113.10:8080    198.51.100.7:51514"].join("\n");
const TCP_RMEM = "sysctl net.ipv4.tcp_rmem";
const WS_CMD = "sysctl net.ipv4.tcp_window_scaling";

const scaleGrid: GridPanel = {
  kind: "grid",
  label: "Vazão máxima com janela de 64 KB (65.535 B), por RTT",
  colHeaders: ["RTT", "Vazão máxima", "Com escala 7 (≈ 8 MB)"],
  rows: [
    ["1 ms", "524 Mbit/s", "67 Gbit/s"],
    ["10 ms", "52 Mbit/s", "6,7 Gbit/s"],
    ["50 ms", "10,5 Mbit/s", "1,3 Gbit/s"],
    ["100 ms", "5,2 Mbit/s", "671 Mbit/s"],
  ],
  tones: [{ r: 3, c: 1, tone: "bad" }, { r: 3, c: 2, tone: "done" }],
};

export const controleDeFluxo: SceneDef = {
  title: "Controle de fluxo: a janela do receptor",
  summary: "Veja a janela anunciada encolher até zero quando a aplicação do receptor é lenta, as sondas de janela zero e a retomada.",
  shell: "bash",
  goals: [
    { text: "Entender que cada ACK anuncia a janela de recepção", step: 2 },
    { text: "Ver a janela chegar a zero e o remetente parar", step: 4 },
    { text: "Explicar a sonda de janela zero e a reabertura", step: 6 },
    { text: "Saber por que a escala de janela existe", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Dois ritmos",
      title: "O remetente é rápido; a aplicação, lenta",
      body: [
        "O servidor despeja dados mais depressa do que a aplicação do receptor consegue ler do socket (um processamento pesado, um banco lento). Os dados esperam no **buffer de recepção** do kernel, que tem 16 KB neste exemplo.",
        "Se ninguém avisar o remetente, o buffer transborda e os segmentos novos são descartados e reenviados. O **controle de fluxo** evita isso: o receptor diz quanto espaço ainda tem.",
      ],
      changes: ["buffer de 16 KB vazio"],
      metrics: m13("16 KB", "0 KB"),
      extra: [rwndChart(1), bufferBars(0)],
      stage: seq13([], { notes: [note("rcv", 0, "buffer de 16 KB vazio; a aplicação lê devagar", "info")] }),
    },
    {
      kind: "conceito",
      nav: "Janela no ACK",
      title: "Todo ACK anuncia a janela",
      body: [
        "Cada segmento do receptor leva o campo **janela** (rwnd): quantos bytes ainda cabem no buffer. O remetente nunca deixa mais do que isso **em trânsito sem confirmação**.",
        "Chegaram 8 KB e a aplicação ainda não leu nada, então o ACK anuncia `win=8192`. A janela é **deslizante**: avança conforme os ACKs chegam e a aplicação consome.",
      ],
      changes: ["+ 8 KB de dados", "+ ACK com win=8192", "buffer: 8 KB ocupados"],
      metrics: m13("8 KB", "8 KB"),
      extra: [rwndChart(2), bufferBars(8)],
      stage: seq13([F1, F2]),
    },
    {
      kind: "conceito",
      nav: "Envio limitado",
      title: "O remetente só envia o que a janela permite",
      body: [
        "Com `win=8192`, o remetente envia mais 8 KB (`seq=8193`). A aplicação continuou sem ler, então o buffer enche: 16 KB ocupados.",
        "O ACK seguinte anuncia **`win=0`**. A janela efetiva é o menor entre a janela do receptor (rwnd) e a de congestionamento (cwnd), que é o assunto da próxima aula.",
      ],
      callout: { kind: "chave", text: "Envio efetivo = min(rwnd, cwnd). O receptor protege a si mesmo; a rede é protegida pelo cwnd." },
      changes: ["+ 8 KB de dados", "+ ACK com win=0", "buffer: 16 KB ocupados"],
      metrics: m13("0 KB", "16 KB"),
      terminal: { suggest: ["ss -tn"], outputs: { "ss -tn": SS_FULL } },
      extra: [rwndChart(3), bufferBars(16)],
      stage: seq13([F1, F2, F3, F4]),
    },
    {
      kind: "problema",
      nav: "Janela zero",
      title: "Janela zero: o remetente para",
      body: [
        "Com `win=0`, o remetente **não pode enviar mais nada**. A conexão continua ESTABLISHED e sem erro algum, só parada. No remetente, o `Send-Q` do `ss` cresce e a aplicação que escreve acaba bloqueada em `write()`.",
        "Quando um serviço trava sem erro, sem CPU e sem tráfego, uma janela zero é suspeita clássica: o culpado é a aplicação do outro lado, que parou de ler.",
      ],
      callout: { kind: "atencao", text: "Janela zero não é falha de rede: é o receptor pedindo uma pausa. Procure a thread que parou de ler o socket." },
      changes: ["remetente bloqueado"],
      metrics: m13("0 KB", "16 KB", { id: "send", label: "Remetente", value: "parado", tone: "bad" }),
      extra: [rwndChart(3), bufferBars(16)],
      stage: seq13([F1, F2, F3, F4], { laneState: { snd: state("bloqueado (win=0)", "bad"), rcv: state("buffer cheio", "warn") }, notes: [note("snd", 8, "não envia mais nada", "bad")] }),
    },
    {
      kind: "conceito",
      nav: "Sonda",
      title: "Sondas de janela zero",
      body: [
        "E se o aviso de que a janela reabriu se perder? Os dois lados esperariam para sempre. Por isso o remetente tem o **temporizador de persistência**: periodicamente ele manda uma **sonda de janela zero**, um segmento mínimo que provoca um ACK com a janela atual.",
        "O intervalo começa na casa do RTO (mínimo de 200 ms no Linux) e **dobra** a cada sonda sem sucesso, até o teto de 120 s. Aqui, o receptor responde de novo `win=0`: ainda cheio.",
      ],
      changes: ["+ sonda de janela zero", "+ ACK com win=0"],
      metrics: m13("0 KB", "16 KB", { id: "probe", label: "Sonda", value: "≈ 200 ms" }),
      extra: [rwndChart(4), bufferBars(16)],
      stage: seq13([P1, P2], { laneState: { snd: state("sondando", "warn"), rcv: state("buffer cheio", "warn") }, notes: [note("snd", 4, "novas sondas em intervalos crescentes", "info")] }),
    },
    {
      kind: "solucao",
      nav: "Janela reabre",
      title: "A aplicação lê e a janela reabre",
      body: [
        "A aplicação finalmente lê 8 KB do socket: o buffer cai de 16 para 8 KB. O receptor envia uma **atualização de janela** espontânea, um ACK sem dados com `win=8192`.",
        "O kernel só anuncia a nova janela quando houver espaço relevante (pelo menos 1 MSS ou metade do buffer), para evitar a *silly window syndrome*, em que a conexão trocaria pacotes minúsculos.",
      ],
      changes: ["a aplicação lê 8 KB", "+ atualização de janela win=8192", "buffer: 8 KB ocupados"],
      metrics: m13("8 KB", "8 KB", { id: "send", label: "Remetente", value: "liberado", tone: "ok" }),
      extra: [rwndChart(5), bufferBars(8)],
      stage: seq13([P1, P2, msg("u0", "rcv", "rcv", 4, "app lê 8 KB: buffer 16 → 8", { tone: "ctrl" }), msg("u1", "rcv", "snd", 5, "ACK ack=16385 · win=8192 (atualização)", { span: 1, tone: "ok" })], {
        laneState: { snd: state("liberado", "ok"), rcv: state("lendo", "ok") },
      }),
    },
    {
      kind: "conceito",
      nav: "Retoma",
      title: "O ritmo passa a ser o da aplicação",
      body: [
        "O remetente retoma e envia 8 KB (`seq=16385`). Chegam, o buffer volta a ficar cheio e o próximo ACK é `win=0`. O padrão se repete: **a vazão da conexão converge para a velocidade com que a aplicação lê**.",
        "Isso é uma propriedade, e não um defeito: o controle de fluxo é uma pressão contrária (*backpressure*) automática, que impede um produtor rápido de afogar um consumidor lento.",
      ],
      changes: ["+ 8 KB de dados", "+ ACK com win=0"],
      metrics: m13("0 KB", "16 KB", { id: "rate", label: "Vazão", value: "= leitura do app", tone: "warn" }),
      extra: [rwndChart(6), bufferBars(16)],
      stage: seq13([msg("r1", "snd", "rcv", 0, "dados 8 KB · seq=16385", { span: 1, tone: "data" }), msg("r2", "rcv", "snd", 2, "ACK ack=24577 · win=0", { span: 1, tone: "bad" })], {
        notes: [note("rcv", 4, "e o ciclo recomeça", "info")],
      }),
    },
    {
      kind: "conceito",
      nav: "Escala de janela",
      title: "O campo de 16 bits é pequeno demais",
      body: [
        "O campo janela tem 16 bits: no máximo 65.535 bytes. Em um RTT de 100 ms, isso limita a vazão a 5,2 Mbit/s, **por mais rápida que seja a rede**, porque só 64 KB podem estar em trânsito por RTT.",
        "A opção **escala de janela** (RFC 7323), combinada só no SYN, multiplica o campo por 2ⁿ. Com n = 7, a janela chega a ~8 MB. O Linux a liga por padrão.",
      ],
      callout: { kind: "bom-saber", text: "O valor da escala vale para a conexão inteira e é negociado só no SYN. Firewalls que removem opções TCP derrubam o desempenho." },
      changes: ["+ SYN com escala 7", "limite sobe de 64 KB para ~8 MB"],
      metrics: m13("até 8 MB", "–", { id: "ws", label: "Escala", value: "× 128" }),
      terminal: { suggest: [WS_CMD], outputs: { [WS_CMD]: "net.ipv4.tcp_window_scaling = 1" } },
      extra: [scaleGrid],
      stage: seq13([msg("w1", "snd", "rcv", 0, "SYN · win 64240 · wscale 7", { span: 1, tone: "ctrl" }), msg("w2", "rcv", "snd", 2, "SYN-ACK · win 65160 · wscale 7", { span: 1, tone: "ctrl" })], {
        notes: [note("snd", 4, "janela real = campo × 128", "info")],
      }),
    },
    {
      kind: "tradeoff",
      nav: "Buffer grande",
      title: "Buffer maior, janela maior, mais memória",
      body: [
        "Para encher um caminho longo e rápido, a janela precisa ser tão grande quanto o **produto banda × atraso** (BDP): 1 Gbit/s com 50 ms de RTT pede ~6 MB em trânsito. Buffers pequenos limitam a vazão.",
        "Buffers grandes custam memória **por conexão**. O Linux ajusta o buffer automaticamente (*autotuning*) entre o mínimo, o padrão e o máximo de `net.ipv4.tcp_rmem`, para não reservar o máximo para todo mundo.",
      ],
      changes: ["+ BDP ≈ 6 MB para 1 Gbit/s e 50 ms"],
      metrics: m13("até 6 MB", "–", { id: "bdp", label: "BDP (1 Gbit/s, 50 ms)", value: "≈ 6 MB" }),
      terminal: { suggest: [TCP_RMEM], outputs: { [TCP_RMEM]: "net.ipv4.tcp_rmem = 4096\t131072\t6291456" } },
      stage: seq13([msg("b1", "snd", "rcv", 0, "6 MB em trânsito", { span: 3, tone: "data" }), msg("b2", "rcv", "snd", 4, "ACKs liberam a janela", { span: 1, tone: "ok" })], {
        brackets: [{ fromAt: 0, toAt: 5, label: "1 RTT = 50 ms" }],
      }),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O receptor dita o ritmo",
      body: [
        "A **janela de recepção** vai em todo ACK e diz quanto o buffer do receptor ainda aguenta. Janela zero para o remetente; as **sondas** descobrem quando reabre; a **escala de janela** destrava redes de grande BDP.",
        "O envio efetivo é **min(rwnd, cwnd)**: o receptor se protege com a primeira janela e a rede é protegida pela segunda.",
      ],
      changes: ["Fluxo: protege o receptor"],
      metrics: m13("rwnd", "–", { id: "eff", label: "Envio efetivo", value: "min(rwnd, cwnd)" }),
      extra: [rwndChart(6), bufferBars(16)],
      stage: seq13([F1, F2, F3, F4], { laneState: { snd: state("respeita a janela", "ok"), rcv: state("anuncia rwnd", "ok") } }),
    },
  ],
};

// =====================================================================================
// Cena 14: controle de congestionamento (sequência + gráfico de cwnd)
// =====================================================================================

const LANES14: SeqLane[] = [
  { id: "snd", label: "Remetente", icon: "server", tone: "arcane" },
  { id: "rcv", label: "Receptor (via gargalo)", icon: "cpu", tone: "sky" },
];
const seq14 = (messages: SeqMessage[], extra: Partial<Seq> = {}): Seq => ({ mode: "sequence", lanes: LANES14, messages, ...extra });
const m14 = (cwnd: number | string, ssthresh: number | string, fase: string, tone?: Metric["tone"]): Metric[] => [
  { id: "cwnd", label: "cwnd (MSS)", value: cwnd, tone },
  { id: "ss", label: "ssthresh (MSS)", value: ssthresh },
  { id: "fase", label: "Fase", value: fase },
];

/** cwnd (em MSS) por RTT no exemplo: IW10, ssthresh 40, perda por 3 ACKs duplicados em 44, timeout em 26. */
const CWND_FULL: [number, number][] = [[0, 10], [1, 20], [2, 40], [3, 41], [4, 42], [5, 43], [6, 44], [7, 22], [8, 23], [9, 24], [10, 25], [11, 26], [12, 1], [13, 2], [14, 4], [15, 8], [16, 13], [17, 14], [18, 15]];
const cwndChart = (k: number): ChartPanel => ({
  kind: "chart",
  label: "cwnd ao longo dos RTTs (Reno, em MSS)",
  xLabel: "RTT",
  yLabel: "cwnd",
  series: [
    { label: " ", points: CWND_FULL, tone: "muted" },
    { label: "cwnd", points: CWND_FULL.slice(0, k), tone: "active" },
  ],
  markerX: CWND_FULL[k - 1][0],
});

/** Uma rodada: n segmentos de ida e n ACKs de volta, ocupando 3 linhas a partir de `at`. */
const round = (id: string, at: number, n: number, label?: string, o: { lostData?: boolean; noAck?: boolean } = {}): SeqMessage[] => [
  msg(`${id}d`, "snd", "rcv", at, label ?? `${n} segmentos`, { span: 1, tone: o.lostData ? "bad" : "data", lost: o.lostData }),
  ...(o.noAck ? [] : [msg(`${id}a`, "rcv", "snd", at + 2, `${n} ACKs`, { span: 1, tone: "ok" as const })]),
];

const SS_CC = "sysctl net.ipv4.tcp_congestion_control";
const SS_CC_AV = "sysctl net.ipv4.tcp_available_congestion_control";
const SS_TI_CC = "ss -ti dst 203.0.113.10";

export const congestionamento: SceneDef = {
  title: "Congestionamento: slow start, AIMD e perdas",
  summary: "Siga a cwnd de uma conexão: crescimento exponencial, linear, o corte pela metade em 3 ACKs duplicados e o recomeço do zero depois de um timeout.",
  shell: "bash",
  goals: [
    { text: "Ver a cwnd dobrar a cada RTT no slow start", step: 2 },
    { text: "Distinguir perda por 3 ACKs duplicados de perda por timeout", step: 5 },
    { text: "Explicar o AIMD e o gráfico em dente de serra", step: 6 },
    { text: "Saber o que são CUBIC e BBR", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Rede compartilhada",
      title: "Ninguém diz ao remetente quanta banda há",
      body: [
        "A rede é compartilhada e o remetente não sabe quanto dela pode usar. Se enviar demais, as filas dos roteadores enchem e os pacotes se perdem; se enviar de menos, desperdiça a capacidade. Em 1986 esse excesso derrubou a internet da época (o **colapso de congestionamento**).",
        "O TCP resolve com uma segunda janela, a **cwnd** (janela de congestionamento), que o remetente mesmo calcula, sem ajuda da rede. Ele começa com a **janela inicial** (IW10 no Linux: 10 segmentos).",
      ],
      changes: ["cwnd inicial: 10 MSS"],
      metrics: m14(10, "∞", "slow start"),
      extra: [cwndChart(1)],
      stage: seq14(round("a", 0, 10, "10 segmentos (IW10)"), { laneState: { snd: state("slow start", "ok") }, brackets: [{ fromAt: 0, toAt: 3, label: "RTT 0" }] }),
    },
    {
      kind: "conceito",
      nav: "Slow start",
      title: "Slow start: dobra a cada RTT",
      body: [
        "Apesar do nome, o crescimento é **exponencial**: a cwnd aumenta 1 MSS a cada ACK recebido, o que dá o **dobro por RTT**: 10, 20, 40. É lento só em comparação com enviar tudo de uma vez.",
        "Cresce até a primeira perda ou até alcançar o **ssthresh** (*slow start threshold*), neste exemplo 40 MSS.",
      ],
      changes: ["cwnd: 10 → 20 → 40"],
      metrics: m14(40, 40, "slow start"),
      extra: [cwndChart(3)],
      stage: seq14([...round("a", 0, 10), ...round("b", 3, 20), ...round("c", 6, 40)], { laneState: { snd: state("slow start", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "Congestion avoid.",
      title: "Congestion avoidance: +1 MSS por RTT",
      body: [
        "Ao alcançar o ssthresh, o TCP passa para a **prevenção de congestionamento**: a cwnd aumenta apenas **1 MSS por RTT** (1/cwnd por ACK). 40, 41, 42, 43, 44.",
        "É o *additive increase*: a cautela de quem já está perto do limite e não sabe onde ele fica. O crescimento só termina quando alguma perda acontecer.",
      ],
      changes: ["cwnd: 40 → 41 → 42", "fase: congestion avoidance"],
      metrics: m14(44, 40, "congestion avoidance"),
      extra: [cwndChart(7)],
      stage: seq14([...round("a", 0, 41), ...round("b", 3, 42), ...round("c", 6, 43)], { laneState: { snd: state("congestion avoidance", "warn") } }),
    },
    {
      kind: "problema",
      nav: "3 ACKs dup.",
      title: "Uma perda: o receptor repete o ACK",
      body: [
        "Com cwnd = 44, o segmento 10 se perde. Os seguintes (11, 12, 13...) chegam, mas o receptor só pode confirmar até o 9: ele repete o mesmo `ack=10` a cada segmento fora de ordem. São os **ACKs duplicados**.",
        "Três ACKs duplicados seguidos são um sinal forte de que só **um** segmento se perdeu e a rede ainda entrega o resto. É uma perda moderada.",
      ],
      changes: ["segmento 10 perdido", "+ 3 ACKs duplicados (ack=10)"],
      metrics: m14(44, 40, "perda detectada", "bad"),
      extra: [cwndChart(7)],
      stage: seq14(
        [
          msg("l1", "snd", "rcv", 0, "seg 1–9", { tone: "data" }),
          msg("l2", "snd", "rcv", 1, "seg 10", { tone: "bad", lost: true }),
          msg("l3", "snd", "rcv", 2, "seg 11–44", { tone: "data" }),
          msg("l4", "rcv", "snd", 4, "ACK ack=10", { tone: "ok" }),
          msg("l5", "rcv", "snd", 5, "ACK ack=10 (duplicado 1)", { tone: "bad" }),
          msg("l6", "rcv", "snd", 6, "ACK ack=10 (duplicado 2)", { tone: "bad" }),
          msg("l7", "rcv", "snd", 7, "ACK ack=10 (duplicado 3)", { tone: "bad" }),
        ],
        { notes: [note("snd", 8, "3 ACKs duplicados: o seg 10 se perdeu", "bad")] },
      ),
    },
    {
      kind: "solucao",
      nav: "Fast retransmit",
      title: "Fast retransmit e fast recovery",
      body: [
        "Ao terceiro ACK duplicado, o remetente reenvia o segmento 10 **sem esperar o timeout** (*fast retransmit*) e **corta a cwnd pela metade**: ssthresh = 44/2 = 22 e cwnd = 22 (*fast recovery*, no Reno). A conexão não volta ao zero.",
        "O ACK `ack=45` mostra que tudo chegou. Em CUBIC, o padrão do Linux, o corte é menor: a cwnd fica em cerca de 70% do valor antes da perda.",
      ],
      callout: { kind: "chave", text: "Perda por 3 ACKs duplicados: cwnd e ssthresh caem à metade (Reno). Perda por timeout: cwnd cai a 1 MSS." },
      changes: ["+ seg 10 retransmitido", "cwnd 44 → 22", "ssthresh 40 → 22"],
      metrics: m14(22, 22, "fast recovery", "warn"),
      extra: [cwndChart(8)],
      stage: seq14([msg("x1", "snd", "rcv", 0, "seg 10 retransmitido", { span: 1, tone: "ctrl" }), msg("x2", "rcv", "snd", 2, "ACK ack=45 (tudo recebido)", { span: 1, tone: "ok" })], {
        notes: [note("snd", 4, "ssthresh = cwnd/2 = 22; cwnd = 22", "warn")],
      }),
    },
    {
      kind: "conceito",
      nav: "AIMD",
      title: "AIMD: a serra que reparte a banda",
      body: [
        "Somando as fases, o TCP faz **AIMD**: *additive increase, multiplicative decrease*. Sobe 1 MSS por RTT, cai pela metade na perda. O gráfico forma um dente de serra: 22, 23, 24, 25, 26...",
        "É o que faz conexões concorrentes **convergirem para uma divisão justa** do gargalo: quem usa mais cai mais em termos absolutos. Nenhuma coordenação é necessária.",
      ],
      changes: ["cwnd: 22 → 23 → 24 → 25 → 26"],
      metrics: m14(26, 22, "congestion avoidance"),
      extra: [cwndChart(12)],
      stage: seq14([...round("a", 0, 23), ...round("b", 3, 24), ...round("c", 6, 25)], { laneState: { snd: state("congestion avoidance", "warn") } }),
    },
    {
      kind: "problema",
      nav: "Timeout",
      title: "Timeout: nenhum ACK volta",
      body: [
        "Agora a rede some por um instante (um enlace caiu, o roteador reiniciou): **nenhum** ACK chega, nem duplicado. O remetente só descobre quando o temporizador de retransmissão (RTO, mínimo de 200 ms no Linux) expira.",
        "Sem nenhum ACK, o TCP não sabe quanto da rede ainda funciona. Assume o pior: ssthresh = 26/2 = 13 e **cwnd = 1 MSS**. O RTO ainda dobra a cada nova tentativa.",
      ],
      callout: { kind: "atencao", text: "Timeouts são muito mais caros do que a recuperação rápida: o fluxo recomeça do zero e ainda perde pelo menos 200 ms parado." },
      changes: ["26 segmentos sem nenhum ACK", "+ RTO expira", "cwnd 26 → 1; ssthresh 22 → 13"],
      metrics: m14(1, 13, "RTO", "bad"),
      extra: [cwndChart(13)],
      stage: seq14(
        [msg("t1", "snd", "rcv", 0, "26 segmentos", { tone: "bad", lost: true }), msg("t2", "snd", "snd", 4, "RTO expira (≥ 200 ms)", { tone: "bad" }), msg("t3", "snd", "rcv", 5, "seg 1 retransmitido · cwnd = 1", { span: 1, tone: "ctrl" })],
        { brackets: [{ fromAt: 0, toAt: 4, label: "RTO" }], laneState: { snd: state("RTO", "bad") } },
      ),
    },
    {
      kind: "conceito",
      nav: "Recomeça do 1",
      title: "Recomeço: slow start de novo, até 13",
      body: [
        "Depois do timeout, o TCP faz **slow start** a partir de 1 MSS: 1, 2, 4, 8. Quando chegaria a 16, ele para em 13 (o novo ssthresh) e passa à congestion avoidance: 14, 15...",
        "O custo de um timeout aparece no gráfico: a cwnd despenca de 26 a 1 e leva vários RTTs para voltar ao patamar anterior. Em redes de alta latência, isso pode ser segundos.",
      ],
      changes: ["cwnd: 1 → 2 → 4", "até 8, depois 13 e 14"],
      metrics: m14(15, 13, "congestion avoidance"),
      extra: [cwndChart(19)],
      stage: seq14([...round("a", 0, 1), ...round("b", 3, 2), ...round("c", 6, 4)], { laneState: { snd: state("slow start", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "CUBIC e BBR",
      title: "No Linux, o padrão é o CUBIC",
      body: [
        "O que vimos é o **Reno**, a base didática. O Linux usa **CUBIC** por padrão: depois de uma perda, a cwnd cresce segundo uma função cúbica do tempo desde a perda (rápido longe do limite anterior, cauteloso perto dele), com corte de cerca de 30%, e não de 50%.",
        "O **BBR** é uma alternativa que, em vez de reagir a perdas, estima a banda do gargalo e o RTT mínimo para decidir o ritmo. Ajuda em links com perda não relacionada a congestionamento, e se escolhe por conexão ou no `sysctl`.",
      ],
      callout: { kind: "bom-saber", text: "O algoritmo muda como a cwnd cresce e cai, mas as ideias (cwnd, ssthresh, ACKs como relógio) continuam as mesmas." },
      changes: ["cwnd calculada por CUBIC ou BBR"],
      metrics: m14("variável", "variável", "CUBIC (padrão)"),
      terminal: {
        suggest: [SS_CC, SS_CC_AV, SS_TI_CC],
        outputs: {
          [SS_CC]: "net.ipv4.tcp_congestion_control = cubic",
          [SS_CC_AV]: "net.ipv4.tcp_available_congestion_control = reno cubic bbr",
          [SS_TI_CC]: ["State  Recv-Q  Send-Q   Local Address:Port    Peer Address:Port", "ESTAB  0       0         198.51.100.7:51514   203.0.113.10:8080", "\t cubic wscale:7,7 rto:212 rtt:12.5/6.2 mss:1448 pmtu:1500 cwnd:44 ssthresh:31"].join("\n"),
        },
      },
      extra: [cwndChart(19)],
      stage: seq14([...round("a", 0, 44)], { notes: [note("snd", 3, "CUBIC: ~70% da cwnd após perda; BBR: estima banda e RTT", "info")], laneState: { snd: state("CUBIC", "ok") } }),
    },
    {
      kind: "tradeoff",
      nav: "Conexão nova",
      title: "Conexões novas são lentas",
      body: [
        "Uma conexão nova começa com cwnd = 10 (14,5 KB por RTT). Para encher um enlace de 1 Gbit/s com 50 ms de RTT, que comporta ~6 MB em trânsito (4.300 segmentos), o slow start precisa de cerca de **9 RTTs: 450 ms**.",
        "Respostas menores que 14 KB cabem na janela inicial e terminam em 1 RTT, mas transferências médias passam quase toda a vida no slow start. É um dos motivos para reaproveitar conexões (keep-alive, pool) em vez de abrir uma por requisição.",
      ],
      changes: ["+ 9 RTTs de slow start para 1 Gbit/s"],
      metrics: m14("10 → 4.300", "–", "9 RTTs ≈ 450 ms", "warn"),
      extra: [
        {
          kind: "chart",
          label: "Slow start até encher 1 Gbit/s × 50 ms (cwnd em MSS)",
          xLabel: "RTT",
          yLabel: "cwnd",
          logY: true,
          series: [{ label: "cwnd", points: [[0, 10], [1, 20], [2, 40], [3, 80], [4, 160], [5, 320], [6, 640], [7, 1280], [8, 2560], [9, 4316]], tone: "active" }],
        },
      ],
      stage: seq14([...round("a", 0, 10), ...round("b", 3, 20), ...round("c", 6, 40)], { notes: [note("snd", 9, "…até 4.316 segmentos no RTT 9", "info")] }),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Sobe até a perda, corta, e repete",
      body: [
        "**Slow start** dobra a cwnd por RTT até o ssthresh; a **congestion avoidance** soma 1 MSS por RTT; **3 ACKs duplicados** cortam à metade (fast retransmit e fast recovery); **timeout** volta a 1 MSS.",
        "Linux usa CUBIC por padrão, e BBR é uma alternativa. O envio efetivo é sempre min(rwnd, cwnd): o receptor e a rede, cada um com a sua janela.",
      ],
      changes: ["Todas as fases da cwnd"],
      metrics: m14("serra", "ssthresh", "AIMD"),
      extra: [cwndChart(19)],
      stage: seq14([...round("a", 0, 44)], { laneState: { snd: state("AIMD", "ok") } }),
    },
  ],
};

// =====================================================================================
// Cena 15: sockets, backlog, SYN queue e accept queue (iso)
// =====================================================================================

const P15 = (i: number) => rowXY(i, 3.6);

type Q15 = { syn?: number; synBadge?: string; synStatus?: Status; acc?: number; accBadge?: string; accStatus?: Status; app?: Status; appLabel?: string; atk?: boolean };

function filas(q: Q15 = {}): IsoEntity[] {
  const [cx, cy] = P15(1.5);
  return [
    users("cli", ...P15(0), 9, "clientes"),
    ...(q.atk ? [users("atk", 5.0, 1.4, 5, "atacantes")] : []),
    zone("kern", cx - 2.2, cy - 2.2, 4.4, 4.4, { label: "kernel", tone: "sky" }),
    box("syn", 1.0, 3.4, "list", "SYN queue", { parent: "kern", size: "sm", tone: "ember", meter: q.syn ?? 0, status: q.synStatus, badges: q.synBadge ? [{ text: q.synBadge, tone: q.synStatus === "bad" ? "bad" : "info" }] : undefined }),
    box("acc", 3.4, 1.0, "list", "accept queue", { parent: "kern", size: "sm", tone: "mana", meter: q.acc ?? 0, status: q.accStatus, badges: q.accBadge ? [{ text: q.accBadge, tone: q.accStatus === "bad" ? "bad" : "info" }] : undefined }),
    box("app", ...P15(3), "server", q.appLabel ?? "JVM", { size: "md", tone: "arcane", status: q.app }),
  ];
}

const m15 = (syn: string, acc: string, c?: Metric): Metric[] => [{ id: "syn", label: "SYN_RECV", value: syn }, { id: "acc", label: "Accept queue", value: acc }, ...(c ? [c] : [])];

const ssl = (recvq: number, sendq: number) => ["State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process", `LISTEN  ${String(recvq).padEnd(6)}  ${String(sendq).padEnd(6)}         *:8080               *:*`].join("\n");
const NSTAT_LISTEN = ["#kernel", "TcpExtListenOverflows           312                0.0", "TcpExtListenDrops               312                0.0"].join("\n");
const NSTAT_CMD = "nstat -az TcpExtListenOverflows TcpExtListenDrops";
const SOMAX = "sysctl net.core.somaxconn";
const SYNCK = "sysctl net.ipv4.tcp_syncookies";

const backlogGrid: GridPanel = {
  kind: "grid",
  label: "Quem limita cada fila",
  colHeaders: ["Fila", "Limite", "Como ver"],
  rows: [
    ["accept queue", "min(backlog do listen(), net.core.somaxconn)", "ss -ltn (Send-Q)"],
    ["SYN queue", "backlog e net.ipv4.tcp_max_syn_backlog", "ss -tan state syn-recv"],
    ["somaxconn", "4096 no Linux ≥ 5.4 (era 128)", "sysctl net.core.somaxconn"],
    ["ServerSocket(8080)", "backlog padrão do Java: 50", "ss -ltn mostra Send-Q 50"],
  ],
  tones: [{ r: 3, c: 1, tone: "bad" }],
};

const LINKS15 = [link("cli", "syn"), link("syn", "acc"), link("acc", "app")];

export const filasDoKernel: SceneDef = {
  title: "Sockets e as duas filas do kernel",
  summary: "Veja a SYN queue e a accept queue encherem quando o servidor demora a chamar accept(), e o que o cliente enxerga quando a fila transborda.",
  shell: "bash",
  goals: [
    { text: "Distinguir a SYN queue da accept queue", step: 3 },
    { text: "Saber o que limita o backlog (listen e somaxconn)", step: 4 },
    { text: "Reconhecer accept queue cheia e o SYN descartado", step: 6 },
    { text: "Entender SYN flood e SYN cookies", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "listen()",
      title: "listen() cria duas filas no kernel",
      body: [
        "Quando o servidor chama `listen()`, o kernel mantém, para aquele socket, **duas filas**: a **SYN queue** (conexões com o handshake incompleto) e a **accept queue** (conexões prontas, esperando a aplicação chamar `accept()`).",
        "No Java, `new ServerSocket(8080)` usa o backlog padrão de **50**: é o tamanho da accept queue, e aparece como `Send-Q` no `ss -ltn`.",
      ],
      metrics: m15("0", "0 / 50"),
      terminal: { suggest: ["ss -ltn"], outputs: { "ss -ltn": ssl(0, 50) } },
      focus: ["cli", "syn", "acc", "app"],
      stage: { mode: "iso", entities: filas(), links: LINKS15 },
    },
    {
      kind: "conceito",
      nav: "SYN queue",
      title: "O SYN chega: a conexão entra na SYN queue",
      body: [
        "Chega um SYN. O kernel responde SYN-ACK e guarda a conexão incompleta na **SYN queue** (estado SYN_RECV), à espera do terceiro segmento. Ainda não há nada para a aplicação.",
        "Cada entrada fica ali por cerca de um RTT, ou até o cliente desistir (o servidor retransmite o SYN-ACK algumas vezes). Isso é feito inteiramente pelo kernel.",
      ],
      changes: ["+ entrada em SYN_RECV"],
      metrics: m15("4", "0 / 50"),
      terminal: { suggest: ["ss -tan state syn-recv"], outputs: { "ss -tan state syn-recv": SS_SYNRECV } },
      focus: ["cli", "syn"],
      stage: { mode: "iso", entities: filas({ syn: 8, synBadge: "4 em SYN_RECV", synStatus: "hi" }), links: LINKS15, flows: [flow("cli", "syn", 2, { label: "SYN" })] },
    },
    {
      kind: "conceito",
      nav: "accept queue",
      title: "O ACK promove a conexão à accept queue",
      body: [
        "O ACK final do cliente completa o handshake. A conexão vira **ESTABLISHED** e **passa da SYN queue para a accept queue**. Para o cliente, `connect()` já retornou com sucesso.",
        "Dali a aplicação a retira com `accept()`, que devolve um `Socket` novo. Se a aplicação demora, a conexão fica esperando na fila, já estabelecida do ponto de vista da rede.",
      ],
      callout: { kind: "chave", text: "connect() com sucesso no cliente só prova que o kernel do servidor completou o handshake, e não que a aplicação aceitou a conexão." },
      changes: ["+ conexão na accept queue", "+ accept() entrega o Socket"],
      metrics: m15("0", "1 / 50"),
      terminal: { suggest: ["ss -ltn"], outputs: { "ss -ltn": ssl(1, 50) } },
      focus: ["syn", "acc", "app"],
      stage: { mode: "iso", entities: filas({ syn: 0, acc: 4, accBadge: "1 / 50", accStatus: "hi", app: "ok" }), links: LINKS15, flows: [flow("syn", "acc", 1, { label: "ACK" }), flow("acc", "app", 1, { kind: "data", label: "accept()" })] },
    },
    {
      kind: "conceito",
      nav: "Backlog",
      title: "Quem limita o tamanho das filas",
      body: [
        "A accept queue tem o tamanho **min(backlog passado ao `listen()`, `net.core.somaxconn`)**. O `somaxconn` é 4096 no Linux ≥ 5.4 (era 128 antes). Em Java, `new ServerSocket(8080, 1024)` pede 1024, e o kernel aplica o menor entre esse valor e o limite do sistema.",
        "Em containers, `somaxconn` é por *namespace* de rede: ajuste com `--sysctl net.core.somaxconn=...`, não no host.",
      ],
      changes: ["limites das filas"],
      metrics: m15("0", "0 / 50", { id: "som", label: "somaxconn", value: 4096 }),
      terminal: { suggest: [SOMAX], outputs: { [SOMAX]: "net.core.somaxconn = 4096" } },
      extra: [backlogGrid],
      focus: ["acc", "app"],
      stage: { mode: "iso", entities: filas({ app: "ok" }), links: LINKS15 },
    },
    {
      kind: "problema",
      nav: "App lenta",
      title: "A aplicação demora no accept()",
      body: [
        "Uma thread de aceitação ocupada (ela mesma atende a conexão, ou o pool está esgotado) para de chamar `accept()`. As conexões continuam chegando, **completam o handshake no kernel** e se acumulam na accept queue: 50 de 50.",
        "Os clientes enxergam a conexão estabelecida e mandam a requisição, que ninguém lê. O resultado costuma ser um **timeout de leitura**, e não de conexão. É um erro enganoso.",
      ],
      callout: { kind: "atencao", text: "Recv-Q de um socket LISTEN é a accept queue atual; se está perto de Send-Q, o servidor não está chamando accept() a tempo." },
      changes: ["accept queue: 50 / 50", "a aplicação não chama accept()"],
      metrics: m15("0", "50 / 50", { id: "cl", label: "Cliente vê", value: "connect OK, sem resposta", tone: "warn" }),
      terminal: { suggest: ["ss -ltn"], outputs: { "ss -ltn": ssl(50, 50) } },
      focus: ["acc", "app"],
      stage: { mode: "iso", entities: filas({ acc: 100, accBadge: "50 / 50", accStatus: "bad", app: "warn", appLabel: "JVM ocupada" }), links: LINKS15, flows: [flow("syn", "acc", 2), flow("acc", "app", 1, { kind: "heavy" })] },
    },
    {
      kind: "problema",
      nav: "SYN descartado",
      title: "Fila cheia: o SYN novo é descartado",
      body: [
        "Com a accept queue cheia, o kernel **descarta os SYNs novos** (e ignora ACKs finais de handshakes em andamento), sem responder nada. Os contadores `ListenOverflows` e `ListenDrops` sobem.",
        "O cliente, sem SYN-ACK, retransmite o SYN após **1 s, depois 3 s, depois 7 s** (acumulado). É a assinatura clássica: latências de conexão em degraus de 1, 3 e 7 segundos. Com `tcp_abort_on_overflow=1`, o servidor mandaria RST em vez de ignorar.",
      ],
      changes: ["+ SYN ignorado", "ListenOverflows em 312"],
      metrics: m15("0", "50 / 50", { id: "lat", label: "Latência de connect", value: "1 s, 3 s, 7 s", tone: "bad" }),
      terminal: { suggest: [NSTAT_CMD], outputs: { [NSTAT_CMD]: NSTAT_LISTEN } },
      focus: ["cli", "syn", "acc"],
      stage: { mode: "iso", entities: filas({ acc: 100, accBadge: "50 / 50", accStatus: "bad", app: "warn", appLabel: "JVM ocupada" }), links: LINKS15, flows: [flow("cli", "syn", 2, { kind: "bad", label: "SYN ignorado" })] },
    },
    {
      kind: "conceito",
      nav: "SYN flood",
      title: "SYN flood: a outra fila enchendo",
      body: [
        "Atacantes enviam milhares de SYNs com endereços forjados e **nunca completam** o handshake. A SYN queue enche de entradas que não vão virar conexão, e clientes legítimos não conseguem entrar.",
        "A defesa são os **SYN cookies**: com a fila cheia, o kernel não guarda mais estado e codifica a informação necessária no próprio número de sequência do SYN-ACK. Só quem responde com o ACK correto vira conexão. No Linux, `tcp_syncookies` vem ligado na maioria das distribuições.",
      ],
      changes: ["+ atacantes", "SYN queue: 100%"],
      metrics: m15("100%", "0 / 50", { id: "ck", label: "SYN cookies", value: "ligados", tone: "ok" }),
      terminal: { suggest: [SYNCK], outputs: { [SYNCK]: "net.ipv4.tcp_syncookies = 1" } },
      focus: ["atk", "syn"],
      stage: { mode: "iso", entities: filas({ atk: true, syn: 100, synBadge: "cheia", synStatus: "bad" }), links: [...LINKS15, link("atk", "syn")], flows: [flow("atk", "syn", 3, { kind: "bad" })] },
    },
    {
      kind: "solucao",
      nav: "Aceitar rápido",
      title: "A cura: aceitar e delegar",
      body: [
        "O laço de aceitação faz **só `accept()`** e entrega o socket a um executor (por exemplo, uma thread virtual por conexão). Nunca atende a conexão na própria thread de aceitação.",
        "A accept queue esvazia: 3 de 50. O backlog volta a ser apenas um amortecedor de picos, e não uma sala de espera permanente.",
      ],
      changes: ["accept queue: 50 → 3", "+ executor atende as conexões"],
      metrics: m15("0", "3 / 50", { id: "cl", label: "Cliente vê", value: "resposta normal", tone: "ok" }),
      terminal: { suggest: ["ss -ltn"], outputs: { "ss -ltn": ssl(3, 50) } },
      focus: ["acc", "app"],
      stage: { mode: "iso", entities: filas({ acc: 6, accBadge: "3 / 50", accStatus: "ok", app: "ok", appLabel: "JVM: accept + delega" }), links: LINKS15, flows: [flow("cli", "syn", 2), flow("syn", "acc", 2), flow("acc", "app", 4, { kind: "data" })] },
    },
    {
      kind: "tradeoff",
      nav: "Fila maior?",
      title: "Aumentar o backlog esconde o problema",
      body: [
        "Subir o backlog para 1024 absorve picos curtos, mas **não cria capacidade**: se o servidor processa menos do que chega, a fila só enche mais tarde, e quem está no fundo espera mais.",
        "Prefira falhar rápido: dimensione o servidor para a carga, mantenha o backlog moderado e meça o `Recv-Q` do LISTEN. Uma fila persistentemente alta é um alarme de saturação.",
      ],
      callout: { kind: "bom-saber", text: "Backlog alto é amortecedor, não capacidade. Alerte quando Recv-Q do LISTEN ficar perto do Send-Q." },
      changes: ["backlog 50 → 1024"],
      metrics: m15("0", "40 / 1024", { id: "lat", label: "Espera na fila", value: "cresce", tone: "warn" }),
      focus: ["acc", "app"],
      stage: { mode: "iso", entities: filas({ acc: 40, accBadge: "40 / 1024", accStatus: "warn", app: "warn", appLabel: "JVM saturada" }), links: LINKS15, flows: [flow("syn", "acc", 2), flow("acc", "app", 1, { kind: "heavy" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Duas filas, dois sintomas",
      body: [
        "**SYN queue**: handshakes incompletos; enche em SYN flood; os SYN cookies protegem. **Accept queue**: conexões prontas; enche quando a aplicação demora no `accept()`; cheia, o kernel descarta SYNs, e o cliente vê 1 s, 3 s, 7 s.",
        "O backlog é `min(listen, somaxconn)`; no Java, o padrão é 50. Meça com `ss -ltn` e `nstat`; a cura é aceitar rápido e delegar.",
      ],
      changes: ["SYN queue + accept queue"],
      metrics: m15("handshake", "accept()", { id: "bk", label: "Backlog", value: "min(listen, somaxconn)" }),
      focus: ["syn", "acc", "app"],
      stage: { mode: "iso", entities: filas({ app: "ok" }), links: LINKS15, flows: [flow("cli", "syn", 1), flow("syn", "acc", 1), flow("acc", "app", 1, { kind: "data" })] },
    },
  ],
};

// =====================================================================================
// Cena 16: servidor TCP em Java (thread por conexão, threads virtuais, Selector)
// =====================================================================================

const P16 = (i: number) => rowXY(i, 3.6);
const C16: [number, number] = [8.4, -8.4];
const around = (dx: number, dy: number): [number, number] => [C16[0] + dx, C16[1] + dy];
const SLOTS: [number, number][] = [around(-1.4, -1.4), around(1.4, -1.4), around(-1.4, 1.4), around(1.4, 1.4)];

const base16 = (): IsoEntity[] => [users("cli", ...P16(0), 9, "clientes"), box("acc", ...P16(1), "network", "accept()", { size: "md", tone: "sky" })];
const worker = (i: number, label: string, o: { status?: Status; meter?: number } = {}): IsoEntity => box(`w${i + 1}`, ...SLOTS[i], "cpu", label, { size: "sm", tone: "mana", status: o.status, meter: o.meter });

const m16 = (a: string, b: string, c?: Metric): Metric[] => [{ id: "a", label: "Threads do SO", value: a }, { id: "b", label: "Conexões", value: b }, ...(c ? [c] : [])];
const NLWP = "ps -o nlwp= -p 2841";
const CONNS = "ss -H -tn state established '( sport = :8080 )' | wc -l";

const modelGrid: GridPanel = {
  kind: "grid",
  label: "Modelos de servidor TCP em Java",
  colHeaders: ["Modelo", "Threads do SO", "Código", "Quando usar"],
  rows: [
    ["Uma thread, serial", "1", "simples", "ferramentas e testes"],
    ["Pool de threads", "tamanho do pool", "simples", "carga moderada, limite explícito"],
    ["Thread virtual por conexão", "≈ nº de núcleos", "simples", "I/O bloqueante em escala (Java 21+)"],
    ["NIO com Selector", "poucas (event loops)", "complexo", "máxima densidade, protocolo próprio"],
  ],
  tones: [0, 1, 2, 3].map((c) => ({ r: 2, c, tone: "done" as const })),
};

const virt = (carrierStatus?: Status, pinned?: boolean): IsoEntity[] => [
  ...[0, 1, 2, 3].map((i) => box(`w${i + 1}`, ...SLOTS[i], "cpu", `carrier ${i + 1}`, { size: "sm", tone: "mana", status: carrierStatus, badges: pinned && i < 2 ? [{ text: "pinned", tone: "warn" as const }] : undefined })),
  users("vts", 1.0, -14.0, 9, "threads virtuais"),
];

export const servidorTcp: SceneDef = {
  title: "Servidor TCP em Java: bloqueante, virtual e NIO",
  summary: "Compare uma thread por conexão, threads virtuais e um Selector: quantas threads do SO cada modelo usa para atender 10.000 conexões.",
  shell: "bash",
  goals: [
    { text: "Ver por que uma thread de SO por conexão não escala", step: 4 },
    { text: "Entender como threads virtuais liberam o carrier no read()", step: 5 },
    { text: "Entender o Selector e quando o NIO compensa", step: 6 },
    { text: "Conhecer os limites: pinning, timeouts e encerramento", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "accept()",
      title: "accept() devolve um Socket por conexão",
      body: [
        "Um `ServerSocket` bloqueia em `accept()` até haver uma conexão pronta e devolve um `Socket`. Dali em diante, `read()` e `write()` no `Socket` também **bloqueiam**: a thread que os chama fica parada até haver dados ou espaço.",
        "A pergunta de projeto é: **quem** executa esse `read()` e `write()`, para cada uma das milhares de conexões?",
      ],
      metrics: m16("1", "9 chegando"),
      focus: ["cli", "acc"],
      stage: { mode: "iso", entities: base16(), links: [link("cli", "acc")], flows: [flow("cli", "acc", 2)] },
    },
    {
      kind: "problema",
      nav: "Uma thread",
      title: "Uma thread só atende uma conexão por vez",
      body: [
        "Se a thread de aceitação também atende a conexão, ela fica presa no primeiro cliente lento. Os outros oito esperam na accept queue, mesmo com a CPU quase ociosa: a maior parte do tempo é espera de I/O.",
        "Com I/O bloqueante, o único jeito de atender dois clientes ao mesmo tempo é ter **duas threads**.",
      ],
      changes: ["+ uma thread atendendo", "8 clientes esperando"],
      metrics: m16("1", "1 atendida, 8 esperando", { id: "cpu", label: "CPU", value: "ociosa", tone: "warn" }),
      focus: ["acc", "w1"],
      stage: { mode: "iso", entities: [...base16(), box("w1", ...C16, "cpu", "uma thread", { size: "md", tone: "mana", status: "warn" })], links: [link("cli", "acc"), link("acc", "w1")], flows: [flow("cli", "acc", 3, { kind: "bad" }), flow("acc", "w1", 1)] },
    },
    {
      kind: "conceito",
      nav: "Thread por conexão",
      title: "Uma thread de plataforma por conexão",
      body: [
        "A solução clássica: depois do `accept()`, entregar o `Socket` a **uma thread própria** (`new Thread(...)` ou um executor). Cada conexão ganha o seu fluxo de código sequencial, fácil de ler.",
        "Cada thread de plataforma é uma thread do sistema operacional, com uma pilha (1 MB reservado por padrão em 64 bits). Algumas centenas ou poucos milhares funcionam bem.",
      ],
      changes: ["+ threads do SO", "cada conexão com sua thread"],
      metrics: m16("28", "4 conexões", { id: "mem", label: "Pilha por thread", value: "1 MB reservado" }),
      terminal: { suggest: [NLWP], outputs: { [NLWP]: "28" } },
      focus: ["acc", "w1", "w2", "w3", "w4"],
      stage: { mode: "iso", entities: [...base16(), worker(0, "thread 1"), worker(1, "thread 2"), worker(2, "thread 3"), worker(3, "thread 4")], links: [link("cli", "acc")], flows: [flow("acc", "w1", 1), flow("acc", "w2", 1), flow("acc", "w3", 1), flow("acc", "w4", 1)] },
    },
    {
      kind: "problema",
      nav: "10 mil threads",
      title: "Com 10.000 conexões, o modelo sofre",
      body: [
        "Dez mil conexões ociosas, mas abertas (chat, notificações), exigem **10.000 threads do SO**: até ~10 GB de pilha reservada (virtual), escalonamento caro e limites do sistema (`ulimit -u`, `kernel.threads-max`).",
        "Quase todas essas threads estão apenas **esperando** um `read()`: pagam o custo de existir sem fazer trabalho. Por isso se limita o pool (200 threads, por exemplo), o que cria fila de espera e reintroduz o problema do passo anterior.",
      ],
      changes: ["10.000 threads do SO", "memória: 90%"],
      metrics: m16("10.031", "10.000", { id: "mem", label: "Pilhas reservadas", value: "≈ 10 GB", tone: "bad" }),
      terminal: { suggest: [NLWP, CONNS], outputs: { [NLWP]: "10031", [CONNS]: "10000" } },
      focus: ["w1", "w2", "w3", "w4", "mem"],
      stage: {
        mode: "iso",
        entities: [...base16(), worker(0, "thread", { status: "bad", meter: 95 }), worker(1, "thread", { status: "bad", meter: 95 }), worker(2, "thread", { status: "warn", meter: 95 }), worker(3, "thread", { status: "warn", meter: 95 }), box("mem", ...around(4.2, -4.2), "hard-drive", "memória", { size: "sm", tone: "rose", status: "bad", meter: 90 })],
        links: [link("cli", "acc")],
        flows: [flow("acc", "w1", 4, { kind: "heavy" }), flow("acc", "w2", 4, { kind: "heavy" }), flow("acc", "w3", 4, { kind: "heavy" }), flow("acc", "w4", 4, { kind: "heavy" })],
      },
    },
    {
      kind: "solucao",
      nav: "Threads virtuais",
      title: "Threads virtuais: barato ter 10.000",
      body: [
        "No Java 21+, `Executors.newVirtualThreadPerTaskExecutor()` cria uma **thread virtual por conexão**, e o código continua sequencial e bloqueante. Uma thread virtual é um objeto da JVM, com pilha pequena e que cresce sob demanda.",
        "Quando ela chama um `read()` que bloqueia, a JVM a **desmonta** do *carrier* (uma thread do SO) e o carrier é liberado para outra thread virtual. Poucos carriers, proporcionais aos núcleos, servem milhares de conexões.",
      ],
      callout: { kind: "chave", text: "O código é o mesmo, ao estilo thread-por-conexão. A JVM faz o trabalho do Selector por baixo." },
      changes: ["threads do SO: 10.031 → 31", "+ 10.000 threads virtuais"],
      metrics: m16("31", "10.000", { id: "mem", label: "Memória", value: "baixa", tone: "ok" }),
      terminal: { suggest: [NLWP, CONNS], outputs: { [NLWP]: "31", [CONNS]: "10000" } },
      focus: ["acc", "vts", "w1", "w2", "w3", "w4"],
      stage: { mode: "iso", entities: [...base16(), ...virt()], links: [link("cli", "acc")], flows: [flow("acc", "vts", 2), flow("vts", "w1", 2, { kind: "data" }), flow("vts", "w2", 2, { kind: "data" }), flow("vts", "w3", 2, { kind: "data" }), flow("vts", "w4", 2, { kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "NIO e Selector",
      title: "NIO: um Selector vigia milhares de canais",
      body: [
        "Com o `java.nio`, canais ficam em **modo não bloqueante** e se registram num `Selector`. Uma única thread chama `select()`, que (no Linux, por baixo, usa `epoll`) devolve só os canais **prontos** para ler ou escrever.",
        "É o que o Netty faz com seus *event loops*. Rende máxima densidade, mas o código vira **máquina de estados**: não dá para esperar no meio de um método, e cada conexão guarda o que já leu e o que ainda precisa escrever.",
      ],
      changes: ["+ Selector (epoll)", "uma thread para todos os canais"],
      metrics: m16("11", "10.000", { id: "code", label: "Complexidade", value: "alta", tone: "warn" }),
      terminal: { suggest: [NLWP], outputs: { [NLWP]: "11" } },
      focus: ["sel", "w1"],
      stage: {
        mode: "iso",
        entities: [...base16(), box("sel", ...C16, "eye", "Selector (epoll)", { size: "md", tone: "violet" }), box("w1", ...around(3.6, -3.6), "refresh", "event loop", { size: "sm", tone: "mana" })],
        links: [link("cli", "acc"), link("acc", "sel"), link("sel", "w1")],
        flows: [flow("acc", "sel", 2), flow("sel", "w1", 3, { kind: "data", label: "canais prontos" })],
      },
    },
    {
      kind: "tradeoff",
      nav: "Qual escolher",
      title: "Qual modelo usar",
      body: [
        "Para a maioria dos serviços em **Java 21+**, a resposta é **threads virtuais com I/O bloqueante**: simples, legível e escalável. Pool de threads de plataforma ainda serve onde há um limite explícito de concorrência.",
        "O Selector (direto ou via Netty) compensa quando você precisa de controle fino do protocolo, de bufferização própria ou de densidade extrema. Mas paga em complexidade.",
      ],
      changes: ["comparação dos quatro modelos"],
      metrics: m16("≈ núcleos", "milhares", { id: "ch", label: "Escolha padrão", value: "threads virtuais", tone: "ok" }),
      extra: [modelGrid],
      focus: ["acc", "vts"],
      stage: { mode: "iso", entities: [...base16(), ...virt()], links: [link("cli", "acc")], flows: [flow("acc", "vts", 1)] },
    },
    {
      kind: "problema",
      nav: "Pinning e limites",
      title: "Cuidados com threads virtuais",
      body: [
        "No JDK 21 a 23, uma thread virtual que **bloqueia dentro de `synchronized`** fica *fixada* (pinned) ao carrier, que não pode servir outras; muitas fixações e os poucos carriers se esgotam. O JDK 24 (JEP 491) removeu essa limitação.",
        "Barato criar threads não quer dizer recursos infinitos: 10.000 threads virtuais disputando um pool de 20 conexões de banco continuam limitadas a 20. Use um `Semaphore` para impor o limite de concorrência no recurso escasso.",
      ],
      callout: { kind: "atencao", text: "Threads virtuais não devem ser colocadas em pool. Crie uma por tarefa e limite a concorrência com Semaphore." },
      changes: ["carriers fixados (pinned)", "gargalo no recurso escasso"],
      metrics: m16("31", "10.000", { id: "pin", label: "Carriers fixados", value: "2 de 4", tone: "warn" }),
      focus: ["w1", "w2"],
      stage: { mode: "iso", entities: [...base16(), ...virt("warn", true)], links: [link("cli", "acc")], flows: [flow("acc", "vts", 2), flow("vts", "w3", 1, { kind: "data" }), flow("vts", "w4", 1, { kind: "data" })] },
    },
    {
      kind: "problema",
      nav: "Timeouts",
      title: "Cliente que conecta e não fala",
      body: [
        "Um cliente lento (ou malicioso, num ataque *slowloris*) abre a conexão e **não envia nada**. Mesmo com thread virtual, ele segura descritor de arquivo, memória e a tarefa, para sempre.",
        "Todo `Socket` aceito precisa de **`setSoTimeout`**: um `read()` sem dados em N segundos lança `SocketTimeoutException`, e o servidor fecha a conexão. Adicione também um limite global de conexões por cliente.",
      ],
      changes: ["+ cliente lento", "conexão presa sem timeout"],
      metrics: m16("31", "10.001", { id: "slow", label: "Cliente lento", value: "segurando recursos", tone: "bad" }),
      focus: ["slow", "acc"],
      stage: { mode: "iso", entities: [...base16(), ...virt(), users("slow", 3.4, 3.4, 1, "cliente lento", { status: "bad" })], links: [link("cli", "acc"), link("slow", "acc")], flows: [flow("slow", "acc", 1, { kind: "bad" }), flow("acc", "vts", 1)] },
    },
    {
      kind: "conceito",
      nav: "Encerrar",
      title: "Desligar sem derrubar ninguém",
      body: [
        "No encerramento, o servidor **fecha primeiro o `ServerSocket`**: `accept()` lança exceção e novas conexões são recusadas. Em seguida, `executor.close()` (Java 19+) espera as tarefas em andamento terminarem.",
        "Um *shutdown hook* faz isso quando o processo recebe SIGTERM. Em containers e Kubernetes, o tempo entre o SIGTERM e o SIGKILL precisa ser maior que o tempo das requisições mais longas.",
      ],
      changes: ["accept() encerrado", "conexões em andamento terminam"],
      metrics: m16("31", "10.000 terminando", { id: "acc", label: "Novas conexões", value: "recusadas", tone: "warn" }),
      focus: ["acc", "vts"],
      stage: { mode: "iso", entities: [users("cli", ...P16(0), 9, "clientes"), box("acc", ...P16(1), "network", "fechado", { size: "md", tone: "sky", status: "dead" }), ...virt()], links: [link("cli", "acc")], flows: [flow("cli", "acc", 2, { kind: "bad", label: "recusadas" }), flow("vts", "w1", 1, { kind: "data" }), flow("vts", "w2", 1, { kind: "data" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Mesmo socket, três modelos de concorrência",
      body: [
        "**Uma thread de SO por conexão** é simples, mas custa memória e escalonamento. **Threads virtuais** mantêm o código sequencial e entregam a escala. **Selector** dá densidade máxima com código mais difícil.",
        "Em qualquer modelo: `setSoTimeout`, backlog adequado, concorrência limitada nos recursos escassos e encerramento ordenado.",
      ],
      changes: ["Três modelos, um objetivo"],
      metrics: m16("≈ núcleos", "milhares"),
      focus: ["acc", "vts"],
      stage: { mode: "iso", entities: [...base16(), ...virt()], links: [link("cli", "acc")], flows: [flow("cli", "acc", 1), flow("acc", "vts", 1)] },
    },
  ],
};
