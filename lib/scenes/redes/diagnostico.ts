/**
 * Cenas do módulo "Diagnóstico" da trilha Redes para Backend.
 * tcpdumpEWireshark: sequência + painéis de texto, shell bash (tcpdump-e-wireshark).
 * cliqueNumLink: sequência, shell bash (o-que-acontece-ao-clicar-num-link).
 * incidentesDeRede: isométrico, shell bash (incidentes-de-rede-reais).
 */
import type { IsoEntity, Metric, SceneDef, SceneStep, SeqLane, SeqMessage, SeqNote, Status } from "../types";
import type { GridPanel, TextPanel } from "@/lib/visualizers/types";
import { box, flow, link, zone } from "../kit/common";
import { rowXY } from "../kit/net";

type Tone4 = "ok" | "warn" | "bad" | "info";
type SeqStage = Extract<SceneStep["stage"], { mode: "sequence" }>;

const msg = (id: string, from: string, to: string, at: number, label: string, o: Partial<SeqMessage> = {}): SeqMessage => ({ id, from, to, at, label, ...o });
const note = (lane: string, at: number, text: string, tone: Tone4 = "info"): SeqNote => ({ lane, at, text, tone });
const state = (text: string, tone: Tone4 = "info") => ({ text, tone });

// =====================================================================================
// Cena 28: tcpdump e Wireshark (sequência + painéis de texto)
// =====================================================================================

const LANES28: SeqLane[] = [
  { id: "cli", label: "Cliente 198.51.100.7:51514", icon: "globe", tone: "mana" },
  { id: "srv", label: "Servidor 203.0.113.10:8080", icon: "server", tone: "arcane" },
];
const seq28 = (messages: SeqMessage[], extra: Partial<SeqStage> = {}): SeqStage => ({ mode: "sequence", lanes: LANES28, messages, ...extra });

const X = 3104581200;
const Y = 871250770;
const K1 = { id: "k1", from: "cli", to: "srv", at: 0, span: 1, label: `[S] seq ${X}`, detail: "14:02:11.100001", tone: "ctrl" } satisfies SeqMessage;
const K2 = { id: "k2", from: "srv", to: "cli", at: 3, span: 1, label: `[S.] seq ${Y} ack ${X + 1}`, detail: "14:02:11.112310", tone: "ctrl" } satisfies SeqMessage;
const K3 = { id: "k3", from: "cli", to: "srv", at: 6, span: 1, label: "[.] ack 1", detail: "14:02:11.112342", tone: "ok" } satisfies SeqMessage;
const K4 = { id: "k4", from: "cli", to: "srv", at: 9, span: 1, label: "[P.] seq 1:84 · 83 B", detail: "14:02:11.112790 · GET /pedidos", tone: "data" } satisfies SeqMessage;
const K5 = { id: "k5", from: "srv", to: "cli", at: 12, span: 1, label: "[P.] seq 1:532 · 531 B", detail: "14:02:11.143012 · 200 OK", tone: "data" } satisfies SeqMessage;
const K6 = { id: "k6", from: "cli", to: "srv", at: 15, span: 1, label: "[.] ack 532", detail: "14:02:11.143040", tone: "ok" } satisfies SeqMessage;
const K7 = { id: "k7", from: "cli", to: "srv", at: 18, span: 1, label: "[F.] seq 84 ack 532", detail: "14:02:11.143510", tone: "ctrl" } satisfies SeqMessage;
const K8 = { id: "k8", from: "srv", to: "cli", at: 21, span: 1, label: "[F.] seq 532 ack 85", detail: "14:02:11.155700", tone: "ctrl" } satisfies SeqMessage;
const K9 = { id: "k9", from: "cli", to: "srv", at: 24, span: 1, label: "[.] ack 533", detail: "14:02:11.155720", tone: "ok" } satisfies SeqMessage;

const TS = (a: number, b: number) => `TS val ${a} ecr ${b}`;
const DUMP_LINES = [
  `14:02:11.100001 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [S], seq ${X}, win 64240, options [mss 1460,sackOK,${TS(1923001, 0)},nop,wscale 7], length 0`,
  `14:02:11.112310 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [S.], seq ${Y}, ack ${X + 1}, win 65160, options [mss 1460,sackOK,${TS(774412, 1923001)},nop,wscale 7], length 0`,
  `14:02:11.112342 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack 1, win 502, options [nop,nop,${TS(1923013, 774412)}], length 0`,
  `14:02:11.112790 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [P.], seq 1:84, ack 1, win 502, options [nop,nop,${TS(1923013, 774412)}], length 83`,
  `14:02:11.143012 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [P.], seq 1:532, ack 84, win 509, options [nop,nop,${TS(774443, 1923013)}], length 531`,
  `14:02:11.143040 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack 532, win 501, options [nop,nop,${TS(1923044, 774443)}], length 0`,
  `14:02:11.143510 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [F.], seq 84, ack 532, win 501, options [nop,nop,${TS(1923044, 774443)}], length 0`,
  `14:02:11.155700 IP 203.0.113.10.8080 > 198.51.100.7.51514: Flags [F.], seq 532, ack 85, win 509, options [nop,nop,${TS(774455, 1923044)}], length 0`,
  `14:02:11.155720 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack 533, win 501, options [nop,nop,${TS(1923056, 774455)}], length 0`,
];
const DUMP_CMD = "sudo tcpdump -i eth0 -nn -c 9 'tcp port 8080'";
const DUMP_OUT = [
  "tcpdump: verbose output suppressed, use -v[v]... for full protocol decode",
  "listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes",
  ...DUMP_LINES,
  "9 packets captured",
  "9 packets received by filter",
  "0 packets dropped by kernel",
].join("\n");
const SYN_CMD = "tcpdump -nn -r captura.pcap 'tcp[tcpflags] & tcp-syn != 0'";
const SYN_OUT = ["reading from file captura.pcap, link-type EN10MB (Ethernet), snapshot length 262144", DUMP_LINES[0], DUMP_LINES[1]].join("\n");
const ABS_CMD = "tcpdump -nnS -r captura.pcap 'tcp[tcpflags] & tcp-syn == 0' | head -n 2";
const ABS_OUT = [
  "reading from file captura.pcap, link-type EN10MB (Ethernet), snapshot length 262144",
  `14:02:11.112342 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [.], ack ${Y + 1}, win 502, options [nop,nop,${TS(1923013, 774412)}], length 0`,
  `14:02:11.112790 IP 198.51.100.7.51514 > 203.0.113.10.8080: Flags [P.], seq ${X + 1}:${X + 84}, ack ${Y + 1}, win 502, options [nop,nop,${TS(1923013, 774412)}], length 83`,
].join("\n");
const RETX_CMD = "sudo tcpdump -nn -i eth0 'tcp[tcpflags] & (tcp-syn|tcp-rst) != 0 and dst port 8080'";
const RETX_OUT = [
  "tcpdump: verbose output suppressed, use -v[v]... for full protocol decode",
  "listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes",
  "14:20:05.000000 IP 198.51.100.7.51620 > 203.0.113.10.8080: Flags [S], seq 2217704412, win 64240, length 0",
  "14:20:06.000211 IP 198.51.100.7.51620 > 203.0.113.10.8080: Flags [S], seq 2217704412, win 64240, length 0",
  "14:20:09.000530 IP 198.51.100.7.51620 > 203.0.113.10.8080: Flags [S], seq 2217704412, win 64240, length 0",
].join("\n");

