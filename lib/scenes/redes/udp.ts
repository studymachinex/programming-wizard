/**
 * Cenas do módulo "UDP" da trilha Redes para Backend.
 * udpDatagramas: sequência (udp-datagramas).
 * servidorUdp: sequência, shell bash (servidor-udp-em-java).
 */
import type { Metric, SceneDef, SceneStep, SeqLane, SeqMessage, SeqNote } from "../types";
import type { GridPanel } from "@/lib/visualizers/types";

type Seq = Extract<SceneStep["stage"], { mode: "sequence" }>;
type Tone4 = "ok" | "warn" | "bad" | "info";

const msg = (id: string, from: string, to: string, at: number, label: string, o: Partial<SeqMessage> = {}): SeqMessage => ({ id, from, to, at, label, ...o });
const note = (lane: string, at: number, text: string, tone: Tone4 = "info"): SeqNote => ({ lane, at, text, tone });

// =====================================================================================
// Cena 9: UDP, datagrama, prós e contras
// =====================================================================================

const LANES9: SeqLane[] = [
  { id: "cli", label: "Cliente 198.51.100.7", icon: "globe", tone: "mana" },
  { id: "srv", label: "Servidor 203.0.113.10", icon: "server", tone: "arcane" },
];
const seq9 = (messages: SeqMessage[], extra: Partial<Seq> = {}): Seq => ({ mode: "sequence", lanes: LANES9, messages, ...extra });

const m9 = (a: string, b: string, c?: Metric): Metric[] => [{ id: "a", label: "Enviados", value: a }, { id: "b", label: "Recebidos", value: b }, ...(c ? [c] : [])];

const D1 = msg("d1", "cli", "srv", 0, "datagrama #1 · “ping”", { detail: "UDP 54012 → 5000 · 12 B", tone: "data" });

const UDP_HDR: GridPanel = {
  kind: "grid",
  label: "Cabeçalho UDP: 8 bytes, 4 campos de 16 bits",
  colHeaders: ["Porta de origem", "Porta de destino", "Tamanho", "Checksum"],
  rows: [[54012, 5000, 12, "0xd43a"]],
  tones: [0, 1, 2, 3].map((c) => ({ r: 0, c, tone: "active" as const })),
};

const SS_LUN = ["State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process", "UNCONN  0       0              0.0.0.0:5000         0.0.0.0:*"].join("\n");
const TCPDUMP_UDP = ["tcpdump: listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes", "14:02:11.482913 IP 198.51.100.7.54012 > 203.0.113.10.5000: UDP, length 4"].join("\n");