const flagsGrid: GridPanel = {
  kind: "grid",
  label: "Flags que o tcpdump imprime",
  colHeaders: ["Flags", "Significa", "Aparece em"],
  rows: [
    ["[S]", "SYN", "pedido de conexão"],
    ["[S.]", "SYN + ACK (o ponto é o ACK)", "resposta ao SYN"],
    ["[.]", "só ACK", "confirmações"],
    ["[P.]", "PUSH + ACK: dados", "requisição e resposta"],
    ["[F.]", "FIN + ACK", "fechamento"],
    ["[R] / [R.]", "RST", "porta fechada ou conexão derrubada"],
  ],
};
const bpfGrid: GridPanel = {
  kind: "grid",
  label: "Filtros BPF (kernel) e opções comuns",
  colHeaders: ["Uso", "Exemplo"],
  rows: [
    ["porta e protocolo", "tcp port 8080"],
    ["host de origem ou destino", "host 198.51.100.7 · src · dst"],
    ["combinar", "tcp port 8080 and not host 192.0.2.1"],
    ["só SYN, FIN e RST", "tcp[tcpflags] & (tcp-syn|tcp-fin|tcp-rst) != 0"],
    ["gravar e ler", "-w captura.pcap · -r captura.pcap"],
    ["sem DNS, portas em número", "-nn"],
    ["limitar", "-c 20 (pacotes) · -s (bytes por pacote)"],
  ],
};
const textLines = (label: string, lines: TextPanel["lines"]): TextPanel => ({ kind: "text", label, lines });
const m28 = (a: string, b: string, tone?: "ok" | "warn" | "bad"): Metric[] => [{ id: "a", label: "Medido", value: a, tone }, { id: "b", label: "Onde", value: b }];