export const udpDatagramas: SceneDef = {
  title: "UDP: datagramas sem garantias",
  summary: "Mande datagramas UDP, veja um se perder e outro chegar fora de ordem sem que ninguém reclame, e entenda onde a garantia passa a ser da aplicação.",
  shell: "bash",
  goals: [
    { text: "Ver como é um datagrama UDP e por que ele dispensa handshake", step: 2 },
    { text: "Entender o que o UDP não promete: entrega e ordem", step: 4 },
    { text: "Reconstruir a ordem com número de sequência na aplicação", step: 6 },
    { text: "Saber quando UDP é a escolha certa e qual o limite de tamanho", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Sem conversa",
      title: "O primeiro datagrama sai sem pedir licença",
      body: [
        "Com TCP, antes do primeiro byte útil há um handshake. Com **UDP** não há: o cliente monta um datagrama e o envia. O servidor só precisa ter um processo ouvindo na porta `5000`.",
        "Não existe conexão, nem estado de sessão no kernel. A palavra do protocolo é *datagrama*: uma mensagem independente, que viaja sozinha.",
      ],
      metrics: m9("1", "1", { id: "hs", label: "Handshake", value: "nenhum", tone: "ok" }),
      terminal: { suggest: ["ss -lun"], outputs: { "ss -lun": SS_LUN } },
      stage: seq9([D1], { notes: [note("srv", 1, "entregue ao processo; ninguém confirma", "info")] }),
    },
    {
      kind: "conceito",
      nav: "8 bytes",
      title: "Um cabeçalho de 8 bytes",
      body: [
        "O cabeçalho UDP tem quatro campos de 16 bits: porta de origem, porta de destino, tamanho (cabeçalho mais dados) e checksum. Para o payload `ping` (4 bytes), o tamanho é 8 + 4 = **12**.",
        "O checksum cobre o cabeçalho, os dados e um pseudo-cabeçalho com os IPs. Detecta corrupção, mas não repara: um datagrama corrompido é simplesmente descartado.",
      ],
      metrics: m9("1", "1", { id: "len", label: "Tamanho UDP", value: "12 B" }),
      terminal: { suggest: ["sudo tcpdump -n -c 1 -i eth0 udp port 5000"], outputs: { "sudo tcpdump -n -c 1 -i eth0 udp port 5000": TCPDUMP_UDP } },
      extra: [UDP_HDR],
      stage: seq9([D1], { notes: [note("srv", 1, "o tcpdump mostra length 4: só os dados", "info")] }),
    },
    {
      kind: "problema",
      nav: "Perda",
      title: "Um datagrama some e ninguém reclama",
      body: [
        "O cliente envia #1, #2 e #3. O roteador de um enlace congestionado descarta o #2. O servidor recebe #1 e #3 e segue a vida.",
        "O UDP não tem confirmação, então **nem o cliente nem o servidor sabem** que algo se perdeu. Para quem envia, a chamada `send()` terminou com sucesso: sucesso aqui significa só “entregue à interface de rede”.",
      ],
      callout: { kind: "atencao", text: "send() bem-sucedido em UDP não prova que o destino recebeu nada." },
      metrics: m9("3", "2", { id: "perda", label: "Perdas detectadas pelo UDP", value: 0, tone: "bad" }),
      stage: seq9(
        [msg("d1", "cli", "srv", 0, "#1", { tone: "data" }), msg("d2", "cli", "srv", 1, "#2", { tone: "bad", lost: true }), msg("d3", "cli", "srv", 2, "#3", { tone: "data" })],
        { notes: [note("srv", 3, "recebeu #1 e #3; nenhum erro", "warn")] },
      ),
    },
    {
      kind: "problema",
      nav: "Fora de ordem",
      title: "E o que chega, chega fora de ordem",
      body: [
        "O IP escolhe o caminho de cada pacote separadamente. Se o #4 pega um enlace mais lento e o #5 um mais rápido (balanceamento entre rotas, por exemplo), o #5 chega primeiro.",
        "O UDP entrega os datagramas na ordem em que **chegam**, não na ordem em que foram enviados. Quem precisa de ordem tem de reconstruí-la.",
      ],
      metrics: m9("2", "2", { id: "ord", label: "Ordem de chegada", value: "#5, #4", tone: "warn" }),
      stage: seq9(
        [msg("a4", "cli", "srv", 0, "#4 (caminho lento)", { span: 3, tone: "data" }), msg("a5", "cli", "srv", 1, "#5 (caminho rápido)", { tone: "data" })],
        { notes: [note("srv", 1, "chega o #5 primeiro", "warn"), note("srv", 3, "e só depois o #4", "warn")] },
      ),
    },
    {
      kind: "conceito",
      nav: "Fronteiras",
      title: "Cada datagrama é uma mensagem inteira",
      body: [
        "Uma vantagem sobre o TCP: as **fronteiras de mensagem são preservadas**. Três `send()` de 100, 200 e 50 bytes viram três datagramas, e o servidor faz exatamente três `receive()`, cada um com uma mensagem completa.",
        "No TCP, que é um fluxo de bytes, os mesmos 350 bytes poderiam chegar em 1, 2 ou 5 leituras, e a aplicação precisa delimitar as mensagens sozinha.",
      ],
      metrics: m9("3", "3", { id: "rcv", label: "Chamadas receive()", value: 3, tone: "ok" }),
      stage: seq9(
        [msg("b1", "cli", "srv", 0, "datagrama de 100 B", { tone: "data" }), msg("b2", "cli", "srv", 1, "datagrama de 200 B", { tone: "data" }), msg("b3", "cli", "srv", 2, "datagrama de 50 B", { tone: "data" })],
        { notes: [note("srv", 3, "3 receive() = 3 mensagens, sem remontar nada", "ok")] },
      ),
    },
    {
      kind: "solucao",
      nav: "Sequência",
      title: "A aplicação numera e reordena",
      body: [
        "Quem precisa de ordem coloca um **número de sequência** no payload. O receptor guarda num buffer o que chegou adiantado: aqui o `seq 2` chega antes do `seq 1`, então espera. Quando o `seq 1` aparece, entrega `1` e `2` em ordem.",
        "O `seq 3` nunca chega. A aplicação decide o que fazer: reclamar, pedir de novo ou seguir sem ele.",
      ],
      metrics: m9("4", "3", { id: "buf", label: "Entrega à aplicação", value: "0, 1, 2" }),
      stage: seq9(
        [
          msg("s0", "cli", "srv", 0, "seq 0", { tone: "data" }),
          msg("s1", "cli", "srv", 1, "seq 1 (atrasado)", { span: 3, tone: "data" }),
          msg("s2", "cli", "srv", 2, "seq 2", { tone: "data" }),
          msg("s3", "cli", "srv", 3, "seq 3", { tone: "bad", lost: true }),
        ],
        {
          notes: [note("srv", 2, "seq 2 chegou, falta o 1: segura no buffer", "warn"), note("srv", 4, "seq 1 chegou: entrega 1 e 2, em ordem", "ok")],
        },
      ),
    },
    {
      kind: "tradeoff",
      nav: "Prazo",
      title: "Esperar o atrasado ou desistir",
      body: [
        "Quanto tempo segurar o `seq 2` esperando o `seq 1`? Esse é o **buffer de jitter**. Prazo curto: baixa latência, mas atrasos normais viram perdas. Prazo longo: poucas perdas falsas, mas tudo chega atrasado.",
        "Em chamadas de voz, em que cada pacote costuma carregar 20 ms de áudio, esperar demais é pior do que perder um pacote. Vencido o prazo, o `seq 3` é **declarado perdido** e a reprodução continua. É o exercício deste módulo.",
      ],
      callout: { kind: "chave", text: "O prazo troca latência por completude. Quem escolhe é a aplicação, e não o protocolo." },
      metrics: m9("4", "3", { id: "prazo", label: "Prazo do buffer", value: "40 ms", tone: "warn" }),
      stage: seq9(
        [
          msg("s0", "cli", "srv", 0, "seq 0", { tone: "data" }),
          msg("s1", "cli", "srv", 1, "seq 1 (atrasado)", { span: 3, tone: "data" }),
          msg("s2", "cli", "srv", 2, "seq 2", { tone: "data" }),
          msg("s3", "cli", "srv", 3, "seq 3", { tone: "bad", lost: true }),
        ],
        { notes: [note("srv", 5, "40 ms sem o seq 3: declarado perdido, segue o jogo", "bad")], brackets: [{ fromAt: 3, toAt: 6, label: "prazo 40 ms" }] },
      ),
    },
    {
      kind: "conceito",
      nav: "Quando usar",
      title: "Quando o UDP é a escolha certa",
      body: [
        "Uma consulta DNS cabe em um datagrama e uma resposta: **1 RTT, sem handshake**. Se a resposta se perde, o cliente repete a pergunta. Voz e vídeo ao vivo, jogos e telemetria preferem um dado novo a um dado antigo retransmitido.",
        "O HTTP/3 também roda sobre UDP: o QUIC reimplementa confiabilidade, ordem e controle de congestionamento **por cima** do UDP, em espaço de usuário.",
      ],
      metrics: m9("1", "1", { id: "rtt", label: "Custo da consulta", value: "1 RTT" }),
      stage: seq9([msg("q1", "cli", "srv", 0, "consulta DNS · UDP :53", { tone: "data" }), msg("q2", "srv", "cli", 1, "resposta (A 203.0.113.10)", { tone: "ok" })], {
        brackets: [{ fromAt: 0, toAt: 1, label: "1 RTT" }],
      }),
    },
    {
      kind: "tradeoff",
      nav: "Tamanho",
      title: "O limite é o MTU, não os 65 KB",
      body: [
        "Em teoria, um datagrama UDP carrega até 65.507 bytes (65.535 menos 20 de IP e 8 de UDP). Na prática, com MTU 1500, **1.472 bytes de dados** cabem num pacote sem fragmentar. Acima disso, o IP fragmenta.",
        "Um datagrama de 3.000 bytes vira 3 fragmentos (1.480 + 1.480 + 48 de dados UDP). Se um fragmento se perde, o datagrama inteiro se perde. O DNS, por isso, limita as respostas em UDP a cerca de 1.232 bytes.",
      ],
      callout: { kind: "atencao", text: "Mantenha cada datagrama abaixo de ~1.400 bytes de payload para não depender de fragmentação." },
      metrics: m9("3 fragmentos", "0", { id: "mtu", label: "Perda efetiva", value: "datagrama inteiro", tone: "bad" }),
      stage: seq9(
        [
          msg("f1", "cli", "srv", 0, "datagrama de 3.000 B", { tone: "data" }),
          msg("f2", "cli", "srv", 1, "fragmento 1 · 1.480 B", { tone: "data" }),
          msg("f3", "cli", "srv", 2, "fragmento 2 · 1.480 B", { tone: "bad", lost: true }),
          msg("f4", "cli", "srv", 3, "fragmento 3 · 48 B", { tone: "data" }),
        ],
        { notes: [note("srv", 4, "falta o fragmento 2: descarta tudo", "bad")] },
      ),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Leve, rápido e sem rede de segurança",
      body: [
        "UDP é IP mais portas e um checksum: datagramas independentes, sem handshake, sem confirmação, sem ordem, sem controle de fluxo. Em troca, tem o menor custo possível.",
        "Tudo o que faltar (ordem, retransmissão, deduplicação) a aplicação implementa, ou escolhe o TCP. É o assunto da próxima aula.",
      ],
      changes: ["Datagramas, perdas e reordenação", "A garantia passa a ser da aplicação"],
      metrics: m9("–", "–", { id: "hdr", label: "Cabeçalho", value: "8 B" }),
      stage: seq9(
        [
          msg("s0", "cli", "srv", 0, "seq 0", { tone: "data" }),
          msg("s1", "cli", "srv", 1, "seq 1 (atrasado)", { span: 3, tone: "data" }),
          msg("s2", "cli", "srv", 2, "seq 2", { tone: "data" }),
          msg("s3", "cli", "srv", 3, "seq 3", { tone: "bad", lost: true }),
        ],
        { laneState: { cli: { text: "sem conexão", tone: "info" }, srv: { text: "sem estado", tone: "info" } } },
      ),
    },
  ],
};