export const tcpdumpEWireshark: SceneDef = {
  title: "Lendo pacotes com tcpdump e Wireshark",
  summary: "Leia, linha a linha, a captura de um GET simples: flags, números de sequência, o RTT e o tempo do servidor, e depois sintomas e TLS.",
  shell: "bash",
  goals: [
    { text: "Capturar com tcpdump e filtros BPF", step: 2 },
    { text: "Ler as flags e os números de sequência", step: 3 },
    { text: "Calcular o RTT e o tempo do servidor", step: 6 },
    { text: "Reconhecer retransmissão e RST", step: 8 },
  ],
  steps: [
    {
      kind: "problema",
      nav: "Onde está o tempo?",
      title: "Os logs discordam; o fio não",
      body: [
        "A aplicação diz 20 ms, a rede diz que está saudável, e o cliente vê 200 ms. Cada log só registra o que **aquele lado** viu. A pergunta decisiva é o que aconteceu **no fio**: o SYN chegou? Houve retransmissão? Quem mandou o RST?",
        "Uma captura de pacotes responde com evidência e horário de cada pacote. É a fonte que não depende da opinião de ninguém.",
      ],
      cmd: "sudo tcpdump -i eth0 -nn 'tcp port 8080' -w captura.pcap",
      metrics: m28("?", "cliente"),
      extra: [textLines("O que uma captura responde", [{ text: "o SYN chegou? houve resposta?" }, { text: "quanto tempo levou cada etapa?" }, { text: "houve retransmissão ou RST?" }, { text: "quem fechou a conexão?" }])],
      stage: seq28([], { laneState: { cli: state("cliente", "info"), srv: state("LISTEN", "ok") }, notes: [note("cli", 0, "GET /pedidos: 200 ms?", "warn")] }),
    },
    {
      kind: "conceito",
      nav: "Capturar",
      title: "Capturar com tcpdump e filtrar com BPF",
      body: [
        "O `tcpdump` lê pacotes de uma interface (precisa de root). `-nn` evita DNS e mostra portas em número; o filtro final é uma expressão **BPF**, avaliada no kernel, o que mantém a captura leve. `-w` grava um `.pcap` para o Wireshark.",
        "Em produção, filtre o máximo (host e porta), limite com `-c` e grave em arquivo.",
      ],
      cmd: "sudo tcpdump -i eth0 -nn 'tcp port 8080' -w captura.pcap",
      changes: ["+ filtro BPF: tcp port 8080"],
      metrics: m28("9 pacotes", "eth0 do cliente"),
      terminal: { suggest: [DUMP_CMD], outputs: { [DUMP_CMD]: DUMP_OUT } },
      extra: [bpfGrid],
      stage: seq28([], { laneState: { cli: state("eth0: capturando", "ok"), srv: state("LISTEN", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "Flags",
      title: "Cada linha traz as flags, seq, ack e length",
      body: [
        "Uma linha mostra horário, `origem.porta > destino.porta`, as **flags** entre colchetes, `seq`, `ack`, a janela e o `length` (bytes de dados). O ponto em `[S.]` ou `[P.]` é o ACK ligado.",
        "O primeiro SYN e o SYN-ACK trazem o número de sequência **real**; os demais saem **relativos** ao início da conexão. O `-S` mostra sempre o absoluto.",
      ],
      changes: ["+ legenda das flags", "seq relativo contra absoluto"],
      metrics: m28("flags e números", "linha da captura"),
      terminal: { suggest: [ABS_CMD], outputs: { [ABS_CMD]: ABS_OUT } },
      extra: [flagsGrid],
      stage: seq28([], { laneState: { cli: state("eth0: capturando", "ok"), srv: state("LISTEN", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "Handshake",
      title: "As três primeiras linhas: o handshake",
      body: [
        "`[S]` com `seq 3104581200` (o ISN do cliente), `[S.]` com o ISN do servidor e `ack 3104581201` (o SYN consumiu 1), e `[.]` com `ack 1`, já em número relativo. As opções negociadas (MSS 1460, SACK, escala 7) aparecem no SYN.",
        "O intervalo entre o `[S]` e o `[S.]` é **1 RTT**: 100001 → 112310 µs, ou 12,309 ms.",
      ],
      changes: ["+ SYN, SYN-ACK e ACK", "RTT: 12,309 ms"],
      metrics: m28("RTT = 12,309 ms", "cliente", "ok"),
      terminal: { suggest: [SYN_CMD], outputs: { [SYN_CMD]: SYN_OUT } },
      extra: [textLines("Linhas 1 a 3, comentadas", [{ text: "[S] seq 3104581200: o cliente propõe o ISN", tone: "active" }, { text: "[S.] seq 871250770 ack 3104581201: o servidor aceita", tone: "active" }, { text: "[.] ack 1: conexão estabelecida (relativo)", tone: "done" }])],
      stage: seq28([K1, K2, K3], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [{ fromAt: 0, toAt: 4, label: "RTT ≈ 12,3 ms" }] }),
    },
    {
      kind: "conceito",
      nav: "Pedido e resposta",
      title: "[P.]: os dados e a confirmação",
      body: [
        "O `[P.] seq 1:84, length 83` é o `GET`: bytes de 1 a 83. A resposta `[P.] seq 1:532, ack 84, length 531` confirma tudo o que o cliente mandou (`ack 84`) e leva 531 bytes. O `[.] ack 532` fecha a troca.",
        "Os números fecham a conta: `ack` é sempre o **próximo byte esperado**.",
      ],
      changes: ["+ GET /pedidos (83 B)", "+ resposta 200 OK (531 B)"],
      metrics: m28("83 B e 531 B", "cliente"),
      extra: [textLines("Linhas 4 a 6, comentadas", [{ text: "[P.] seq 1:84 length 83: o GET", tone: "active" }, { text: "[P.] seq 1:532 ack 84 length 531: a resposta", tone: "active" }, { text: "[.] ack 532: o cliente recebeu tudo", tone: "done" }])],
      stage: seq28([K1, K2, K3, K4, K5, K6], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") } }),
    },
    {
      kind: "solucao",
      nav: "Os tempos",
      title: "Separando a rede da aplicação",
      body: [
        "Do pedido (`.112790`) à resposta (`.143012`) passam 30,222 ms. Tirando 1 RTT (12,309 ms), sobram cerca de **17,9 ms de aplicação**. Agora há evidência: 12 ms são rede e 18 ms são servidor.",
        "A captura no **servidor** mostraria o tempo da aplicação sem a ida e a volta. Comparar as duas pontas é uma técnica poderosa.",
      ],
      changes: ["RTT: 12,3 ms", "Aplicação: ≈ 17,9 ms"],
      metrics: [{ id: "rtt", label: "RTT", value: "12,3 ms" }, { id: "app", label: "Aplicação", value: "17,9 ms", tone: "ok" }, { id: "tot", label: "Pedido até resposta", value: "30,2 ms" }],
      stage: seq28([K1, K2, K3, K4, K5, K6], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [{ fromAt: 0, toAt: 4, label: "RTT ≈ 12,3 ms" }, { fromAt: 9, toAt: 13, label: "30,2 ms: RTT + 17,9 ms de app" }] }),
    },
    {
      kind: "conceito",
      nav: "Fechamento",
      title: "Os [F.]: quem fecha primeiro",
      body: [
        "O cliente manda o primeiro `[F.]` (`seq 84, ack 532`): ele fechou primeiro. O servidor confirma e fecha (`[F.] seq 532 ack 85`), e o último `[.] ack 533` encerra. São 3 linhas, e a ordem dos `[F.]` diz **quem fechou**.",
        "Quem fecha primeiro fica em TIME_WAIT (aula 12), e é aí que o esgotamento de portas começa (aula 24).",
      ],
      changes: ["+ FIN do cliente", "+ FIN do servidor", "cliente: TIME_WAIT"],
      metrics: m28("cliente fechou primeiro", "cliente"),
      stage: seq28([K1, K2, K3, K4, K5, K6, K7, K8, K9], { laneState: { cli: state("TIME_WAIT", "warn"), srv: state("CLOSED") }, notes: [note("cli", 26, "TIME_WAIT: 60 s", "warn")] }),
    },
    {
      kind: "problema",
      nav: "Sintomas",
      title: "O que uma captura com problema mostra",
      body: [
        "**Retransmissão:** o mesmo SYN (`seq 2217704412`) de novo após 1 s e após 3 s: ninguém respondeu, e algo descartou (aula 15). **RST:** um `[R.]` em resposta ao SYN é porta fechada; **silêncio** é filtro ou rota.",
        "Cada sintoma aponta a uma aula: portas fechadas, filas, firewalls, MTU.",
      ],
      callout: { kind: "chave", text: "SYN repetido em 1 s, 3 s e 7 s = nada respondeu. [R.] = alguém respondeu que a porta está fechada." },
      changes: ["+ SYN retransmitido em +1 s e +3 s"],
      metrics: m28("SYN sem resposta", "cliente", "bad"),
      terminal: { suggest: [RETX_CMD], outputs: { [RETX_CMD]: RETX_OUT } },
      extra: [textLines("Retransmissão de SYN", [{ text: "14:20:05.000000  [S] seq 2217704412", tone: "active" }, { text: "14:20:06.000211  [S] seq 2217704412  (+1 s)", tone: "compare" }, { text: "14:20:09.000530  [S] seq 2217704412  (+3 s)", tone: "bad" }])],
      stage: seq28(
        [
          { id: "r1", from: "cli", to: "srv", at: 0, span: 1, label: "[S] seq 2217704412", detail: "14:20:05.000000", tone: "bad", lost: true },
          { id: "r2", from: "cli", to: "srv", at: 3, span: 1, label: "[S] (retransmissão)", detail: "+1 s", tone: "bad", lost: true },
          { id: "r3", from: "cli", to: "srv", at: 6, span: 1, label: "[S] (retransmissão)", detail: "+3 s", tone: "bad", lost: true },
        ],
        { laneState: { cli: state("SYN_SENT", "warn"), srv: state("sem resposta", "bad") } },
      ),
    },
    {
      kind: "conceito",
      nav: "Wireshark",
      title: "Wireshark: seguir o stream e filtrar",
      body: [
        "O Wireshark abre o `.pcap` e decodifica cada camada. **Follow TCP Stream** reconstrói a conversa; o **Expert Info** lista retransmissões e janelas zeradas; os filtros de exibição (`tcp.analysis.retransmission`, `tcp.flags.reset == 1`, `ip.addr == 203.0.113.10`) isolam o que importa.",
        "Atenção: filtro de captura (BPF) e filtro de exibição têm sintaxes **diferentes**.",
      ],
      changes: ["+ Follow TCP Stream", "+ filtros de exibição"],
      extra: [textLines("Filtros de exibição do Wireshark", [{ text: "tcp.analysis.retransmission", tone: "active" }, { text: "tcp.flags.reset == 1", tone: "active" }, { text: "ip.addr == 203.0.113.10 and tcp.port == 8080", tone: "active" }, { text: "Estatísticas > Conversas, I/O Graph", tone: "done" }])],
      stage: seq28([K1, K2, K3, K4, K5, K6, K7, K8, K9], { laneState: { cli: state("captura.pcap", "info"), srv: state("captura.pcap", "info") } }),
    },
    {
      kind: "conceito",
      nav: "E o TLS?",
      title: "Com TLS, só os metadados aparecem",
      body: [
        "Numa captura de HTTPS a porta 443 mostra endereços, tempos, tamanhos e, no `ClientHello`, o nome do servidor (**SNI**, aula 19). O conteúdo (`Application Data`) está cifrado.",
        "Para depurar na **sua** máquina, o navegador e muitas bibliotecas gravam os segredos da sessão em `SSLKEYLOGFILE`, e o Wireshark os usa para mostrar o conteúdo. É técnica de depuração local.",
      ],
      callout: { kind: "atencao", text: "Sem a chave da sessão (SSLKEYLOGFILE), a captura de TLS mostra só metadados. Nunca capture tráfego de terceiros." },
      changes: ["porta 443: conteúdo cifrado", "SNI visível no ClientHello"],
      stage: seq28(
        [
          { id: "t1", from: "cli", to: "srv", at: 0, span: 1, label: "ClientHello", detail: "SNI: loja.exemplo.com (visível)", tone: "ctrl" },
          { id: "t2", from: "srv", to: "cli", at: 3, span: 1, label: "ServerHello · certificado · Finished", tone: "ctrl" },
          { id: "t3", from: "cli", to: "srv", at: 5, span: 1, label: "Application Data", detail: "cifrado: só tamanho e hora", tone: "bad" },
        ],
        { laneState: { cli: state("porta 443", "info"), srv: state("TLS 1.3", "ok") }, notes: [note("cli", 8, "SSLKEYLOGFILE decifra localmente", "info")] },
      ),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "A captura é a evidência",
      body: [
        "`tcpdump -nn` com filtro BPF e `-w` para gravar; flags `[S]`, `[S.]`, `[.]`, `[P.]`, `[F.]`, `[R]`; seq relativo contra absoluto (`-S`); o RTT é o `[S]` ao `[S.]`, e o tempo do servidor é pedido até resposta menos o RTT.",
        "Retransmissão e RST contam a história de rede; no TLS, só metadados. No Wireshark: Follow TCP Stream e filtros de exibição.",
      ],
      changes: ["Flags, tempos e sintomas"],
      metrics: [{ id: "rtt", label: "RTT", value: "12,3 ms" }, { id: "app", label: "Aplicação", value: "17,9 ms", tone: "ok" }],
      stage: seq28([K1, K2, K3, K4, K5, K6], { laneState: { cli: state("ESTABLISHED", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [{ fromAt: 0, toAt: 4, label: "RTT ≈ 12,3 ms" }, { fromAt: 9, toAt: 13, label: "app ≈ 17,9 ms + RTT" }] }),
    },
  ],
};

// =====================================================================================
// Cena 29: o que acontece ao clicar num link (sequência)
// =====================================================================================

const LANES29: SeqLane[] = [
  { id: "nav", label: "Navegador", icon: "globe", tone: "mana" },
  { id: "dns", label: "Resolvedor DNS", icon: "search", tone: "sky" },
  { id: "srv", label: "www.exemplo.com", icon: "server", tone: "arcane" },
];
const seq29 = (messages: SeqMessage[], extra: Partial<SeqStage> = {}): SeqStage => ({ mode: "sequence", lanes: LANES29, messages, ...extra });
const m29 = (acum: string, fase: string, tone?: "ok" | "warn" | "bad"): Metric[] => [{ id: "acum", label: "Tempo acumulado", value: acum, tone }, { id: "fase", label: "Fase", value: fase }];

const D1 = msg("d1", "nav", "dns", 0, "A www.exemplo.com?", { span: 1 });
const D2 = msg("d2", "dns", "nav", 2, "203.0.113.10 · TTL 300", { span: 1, tone: "ok" });
const T1 = msg("t1", "nav", "srv", 5, "SYN", { span: 1 });
const T2 = msg("t2", "srv", "nav", 7, "SYN-ACK", { span: 1 });
const L1 = msg("l1", "nav", "srv", 9, "ACK + ClientHello (SNI)", { span: 1, tone: "ctrl" });
const L2 = msg("l2", "srv", "nav", 11, "ServerHello · certificado · Finished", { span: 1, tone: "ctrl" });
const H1 = msg("h1", "nav", "srv", 13, "Finished + GET /", { span: 1, tone: "data" });
const H2 = msg("h2", "srv", "nav", 15, "200 OK · primeiro byte", { span: 1, tone: "ok" });
const H3 = msg("h3", "srv", "nav", 17, "restante do HTML", { span: 1, tone: "data" });
const DNS_BR = { fromAt: 0, toAt: 4, label: "DNS ≈ 40 ms" };
const TCP_BR29 = { fromAt: 5, toAt: 9, label: "TCP ≈ 30 ms" };
const TLS_BR29 = { fromAt: 9, toAt: 13, label: "TLS ≈ 30 ms" };
const HTTP_BR29 = { fromAt: 13, toAt: 17, label: "HTTP ≈ 50 ms" };

const CURL_W = "curl -s -o /dev/null https://www.exemplo.com/ -w 'dns %{time_namelookup}  tcp %{time_connect}  tls %{time_appconnect}  ttfb %{time_starttransfer}  total %{time_total}\\n'";
const CURL_W_OUT = "dns 0.040  tcp 0.070  tls 0.100  ttfb 0.150  total 0.160";

const somaGrid: GridPanel = {
  kind: "grid",
  label: "Linha do tempo de uma visita fria (RTT 30 ms)",
  colHeaders: ["Fase", "Tempo", "Acumulado", "Aula"],
  rows: [
    ["DNS (sem cache)", "40 ms", "40 ms", "17"],
    ["TCP: SYN, SYN-ACK, ACK", "30 ms", "70 ms", "11"],
    ["TLS 1.3", "30 ms", "100 ms", "18 e 19"],
    ["HTTP até o 1º byte (RTT + 20 ms de app)", "50 ms", "150 ms", "20"],
    ["Resto do HTML", "10 ms", "160 ms", "14"],
  ],
  tones: [{ r: 4, c: 2, tone: "done" }],
};
const encurtarGrid: GridPanel = {
  kind: "grid",
  label: "Como encurtar cada fase",
  colHeaders: ["Fase", "O que ajuda"],
  rows: [
    ["DNS", "cache, TTL adequado, dns-prefetch"],
    ["TCP e TLS", "keep-alive e pool, preconnect, TLS 1.3 e retomada"],
    ["Todas", "CDN perto do usuário: reduz o RTT de cada fase"],
    ["HTTP", "HTTP/2 e HTTP/3, cache, servidor mais rápido"],
  ],
};

export const cliqueNumLink: SceneDef = {
  title: "O que acontece quando você clica num link",
  summary: "A linha do tempo de uma visita fria: DNS, TCP, TLS 1.3, HTTP e resposta, com o tempo de cada fase somando 160 ms.",
  shell: "bash",
  goals: [
    { text: "Ordenar as fases: DNS, TCP, TLS e HTTP", step: 5 },
    { text: "Somar os tempos de uma visita fria", step: 8 },
    { text: "Ver o que muda num segundo clique", step: 9 },
    { text: "Escolher a otimização certa para cada fase", step: 10 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "O clique",
      title: "O usuário abre https://www.exemplo.com/",
      body: [
        "O navegador primeiro olha o que já sabe: a lista **HSTS**, o cache de DNS, o cache HTTP e as conexões abertas. Neste cenário nada disso existe: é uma visita **fria**.",
        "O RTT até o servidor é de **30 ms** e o resolvedor DNS leva **40 ms** para um nome fora do cache. Vamos somar as fases.",
      ],
      metrics: m29("0 ms", "caches vazios"),
      stage: seq29([], { laneState: { nav: state("visita fria"), dns: state("sem cache", "warn"), srv: state("LISTEN", "ok") }, notes: [note("nav", 0, "HSTS, DNS, HTTP, conexões: nada em cache", "info")] }),
    },
    {
      kind: "conceito",
      nav: "Saindo de casa",
      title: "Antes do DNS: gateway, ARP e NAT",
      body: [
        "O pacote só sai da rede local pelo **gateway padrão** (aula 7), depois que o ARP descobre o MAC dele (aula 6). Na borda, o **NAT** troca o IP privado pelo público (aula 8).",
        "Esses passos custam microssegundos a poucos milissegundos, e por isso não aparecem como fases na conta, mas acontecem em cada pacote.",
      ],
      changes: ["+ gateway, ARP e NAT"],
      metrics: m29("≈ 0 ms", "rede local"),
      stage: seq29([], { laneState: { nav: state("rede local"), dns: state("sem cache", "warn") }, notes: [note("nav", 0, "rota padrão → gateway (aula 7)", "info"), note("nav", 2, "ARP: MAC do gateway (aula 6)", "info"), note("nav", 4, "NAT: IP privado → público (aula 8)", "info")] }),
    },
    {
      kind: "conceito",
      nav: "DNS",
      title: "1. DNS: o nome vira um IP (40 ms)",
      body: [
        "Uma consulta UDP ao resolvedor. Sem cache, ele consulta a hierarquia (raiz, TLD, autoritativo) e devolve o registro **A** com o seu TTL (aula 17). Aqui leva 40 ms.",
        "Com o IP `203.0.113.10` em mãos, o navegador pode abrir a conexão.",
      ],
      changes: ["+ consulta A e resposta", "DNS: 40 ms"],
      metrics: m29("40 ms", "DNS", "warn"),
      stage: seq29([D1, D2], { laneState: { nav: state("resolvendo", "warn"), dns: state("resolve", "warn") }, brackets: [DNS_BR] }),
    },
    {
      kind: "conceito",
      nav: "TCP",
      title: "2. TCP: o handshake custa 1 RTT (30 ms)",
      body: [
        "SYN, SYN-ACK e ACK (aula 11). O navegador só pode mandar dados depois de uma ida e volta completa: **1 RTT**, 30 ms, e o acumulado vai a 70 ms.",
        "Servidor e cliente criam o estado da conexão (números de sequência, buffers).",
      ],
      changes: ["+ SYN e SYN-ACK", "TCP: 30 ms"],
      metrics: m29("70 ms", "TCP", "warn"),
      stage: seq29([D1, D2, T1, T2], { laneState: { nav: state("SYN_SENT", "warn"), srv: state("SYN_RECV", "warn") }, brackets: [DNS_BR, TCP_BR29] }),
    },
    {
      kind: "conceito",
      nav: "TLS 1.3",
      title: "3. TLS 1.3: mais 1 RTT (30 ms)",
      body: [
        "O `ClientHello` leva o **SNI** (aula 19) e a chave efêmera; a resposta traz o `ServerHello`, o certificado e o `Finished` (aula 18). O navegador valida a cadeia e o nome. Acumulado: 100 ms.",
        "Com TLS 1.2 seriam 2 RTTs: 130 ms só até aqui.",
      ],
      changes: ["+ ClientHello (SNI)", "+ certificado e Finished", "TLS: 30 ms"],
      metrics: m29("100 ms", "TLS", "warn"),
      stage: seq29([D1, D2, T1, T2, L1, L2], { laneState: { nav: state("handshake TLS", "warn"), srv: state("handshake TLS", "warn") }, brackets: [DNS_BR, TCP_BR29, TLS_BR29] }),
    },
    {
      kind: "conceito",
      nav: "HTTP",
      title: "4. HTTP: RTT mais o tempo do servidor (50 ms)",
      body: [
        "O `GET /` vai junto com o `Finished` do cliente. O servidor trabalha **20 ms** (aplicação, banco), e o primeiro byte chega 30 ms (RTT) + 20 ms depois do `GET`: **50 ms**. Acumulado: 150 ms.",
        "É a única fase em que mexer no código do servidor ajuda.",
      ],
      changes: ["+ GET /", "+ 200 OK (primeiro byte)", "HTTP: 50 ms"],
      metrics: m29("150 ms", "HTTP", "warn"),
      stage: seq29([D1, D2, T1, T2, L1, L2, H1, H2], { laneState: { nav: state("espera o 1º byte", "warn"), srv: state("20 ms de app", "warn") }, brackets: [DNS_BR, TCP_BR29, TLS_BR29, HTTP_BR29] }),
    },
    {
      kind: "solucao",
      nav: "O corpo",
      title: "5. O resto do HTML e os recursos",
      body: [
        "Mais 10 ms e o HTML chega inteiro: **160 ms** no total. O navegador lê o HTML, descobre CSS, JavaScript e imagens e os pede **pela mesma conexão**, em paralelo, com a multiplexação do HTTP/2 (aula 20), sem novos handshakes se o host for o mesmo.",
      ],
      changes: ["+ restante do HTML", "Total: 160 ms"],
      metrics: m29("160 ms", "HTML completo", "ok"),
      terminal: { suggest: [CURL_W], outputs: { [CURL_W]: CURL_W_OUT } },
      stage: seq29([D1, D2, T1, T2, L1, L2, H1, H2, H3], { laneState: { nav: state("HTML recebido", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [DNS_BR, TCP_BR29, TLS_BR29, HTTP_BR29] }),
    },
    {
      kind: "resumo",
      nav: "A soma",
      title: "40 + 30 + 30 + 50 + 10 = 160 ms",
      body: [
        "Três RTTs de rede antes do primeiro byte útil (TCP, TLS e a requisição), mais o DNS e os 20 ms do servidor. Os números são ilustrativos, mas a estrutura é real.",
        "No `curl -w`, os campos são **acumulados**: `time_connect` inclui o DNS; subtraia para obter cada fase.",
      ],
      changes: ["Tabela das fases"],
      metrics: m29("160 ms", "visita fria", "ok"),
      terminal: { suggest: [CURL_W], outputs: { [CURL_W]: CURL_W_OUT } },
      extra: [somaGrid],
      stage: seq29([D1, D2, T1, T2, L1, L2, H1, H2, H3], { laneState: { nav: state("160 ms", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [DNS_BR, TCP_BR29, TLS_BR29, HTTP_BR29] }),
    },
    {
      kind: "solucao",
      nav: "Segundo clique",
      title: "No segundo clique, a maior parte some",
      body: [
        "Com o DNS em cache e a conexão aberta, sobram só a requisição e a resposta: **1 RTT + 20 ms do servidor = 50 ms**, mais o corpo. Cerca de 60 ms contra 160 ms da visita fria.",
        "É o ganho do cache de DNS e do keep-alive (aula 23): três fases desaparecem.",
      ],
      changes: ["− DNS, TCP e TLS", "160 ms → ≈ 60 ms"],
      metrics: m29("≈ 60 ms", "visita quente", "ok"),
      stage: seq29([msg("w1", "nav", "srv", 0, "GET /", { span: 1, tone: "data" }), msg("w2", "srv", "nav", 2, "200 OK · primeiro byte", { span: 1, tone: "ok" }), msg("w3", "srv", "nav", 4, "restante do HTML", { span: 1, tone: "data" })], { laneState: { nav: state("conexão aberta", "ok"), dns: state("em cache", "ok"), srv: state("ESTABLISHED", "ok") }, notes: [note("srv", 7, "sem DNS, sem SYN, sem TLS", "ok")], brackets: [{ fromAt: 0, toAt: 4, label: "≈ 50 ms" }] }),
    },
    {
      kind: "tradeoff",
      nav: "Como encurtar",
      title: "Cada fase tem a sua alavanca",
      body: [
        "DNS: cache e `dns-prefetch`. TCP e TLS: reaproveitar conexões, `preconnect`, TLS 1.3 e retomada de sessão. HTTP/3 junta o handshake de transporte e o de segurança em 1 RTT.",
        "Um **CDN** perto do usuário reduz o RTT de todas as fases ao mesmo tempo, e só o código do servidor ataca os 20 ms.",
      ],
      callout: { kind: "bom-saber", text: "Primeiro meça cada fase; depois otimize a maior. Eliminar um handshake costuma render mais que tirar 10 ms do servidor." },
      changes: ["+ alavancas por fase"],
      extra: [encurtarGrid],
      stage: seq29([D1, D2, T1, T2, L1, L2, H1, H2, H3], { laneState: { nav: state("160 ms", "info"), srv: state("ESTABLISHED", "ok") }, brackets: [DNS_BR, TCP_BR29, TLS_BR29, HTTP_BR29] }),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "A cadeia inteira, em uma frase",
      body: [
        "Caches, **DNS** (aula 17), **TCP** (11), **TLS** (18 e 19), **HTTP** (20) e a resposta: cada fase depende da anterior, e o tempo total é a soma. Numa visita fria, são três RTTs mais DNS e servidor.",
        "Reaproveitar conexões e ficar perto do usuário elimina ou encurta quase tudo. Meça antes de otimizar.",
      ],
      changes: ["Cadeia completa"],
      metrics: m29("160 ms", "visita fria", "ok"),
      stage: seq29([D1, D2, T1, T2, L1, L2, H1, H2, H3], { laneState: { nav: state("160 ms", "ok"), srv: state("ESTABLISHED", "ok") }, brackets: [DNS_BR, TCP_BR29, TLS_BR29, HTTP_BR29] }),
    },
  ],
};

// =====================================================================================
// Cena 30: incidentes de rede reais (iso)
// =====================================================================================

const P30 = (i: number) => rowXY(i, 3.6);

type Q30 = {
  conn?: Status; connBadge?: string; app?: Status; appLabel?: string; appBadge?: string; nat?: Status; natBadge?: string; db?: Status;
  ports?: number; portsStatus?: Status; portsBadge?: string; noPool?: boolean;
};

function incidente(q: Q30 = {}): IsoEntity[] {
  const [cx, cy] = P30(1.3);
  const cs: [number, number][] = [[1.0, 3.6], [2.3, 2.3], [3.6, 1.0]];
  return [
    box("app", ...P30(0), "server", q.appLabel ?? "serviço Java", { size: "md", tone: "mana", status: q.app, badges: q.appBadge ? [{ text: q.appBadge, tone: q.app === "bad" ? "bad" : "info" }] : undefined }),
    ...(q.noPool
      ? [box("ports", cx, cy, "list", "portas efêmeras", { size: "md", tone: "ember", meter: q.ports ?? 0, status: q.portsStatus, badges: q.portsBadge ? [{ text: q.portsBadge, tone: q.portsStatus === "bad" ? "bad" : "info" }] : undefined })]
      : [
          zone("pool", cx - 2.3, cy - 2.3, 4.6, 4.6, { label: "pool de conexões", tone: "sky" }),
          ...cs.map(([x, y], i) => box(`c${i + 1}`, x, y, "database", `conexão ${i + 1}`, { parent: "pool", size: "sm", tone: "arcane", status: q.conn, badges: i === 1 && q.connBadge ? [{ text: q.connBadge, tone: q.conn === "bad" || q.conn === "dead" ? "bad" : "info" }] : undefined })),
        ]),
    box("nat", ...P30(2.75), "shield", "NAT Gateway", { size: "md", tone: "ember", status: q.nat, badges: q.natBadge ? [{ text: q.natBadge, tone: q.nat === "bad" ? "bad" : "info" }] : undefined }),
    box("db", ...P30(3.75), "database", "Postgres externo", { size: "md", tone: "arcane", status: q.db }),
  ];
}
const links30 = (noPool = false) => (noPool ? [link("app", "ports"), link("ports", "nat"), link("nat", "db")] : [link("app", "pool"), link("pool", "nat"), link("nat", "db")]);
const m30 = (a: string, b: string, tb?: "ok" | "warn" | "bad"): Metric[] => [{ id: "a", label: "Ociosa há", value: a }, { id: "b", label: "Entradas no NAT", value: b, tone: tb }];

const SS_O = "ss -tno state established '( dport = :5432 )'";
const SS_O_OUT = [
  "Recv-Q Send-Q    Local Address:Port    Peer Address:Port",
  "0      0             10.0.2.15:49832   198.51.100.20:5432",
  "0      0             10.0.2.15:49833   198.51.100.20:5432",
  "0      0             10.0.2.15:49834   198.51.100.20:5432",
].join("\n");
const RST_CMD = "sudo tcpdump -nn -i eth0 'tcp port 5432 and tcp[tcpflags] & tcp-rst != 0'";
const RST_OUT = [
  "tcpdump: verbose output suppressed, use -v[v]... for full protocol decode",
  "listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes",
  "06:02:14.371208 IP 198.51.100.20.5432 > 10.0.2.15.49832: Flags [R], seq 2294110417, win 0, length 0",
].join("\n");
const KEEP_CMD = "sysctl net.ipv4.tcp_keepalive_time net.ipv4.tcp_keepalive_intvl net.ipv4.tcp_keepalive_probes";
const KEEP_OUT = ["net.ipv4.tcp_keepalive_time = 7200", "net.ipv4.tcp_keepalive_intvl = 75", "net.ipv4.tcp_keepalive_probes = 9"].join("\n");
const SS_S30 = "ss -s";
const SS_S30_OUT = ["Total: 29184", "TCP:   28986 (estab 412, closed 28501, orphaned 0, timewait 28232)"].join("\n");

const curaGrid: GridPanel = {
  kind: "grid",
  label: "Três camadas contra a conexão morta",
  colHeaders: ["Camada", "Ajuste", "Regra"],
  rows: [
    ["Pool (HikariCP)", "keepaliveTime = 120 s", "menor que o idle timeout do NAT (350 s)"],
    ["Pool (HikariCP)", "maxLifetime = 25 min", "menor que qualquer limite da infraestrutura"],
    ["TCP", "SO_KEEPALIVE + tcp_keepalive_time curto", "o padrão de 7200 s é inútil aqui"],
    ["Driver", "tcpKeepAlive=true (JDBC Postgres)", "liga a sondagem no socket"],
  ],
  tones: [{ r: 0, c: 2, tone: "done" }, { r: 2, c: 2, tone: "bad" }],
};
const metodoGrid: GridPanel = {
  kind: "grid",
  label: "Sintoma, diagnóstico e correção",
  colHeaders: ["Incidente", "Sintoma", "Diagnóstico", "Correção"],
  rows: [
    ["Conexão morta pelo firewall", "erro na 1ª query após ociosidade", "tcpdump por RST, ss -o", "keepaliveTime e maxLifetime"],
    ["Portas esgotadas", "Cannot assign requested address", "ss -s", "pool e keep-alive"],
    ["Buraco negro de MTU", "resposta grande trava", "ping -M do -s", "ICMP liberado, MSS clamping"],
    ["Nagle + delayed ACK", "40 ms constantes", "ss -ti (ato:40)", "juntar escritas, TCP_NODELAY"],
    ["Accept queue cheia", "connect em 1, 3 e 7 s", "ss -ltn, nstat", "aceitar e delegar"],
  ],
};

export const incidentesDeRede: SceneDef = {
  title: "Incidentes reais: conexão morta e portas esgotadas",
  summary: "Acompanhe um pool do Postgres cujas conexões o NAT esqueceu na madrugada, a cura com keepalive e o segundo incidente, o das portas.",
  shell: "bash",
  goals: [
    { text: "Entender como o NAT esquece conexões ociosas sem avisar", step: 3 },
    { text: "Reconhecer o erro só na próxima query", step: 4 },
    { text: "Curar com keepaliveTime, TCP keepalive e maxLifetime", step: 6 },
    { text: "Usar o método sintoma, diagnóstico, correção", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Pool saudável",
      title: "Um serviço com um pool de 3 conexões para o Postgres",
      body: [
        "O serviço roda numa subnet privada e mantém um pool de conexões com um Postgres gerenciado **fora da VPC** (outro provedor, acessado pelo IP público): toda conexão de saída passa pelo **NAT Gateway** (aula 8). Durante o dia, as conexões são usadas sem parar.",
        "Tudo funciona. O incidente nasce **quando o serviço fica ocioso**.",
      ],
      metrics: m30("0 s", "3", "ok"),
      focus: ["app", "pool", "nat", "db"],
      stage: { mode: "iso", entities: incidente({ conn: "ok", natBadge: "3 conexões" }), links: links30(), flows: [flow("app", "db", 2, { via: ["c2", "nat"], kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Idle timeout",
      title: "O NAT esquece conexões sem tráfego",
      body: [
        "Um NAT ou firewall de estado mantém uma tabela de conexões e remove a entrada que fica **ociosa** além de um limite. No NAT Gateway da AWS são **350 segundos**.",
        "Quando a entrada é removida, o gateway **não envia FIN nem RST** às pontas: nenhuma delas fica sabendo.",
      ],
      callout: { kind: "chave", text: "Idle timeout do NAT Gateway: 350 s. Sem tráfego, a entrada some e ninguém é avisado." },
      changes: ["+ idle timeout de 350 s", "Sem tráfego nas conexões"],
      metrics: m30("200 s", "3", "warn"),
      focus: ["pool", "nat"],
      stage: { mode: "iso", entities: incidente({ conn: "warn", connBadge: "ociosa", nat: "warn", natBadge: "idle 350 s" }), links: links30() },
    },
    {
      kind: "problema",
      nav: "Madrugada",
      title: "Passam 350 s: o NAT esquece, o pool não sabe",
      body: [
        "Na madrugada, o serviço fica mais de 350 s sem consultar o banco. O gateway apaga as 3 entradas. Para o kernel do serviço, as conexões continuam `ESTABLISHED`; para o pool, continuam **vivas**.",
        "Ninguém foi avisado: a conexão está morta, mas parece de pé.",
      ],
      changes: ["NAT: 0 entradas", "Pool: 3 conexões que parecem vivas"],
      metrics: m30("6 h", "0", "bad"),
      focus: ["pool", "nat"],
      stage: { mode: "iso", entities: incidente({ conn: "dead", connBadge: "ESTABLISHED", nat: "warn", natBadge: "0 entradas" }), links: links30() },
    },
    {
      kind: "problema",
      nav: "1ª query",
      title: "A primeira query da manhã falha",
      body: [
        "O pool entrega a conexão 1; o pacote chega ao gateway, que não tem a entrada. O NAT Gateway responde com **RST**, e o serviço vê `Connection reset`. Outros firewalls descartam em silêncio, e a aplicação espera o timeout do socket.",
        "O erro aparece **na próxima query**, muito depois da causa. As seguintes funcionam, porque o pool descarta a conexão ruim e abre outra.",
      ],
      callout: { kind: "atencao", text: "Erro só na primeira chamada após um período ocioso, em baixo tráfego: pense em conexão morta por firewall." },
      changes: ["+ query na conexão morta", "Connection reset"],
      metrics: m30("6 h", "0", "bad"),
      focus: ["app", "c1", "nat"],
      stage: { mode: "iso", entities: incidente({ conn: "dead", app: "bad", appBadge: "Connection reset", nat: "bad", natBadge: "RST" }), links: links30(), flows: [flow("app", "nat", 2, { via: ["c1"], kind: "bad" })] },
    },
    {
      kind: "conceito",
      nav: "Diagnóstico",
      title: "Evidência: RST e keepalive desligado",
      body: [
        "O `ss -o` mostra as conexões do pool sem temporizador de keepalive: **ninguém sonda**. O `tcpdump` filtrando RST mostra o `[R]` chegando logo depois do primeiro dado após a ociosidade.",
        "E o `sysctl` revela o motivo de o keepalive do kernel não ajudar: o padrão é **7200 s**, muito acima dos 350 s do gateway.",
      ],
      changes: ["ss -o: sem timer de keepalive", "RST após o 1º segmento"],
      metrics: m30("6 h", "0", "bad"),
      terminal: { suggest: [SS_O, RST_CMD, KEEP_CMD], outputs: { [SS_O]: SS_O_OUT, [RST_CMD]: RST_OUT, [KEEP_CMD]: KEEP_OUT } },
      focus: ["app", "c1", "nat"],
      stage: { mode: "iso", entities: incidente({ conn: "dead", app: "bad", appBadge: "Connection reset", nat: "bad", natBadge: "RST" }), links: links30() },
    },
    {
      kind: "solucao",
      nav: "keepaliveTime",
      title: "Cura: tráfego antes de o NAT esquecer",
      body: [
        "O `keepaliveTime` do HikariCP, em **120 s**, faz o pool testar as conexões ociosas a cada 2 minutos. O tráfego renova a entrada no gateway **antes** dos 350 s, e a conexão nunca fica ociosa o bastante para ser esquecida.",
        "A regra: o intervalo do keepalive precisa ser **menor** que o idle timeout do equipamento.",
      ],
      cmd: "keepaliveTime=120000  # milissegundos, no HikariCP",
      changes: ["+ sondas de keepalive a cada 120 s", "NAT: 3 entradas mantidas"],
      metrics: m30("≤ 120 s", "3", "ok"),
      focus: ["pool", "nat", "db"],
      stage: { mode: "iso", entities: incidente({ conn: "ok", connBadge: "keepalive", nat: "ok", natBadge: "3 conexões" }), links: links30(), flows: [flow("c1", "db", 1, { via: ["nat"], kind: "hc" }), flow("c3", "db", 1, { via: ["nat"], kind: "hc" })] },
    },
    {
      kind: "conceito",
      nav: "Três camadas",
      title: "Pool, TCP e vida máxima trabalham juntos",
      body: [
        "Além do `keepaliveTime`, ligue o **TCP keepalive** (`SO_KEEPALIVE`, `tcpKeepAlive=true` no JDBC, e `tcp_keepalive_time` abaixo do idle timeout) e limite a vida com **`maxLifetime`**, menor que qualquer limite da infraestrutura, para o pool renovar as conexões antes que algo as mate.",
        "Cada camada cobre uma falha diferente: juntas, a conexão morta deixa de chegar à aplicação.",
      ],
      changes: ["+ TCP keepalive", "+ maxLifetime menor que a infra"],
      extra: [curaGrid],
      focus: ["pool", "nat"],
      stage: { mode: "iso", entities: incidente({ conn: "ok", connBadge: "maxLifetime", nat: "ok", natBadge: "idle 350 s" }), links: links30() },
    },
    {
      kind: "problema",
      nav: "Portas esgotadas",
      title: "Incidente 2: o pico esgota as portas efêmeras",
      body: [
        "Outro serviço, sem pool, abre uma conexão por chamada. No pico, as portas efêmeras acabam: `Cannot assign requested address`, sem sair um pacote para a rede. Quando o ritmo cai, as portas voltam sozinhas (aula 24).",
        "O diagnóstico é `ss -s` com dezenas de milhares em `timewait`. A cura é a mesma ideia: **reaproveitar conexões**.",
      ],
      changes: ["− pool de conexões", "+ faixa de portas esgotada"],
      metrics: [{ id: "tw", label: "TIME_WAIT", value: "28.232", tone: "bad" }, { id: "liv", label: "Portas livres", value: 0, tone: "bad" }],
      terminal: { suggest: [SS_S30], outputs: { [SS_S30]: SS_S30_OUT } },
      focus: ["app", "ports", "nat"],
      stage: { mode: "iso", entities: incidente({ noPool: true, ports: 100, portsStatus: "bad", portsBadge: "faixa cheia", app: "bad", appBadge: "BindException" }), links: links30(true), flows: [flow("app", "ports", 3, { kind: "bad" })] },
    },
    {
      kind: "conceito",
      nav: "O método",
      title: "Sintoma, diagnóstico e correção",
      body: [
        "Os incidentes de rede seguem o mesmo roteiro: o **sintoma** aponta a classe do problema, o **diagnóstico** a confirma com um comando, e a **correção** é de configuração ou de padrão de uso.",
        "Um bom pós-incidente registra a linha do tempo, a evidência, a causa-raiz e **uma métrica** que teria alertado antes.",
      ],
      changes: ["+ tabela de incidentes"],
      extra: [metodoGrid],
      focus: ["app", "nat", "db"],
      stage: { mode: "iso", entities: incidente({ conn: "ok", nat: "ok" }), links: links30() },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O firewall esquece e a faixa acaba",
      body: [
        "**Conexão morta:** NAT com idle timeout de 350 s, erro só na próxima query; cure com `keepaliveTime` e TCP keepalive menores que o idle timeout, mais `maxLifetime`. **Portas esgotadas:** `Cannot assign requested address`; cure reaproveitando conexões.",
        "Sempre: sintoma, diagnóstico com comandos, correção.",
      ],
      changes: ["Dois incidentes, duas curas"],
      metrics: m30("≤ 120 s", "3", "ok"),
      focus: ["app", "pool", "nat", "db"],
      stage: { mode: "iso", entities: incidente({ conn: "ok", natBadge: "3 conexões" }), links: links30(), flows: [flow("app", "db", 1, { via: ["c2", "nat"], kind: "data" })] },
    },
  ],
};