// =====================================================================================
// Cena 10: servidor UDP em Java (timeout, retransmissão, idempotência)
// =====================================================================================

const LANES10: SeqLane[] = [
  { id: "cli", label: "Cliente · DatagramSocket", icon: "globe", tone: "mana" },
  { id: "srv", label: "Servidor · DatagramChannel", icon: "server", tone: "arcane" },
];
const seq10 = (messages: SeqMessage[], extra: Partial<Seq> = {}): Seq => ({ mode: "sequence", lanes: LANES10, messages, ...extra });
const m10 = (a: string, b: string, c?: Metric): Metric[] => [{ id: "a", label: "Cliente", value: a }, { id: "b", label: "Servidor", value: b }, ...(c ? [c] : [])];

const SS10 = ["State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process", "UNCONN  0       0              0.0.0.0:5000         0.0.0.0:*      users:((\"java\",pid=2841,fd=6))"].join("\n");
const SS10_FULL = ["State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process", "UNCONN  212736  0              0.0.0.0:5000         0.0.0.0:*      users:((\"java\",pid=2841,fd=6))"].join("\n");
const NSTAT = ["#kernel", "UdpRcvbufErrors                 4182               0.0"].join("\n");
const NC10 = "echo PING | nc -u -w1 203.0.113.10 5000";

export const servidorUdp: SceneDef = {
  title: "Servidor UDP em Java: timeout, retry e idempotência",
  summary: "Acompanhe um servidor com DatagramChannel e um cliente que sobrevive a perdas com timeout, nova tentativa, backoff e deduplicação.",
  shell: "bash",
  goals: [
    { text: "Ver como um único socket atende vários clientes", step: 3 },
    { text: "Tratar perda com timeout e nova tentativa", step: 5 },
    { text: "Evitar que a nova tentativa execute a operação duas vezes", step: 7 },
    { text: "Reconhecer descarte silencioso por buffer de recepção cheio", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "bind",
      title: "Um socket, sem accept()",
      body: [
        "O servidor abre um `DatagramChannel`, faz `bind` na porta `5000` e chama `receive()`, que bloqueia até chegar um datagrama. Não existe `accept()`: não há conexões, só datagramas chegando num único socket.",
        "O mesmo socket serve todos os clientes. Para o kernel, é apenas uma porta `UNCONN` (sem conexão).",
      ],
      metrics: m10("–", "ouvindo :5000", { id: "sock", label: "Sockets", value: 1 }),
      terminal: { suggest: ["ss -lun"], outputs: { "ss -lun": SS10 } },
      stage: seq10([msg("b0", "srv", "srv", 0, "bind :5000 · receive() bloqueia", { tone: "ctrl" })], { laneState: { srv: { text: "ouvindo", tone: "ok" } } }),
    },
    {
      kind: "conceito",
      nav: "receive",
      title: "receive() entrega o dado e o remetente",
      body: [
        "Quando o datagrama chega, `receive(buffer)` preenche o buffer e **devolve o endereço do remetente** (`198.51.100.7:54012`). Como não há conexão, esse endereço é a única forma de saber para quem responder.",
        "Atenção ao tamanho do buffer: se ele for menor que o datagrama, o excesso é **descartado em silêncio**.",
      ],
      metrics: m10("enviou #1", "recebeu de :54012", { id: "n", label: "Mensagens", value: 1 }),
      terminal: { suggest: [NC10], outputs: { [NC10]: "PONG" } },
      stage: seq10(
        [msg("b0", "srv", "srv", 0, "bind :5000 · receive() bloqueia", { tone: "ctrl" }), msg("q1", "cli", "srv", 1, "req #1 · PING", { tone: "data" }), msg("r0", "srv", "srv", 2, "receive() → de 198.51.100.7:54012", { tone: "ctrl" })],
        { laneState: { srv: { text: "ouvindo", tone: "ok" } } },
      ),
    },
    {
      kind: "solucao",
      nav: "send",
      title: "A resposta vai para o remetente",
      body: [
        "O servidor chama `send(resposta, remetente)` no mesmo canal. Cada datagrama é endereçado individualmente: o servidor pode atender mil clientes alternando o destino a cada `send`.",
        "O cliente recebeu `PONG` em cerca de 12 ms, um RTT. Sem handshake, a primeira mensagem útil já é a requisição.",
      ],
      metrics: m10("recebeu PONG", "respondeu", { id: "rtt", label: "RTT", value: "≈ 12 ms", tone: "ok" }),
      stage: seq10(
        [msg("b0", "srv", "srv", 0, "bind :5000 · receive() bloqueia", { tone: "ctrl" }), msg("q1", "cli", "srv", 1, "req #1 · PING", { tone: "data" }), msg("r0", "srv", "srv", 2, "receive() → de 198.51.100.7:54012", { tone: "ctrl" }), msg("p1", "srv", "cli", 3, "resp #1 · PONG", { tone: "ok" })],
        { brackets: [{ fromAt: 1, toAt: 4, label: "1 RTT ≈ 12 ms" }] },
      ),
    },
    {
      kind: "problema",
      nav: "Resposta perdida",
      title: "Perdeu-se um datagrama: o cliente trava",
      body: [
        "O cliente envia a req #2 e o servidor responde, mas a resposta se perde no caminho. O cliente está em `receive()` esperando algo que **nunca vai chegar**.",
        "Sem timeout, a chamada bloqueia para sempre, e a thread do cliente fica presa. Esse é o erro mais comum em cliente UDP.",
      ],
      callout: { kind: "atencao", text: "Todo receive() de cliente UDP precisa de timeout: setSoTimeout(ms)." },
      metrics: m10("bloqueado", "respondeu", { id: "wait", label: "Espera", value: "infinita", tone: "bad" }),
      stage: seq10([msg("q2", "cli", "srv", 0, "req #2 · PING", { tone: "data" }), msg("p2", "srv", "cli", 1, "resp #2 · PONG", { tone: "bad", lost: true })], {
        notes: [note("cli", 2, "receive() esperando para sempre", "bad")],
        laneState: { cli: { text: "bloqueado", tone: "bad" } },
      }),
    },
    {
      kind: "solucao",
      nav: "Timeout + retry",
      title: "Timeout e nova tentativa",
      body: [
        "Com `setSoTimeout(200)`, o `receive()` lança `SocketTimeoutException` após 200 ms. O cliente trata a exceção e **reenvia a mesma requisição**; dessa vez a resposta chega.",
        "A retransmissão que o TCP faz sozinho, aqui é código seu. Por isso a requisição precisa ter um **identificador** (o `#2`), para que as tentativas possam ser reconhecidas como a mesma.",
      ],
      metrics: m10("tentativa 2", "respondeu 2×", { id: "tmo", label: "Timeout", value: "200 ms" }),
      stage: seq10(
        [
          msg("q2", "cli", "srv", 0, "req #2 · PING", { tone: "data" }),
          msg("p2", "srv", "cli", 1, "resp #2 · PONG", { tone: "bad", lost: true }),
          msg("t2", "cli", "cli", 3, "SocketTimeoutException (200 ms)", { tone: "ctrl" }),
          msg("q2b", "cli", "srv", 4, "req #2 · PING (tentativa 2)", { tone: "data" }),
          msg("p2b", "srv", "cli", 5, "resp #2 · PONG", { tone: "ok" }),
        ],
        { brackets: [{ fromAt: 0, toAt: 3, label: "200 ms" }] },
      ),
    },
    {
      kind: "problema",
      nav: "Duplicata",
      title: "E se a perda foi da resposta?",
      body: [
        "A req #3 é “debitar R$ 10”. O servidor a recebe, **executa** e responde, mas a resposta se perde. O cliente, sem saber, reenvia a #3 após o timeout.",
        "O servidor recebe a segunda cópia e executa de novo: R$ 20 debitados. Do ponto de vista do cliente, a rede perdeu um datagrama. Do ponto de vista do servidor, chegou uma ordem nova.",
      ],
      callout: { kind: "atencao", text: "Retransmitir é seguro só se a operação for idempotente ou o servidor deduplicar." },
      metrics: m10("tentativa 2", "executou 2×", { id: "deb", label: "Débito", value: "R$ 20", tone: "bad" }),
      stage: seq10(
        [
          msg("c1", "cli", "srv", 0, "req #3 · debitar R$ 10", { tone: "data" }),
          msg("c2", "srv", "srv", 1, "executa: debita R$ 10", { tone: "ctrl" }),
          msg("c3", "srv", "cli", 2, "resp #3 · OK", { tone: "bad", lost: true }),
          msg("c4", "cli", "cli", 3, "timeout (200 ms)", { tone: "ctrl" }),
          msg("c5", "cli", "srv", 4, "req #3 (tentativa 2)", { tone: "data" }),
          msg("c6", "srv", "srv", 5, "executa de novo: debita R$ 10", { tone: "bad" }),
        ],
        { notes: [note("srv", 6, "cobrou em dobro", "bad")] },
      ),
    },
    {
      kind: "solucao",
      nav: "Idempotência",
      title: "O servidor lembra o que já respondeu",
      body: [
        "O servidor guarda, por `(remetente, id)`, a **última resposta enviada**. Quando a #3 chega de novo, ele não executa nada: reenvia a resposta guardada. A operação roda uma vez só, mesmo com várias tentativas.",
        "O cache precisa de limite e validade (um `LinkedHashMap` com remoção do mais antigo, por exemplo), senão a memória do servidor cresce sem parar.",
      ],
      metrics: m10("recebeu OK", "executou 1×", { id: "deb", label: "Débito", value: "R$ 10", tone: "ok" }),
      stage: seq10(
        [
          msg("c1", "cli", "srv", 0, "req #3 · debitar R$ 10", { tone: "data" }),
          msg("c2", "srv", "srv", 1, "executa: debita R$ 10", { tone: "ctrl" }),
          msg("c3", "srv", "cli", 2, "resp #3 · OK", { tone: "bad", lost: true }),
          msg("c4", "cli", "cli", 3, "timeout (200 ms)", { tone: "ctrl" }),
          msg("c5", "cli", "srv", 4, "req #3 (tentativa 2)", { tone: "data" }),
          msg("c7", "srv", "srv", 5, "id 3 já visto: reenvia a guardada", { tone: "ok" }),
          msg("c8", "srv", "cli", 6, "resp #3 · OK", { tone: "ok" }),
        ],
        { notes: [note("srv", 7, "executado uma única vez", "ok")] },
      ),
    },
    {
      kind: "conceito",
      nav: "Backoff",
      title: "Quanto esperar entre tentativas",
      body: [
        "Se o servidor estiver sobrecarregado, tentar de novo a cada 200 ms só piora. O cliente usa **backoff exponencial**: espera 200 ms, depois 400 ms, depois 800 ms, e acrescenta um pouco de aleatoriedade (*jitter*) para que milhares de clientes não retentem juntos.",
        "Há também um **limite de tentativas**: após a terceira, o cliente desiste e informa o erro. Total de espera: 1,4 s.",
      ],
      metrics: m10("3 tentativas", "sem resposta", { id: "tot", label: "Espera total", value: "1,4 s", tone: "warn" }),
      stage: seq10(
        [
          msg("e1", "cli", "srv", 0, "tentativa 1", { tone: "bad", lost: true }),
          msg("e2", "cli", "srv", 2, "tentativa 2", { tone: "bad", lost: true }),
          msg("e3", "cli", "srv", 5, "tentativa 3", { tone: "bad", lost: true }),
        ],
        {
          notes: [note("cli", 9, "desiste: SocketTimeoutException para o chamador", "bad")],
          brackets: [
            { fromAt: 0, toAt: 2, label: "200 ms" },
            { fromAt: 2, toAt: 5, label: "400 ms" },
            { fromAt: 5, toAt: 9, label: "800 ms" },
          ],
        },
      ),
    },
    {
      kind: "tradeoff",
      nav: "Buffer cheio",
      title: "O servidor lento perde datagramas sem avisar",
      body: [
        "O kernel guarda os datagramas recebidos num buffer (`SO_RCVBUF`) até a aplicação chamar `receive()`. Se o servidor é mais lento que a chegada, o buffer enche e os datagramas novos são **descartados sem nenhum erro** para ninguém.",
        "O sintoma aparece no `Recv-Q` do `ss` e no contador `UdpRcvbufErrors`. A cura é processar rápido (uma thread só recebendo e enfileirando) e, se preciso, aumentar o buffer com `setReceiveBufferSize`.",
      ],
      callout: { kind: "bom-saber", text: "O tamanho efetivo do buffer é limitado por net.core.rmem_max; o valor pedido pode ser reduzido." },
      metrics: m10("rajada de 4", "Recv-Q cheio", { id: "err", label: "UdpRcvbufErrors", value: 4182, tone: "bad" }),
      terminal: { suggest: ["ss -lun", "nstat -az UdpRcvbufErrors"], outputs: { "ss -lun": SS10_FULL, "nstat -az UdpRcvbufErrors": NSTAT } },
      stage: seq10(
        [
          msg("k1", "cli", "srv", 0, "rajada #1", { tone: "data" }),
          msg("k2", "cli", "srv", 1, "rajada #2", { tone: "data" }),
          msg("k3", "cli", "srv", 2, "rajada #3", { tone: "data" }),
          msg("k4", "cli", "srv", 3, "rajada #4", { tone: "bad", lost: true }),
        ],
        { notes: [note("srv", 4, "buffer do kernel cheio: descarta #4 sem erro", "bad")], laneState: { srv: { text: "lento no receive()", tone: "warn" } } },
      ),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Confiabilidade é decisão sua",
      body: [
        "Um cliente UDP robusto tem **timeout**, **retentativa com backoff e limite**, **identificador** por requisição e um servidor que **deduplica**. Um servidor UDP robusto recebe rápido e processa fora da thread de recepção.",
        "Se você acabou implementando ordem, retransmissão e controle de congestionamento, provavelmente deveria ter usado TCP, a menos que tenha um motivo forte, como latência ou o QUIC.",
      ],
      changes: ["Timeout, retry, backoff e deduplicação", "Descarte por buffer cheio"],
      metrics: m10("timeout + retry", "deduplica", { id: "id", label: "Chave de dedup", value: "(remetente, id)" }),
      stage: seq10(
        [
          msg("c1", "cli", "srv", 0, "req #3 · debitar R$ 10", { tone: "data" }),
          msg("c2", "srv", "srv", 1, "executa: debita R$ 10", { tone: "ctrl" }),
          msg("c3", "srv", "cli", 2, "resp #3 · OK", { tone: "bad", lost: true }),
          msg("c4", "cli", "cli", 3, "timeout (200 ms)", { tone: "ctrl" }),
          msg("c5", "cli", "srv", 4, "req #3 (tentativa 2)", { tone: "data" }),
          msg("c7", "srv", "srv", 5, "id 3 já visto: reenvia a guardada", { tone: "ok" }),
          msg("c8", "srv", "cli", 6, "resp #3 · OK", { tone: "ok" }),
        ],
        { laneState: { cli: { text: "timeout + backoff", tone: "ok" }, srv: { text: "deduplica", tone: "ok" } } },
      ),
    },
  ],
};
