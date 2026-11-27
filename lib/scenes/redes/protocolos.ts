/**
 * Cenas do módulo "DNS, TLS e HTTP" da trilha Redes para Backend.
 * dnsResolucaoECache: sequência, shell bash (dns-resolucao-e-cache).
 * tlsHandshake: sequência, shell bash (tls-handshake).
 * httpsECertificados: isométrico, shell bash (https-certificados-e-sni).
 * http123: sequência, shell bash (http1-http2-http3).
 */
import type { IsoEntity, Metric, SceneDef, SceneStep, SeqLane, SeqMessage, SeqNote, Status } from "../types";
import type { GridPanel } from "@/lib/visualizers/types";
import { box, flow, link, users } from "../kit/common";
import { rowXY } from "../kit/net";

type Seq = Extract<SceneStep["stage"], { mode: "sequence" }>;
type Tone4 = "ok" | "warn" | "bad" | "info";

const msg = (id: string, from: string, to: string, at: number, label: string, o: Partial<SeqMessage> = {}): SeqMessage => ({ id, from, to, at, label, ...o });
const note = (lane: string, at: number, text: string, tone: Tone4 = "info"): SeqNote => ({ lane, at, text, tone });
const state = (text: string, tone: Tone4 = "info") => ({ text, tone });

// =====================================================================================
// Cena 17: DNS, resolução e cache (CNAME, TTL decrescente, cache negativo)
// =====================================================================================

const LANES17: SeqLane[] = [
  { id: "app", label: "Aplicação (JVM)", icon: "cpu", tone: "mana" },
  { id: "res", label: "Resolver recursivo", icon: "search", tone: "arcane" },
  { id: "a1", label: "ns da loja.com.br", icon: "server", tone: "ember" },
  { id: "a2", label: "ns do cdn-exemplo.net", icon: "server", tone: "sky" },
];
const seq17 = (messages: SeqMessage[], extra: Partial<Seq> = {}): Seq => ({ mode: "sequence", lanes: LANES17, messages, ...extra });
const m17 = (consultas: number, latencia: string, cache: string, tone?: Metric["tone"]): Metric[] => [
  { id: "q", label: "Consultas de rede", value: consultas },
  { id: "lat", label: "Latência", value: latencia, tone },
  { id: "cache", label: "Cache do resolver", value: cache },
];

const ASK = msg("k1", "app", "res", 0, "A? www.loja.com.br");
const Q1 = msg("k2", "res", "a1", 1, "A? www.loja.com.br");
const R1 = msg("k3", "a1", "res", 2, "CNAME loja.cdn-exemplo.net. · TTL 600", { tone: "ctrl" });
const Q2 = msg("k4", "res", "a2", 3, "A? loja.cdn-exemplo.net");
const R2 = msg("k5", "a2", "res", 4, "CNAME edge.cdn-exemplo.net. · TTL 300", { tone: "ctrl" });
const Q3 = msg("k6", "res", "a2", 5, "A? edge.cdn-exemplo.net");
const R3 = msg("k7", "a2", "res", 6, "A 198.51.100.50 · TTL 60", { tone: "ok" });
const ANS = msg("k8", "res", "app", 7, "CNAME → CNAME → A 198.51.100.50", { tone: "ok" });

const zoneGrid: GridPanel = {
  kind: "grid",
  label: "Zona loja.com.br (registros do autoritativo)",
  colHeaders: ["Nome", "Tipo", "Valor", "TTL (s)"],
  rows: [
    ["loja.com.br", "A", "203.0.113.10", 300],
    ["loja.com.br", "AAAA", "2001:db8::10", 300],
    ["loja.com.br", "MX", "10 mx.loja.com.br.", 3600],
    ["loja.com.br", "NS", "ns1.loja.com.br.", 3600],
    ["www.loja.com.br", "CNAME", "loja.cdn-exemplo.net.", 600],
  ],
  tones: [{ r: 4, c: 1, tone: "active" }, { r: 4, c: 2, tone: "active" }],
};

const cacheGrid = (rows: [string, string, number | string][], hi: number[] = [], label = "Cache do resolver"): GridPanel => ({
  kind: "grid",
  label,
  colHeaders: ["Nome", "Tipo", "TTL restante (s)"],
  rows,
  tones: hi.map((r) => ({ r, c: 2, tone: "active" as const })),
});

const ANS_FIRST = ["www.loja.com.br.\t\t600\tIN\tCNAME\tloja.cdn-exemplo.net.", "loja.cdn-exemplo.net.\t300\tIN\tCNAME\tedge.cdn-exemplo.net.", "edge.cdn-exemplo.net.\t60\tIN\tA\t198.51.100.50"].join("\n");
const ANS_T20 = ["www.loja.com.br.\t\t580\tIN\tCNAME\tloja.cdn-exemplo.net.", "loja.cdn-exemplo.net.\t280\tIN\tCNAME\tedge.cdn-exemplo.net.", "edge.cdn-exemplo.net.\t40\tIN\tA\t198.51.100.50"].join("\n");
const ANS_T61 = ["www.loja.com.br.\t\t539\tIN\tCNAME\tloja.cdn-exemplo.net.", "loja.cdn-exemplo.net.\t239\tIN\tCNAME\tedge.cdn-exemplo.net.", "edge.cdn-exemplo.net.\t60\tIN\tA\t198.51.100.50"].join("\n");
const DIG_CNAME = "dig +noall +answer www.loja.com.br";
const DIG_NX = [
  ";; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 50119",
  ";; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1",
  "",
  ";; QUESTION SECTION:",
  ";api.loja.com.br.\t\tIN\tA",
  "",
  ";; AUTHORITY SECTION:",
  "loja.com.br.\t\t300\tIN\tSOA\tns1.loja.com.br. hostmaster.loja.com.br. 2026112701 7200 900 1209600 300",
  "",
  ";; Query time: 41 msec",
].join("\n");
const DIG_NX_LATER = DIG_NX.replace("50119", "50120").replace("300\tIN\tSOA", "180\tIN\tSOA").replace("41 msec", "0 msec");
const DIG_API = "dig api.loja.com.br";
const DIG_SHORT_EDGE = "dig +short edge.cdn-exemplo.net";

export const dnsResolucaoECache: SceneDef = {
  title: "DNS por dentro: CNAME, TTL e cache negativo",
  summary: "Siga uma consulta por uma cadeia de CNAME, veja o TTL descendo no cache do resolver e o NXDOMAIN ficar guardado.",
  shell: "bash",
  goals: [
    { text: "Ler os tipos de registro: A, AAAA, CNAME, NS e MX", step: 2 },
    { text: "Seguir uma cadeia de CNAME até o endereço final", step: 4 },
    { text: "Ver o TTL de cada registro descendo no cache", step: 6 },
    { text: "Entender o cache negativo (NXDOMAIN) e o cache da JVM", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Registros",
      title: "Um nome, vários tipos de registro",
      body: [
        "Um nome DNS não guarda só um IP. Cada **tipo de registro** responde a uma pergunta: **A** (IPv4), **AAAA** (IPv6), **CNAME** (este nome é apelido de outro), **NS** (quem é autoritativo pela zona) e **MX** (quem recebe os e-mails).",
        "A aplicação pergunta `www.loja.com.br`. Na zona, ele não tem IP próprio: é um **CNAME** para `loja.cdn-exemplo.net`, mantido por uma CDN.",
      ],
      changes: ["a aplicação pergunta pelo A de www.loja.com.br"],
      metrics: m17(0, "–", "vazio"),
      terminal: {
        suggest: ["dig loja.com.br AAAA +short", "dig loja.com.br MX +short", "dig loja.com.br NS +short"],
        outputs: { "dig loja.com.br AAAA +short": "2001:db8::10", "dig loja.com.br MX +short": "10 mx.loja.com.br.", "dig loja.com.br NS +short": "ns1.loja.com.br." },
      },
      extra: [zoneGrid],
      stage: seq17([ASK]),
    },
    {
      kind: "conceito",
      nav: "CNAME",
      title: "CNAME: um apelido, não um endereço",
      body: [
        "O resolver pergunta ao autoritativo da zona e recebe um **CNAME**: `www.loja.com.br` é apelido de `loja.cdn-exemplo.net`, com TTL de 600 s. Ele ainda **não tem um IP**: precisa perguntar de novo, agora pelo alvo.",
        "Regra do DNS: um nome com CNAME **não pode ter outros registros** (A, MX...). Por isso o domínio raiz (`loja.com.br`, que precisa de NS e MX) não pode ser um CNAME, e provedores oferecem soluções próprias (ALIAS, ANAME).",
      ],
      changes: ["+ CNAME www.loja.com.br → loja.cdn-exemplo.net"],
      metrics: m17(1, "≈ 20 ms", "vazio"),
      stage: seq17([ASK, Q1, R1]),
    },
    {
      kind: "conceito",
      nav: "Seguir a cadeia",
      title: "O resolver segue a cadeia sozinho",
      body: [
        "O alvo está noutra zona, com outro servidor autoritativo. O resolver pergunta lá e recebe **outro CNAME**: `loja.cdn-exemplo.net` aponta para `edge.cdn-exemplo.net` (TTL 300 s). Só então vem o **A**: `198.51.100.50`, TTL 60 s.",
        "Foram **três consultas de rede**, uma por elo. Quem cuida da cadeia é o resolver: a aplicação só vê o resultado. Cadeias longas custam latência, e por isso resolvers limitam o número de saltos e **detectam laços** (a CNAME b, b CNAME a).",
      ],
      changes: ["+ CNAME loja.cdn-exemplo.net → edge.cdn-exemplo.net", "+ A 198.51.100.50 (TTL 60)"],
      metrics: m17(3, "≈ 75 ms", "vazio", "warn"),
      stage: seq17([ASK, Q1, R1, Q2, R2, Q3, R3]),
    },
    {
      kind: "solucao",
      nav: "Resposta + cache",
      title: "A resposta leva a cadeia, e cada elo vai para o cache",
      body: [
        "O resolver devolve à aplicação a cadeia inteira. Cada registro é guardado **com o seu próprio TTL**: 600 s o primeiro CNAME, 300 s o segundo, 60 s o A. A resposta já está pronta para a próxima pergunta.",
        "O TTL que vale para quem reutiliza a resposta é o **menor da cadeia**: 60 s. Mesmo com um CNAME de 10 minutos, o IP final pode mudar em um minuto.",
      ],
      callout: { kind: "chave", text: "O TTL efetivo de um nome com CNAME é o menor TTL da cadeia. Cada registro expira por conta própria." },
      changes: ["+ resposta final à aplicação", "3 registros guardados no cache"],
      metrics: m17(3, "≈ 80 ms", "3 registros"),
      terminal: { suggest: [DIG_CNAME], outputs: { [DIG_CNAME]: ANS_FIRST } },
      extra: [cacheGrid([["www.loja.com.br", "CNAME", 600], ["loja.cdn-exemplo.net", "CNAME", 300], ["edge.cdn-exemplo.net", "A", 60]], [2])],
      stage: seq17([ASK, Q1, R1, Q2, R2, Q3, R3, ANS]),
    },
    {
      kind: "conceito",
      nav: "TTL descendo",
      title: "20 segundos depois: tudo vem do cache",
      body: [
        "A aplicação pergunta de novo. O resolver responde **sem nenhuma consulta de rede**, com o TTL **menor que antes**: 580, 280 e 40 s. O TTL que o cliente recebe é o que sobra, e não o original.",
        "É por isso que o `dig` repetido mostra números decrescentes. Quando o contador chegar a zero, o registro é removido e a próxima pergunta vai à rede.",
      ],
      changes: ["0 consultas de rede", "TTLs: 580, 280 e 40 s"],
      metrics: m17(0, "< 1 ms", "3 registros", "ok"),
      terminal: { suggest: [DIG_CNAME], outputs: { [DIG_CNAME]: ANS_T20 } },
      extra: [cacheGrid([["www.loja.com.br", "CNAME", 580], ["loja.cdn-exemplo.net", "CNAME", 280], ["edge.cdn-exemplo.net", "A", 40]], [0, 1, 2], "Cache do resolver, em t = 20 s")],
      stage: seq17([msg("c1", "app", "res", 0, "A? www.loja.com.br"), msg("c2", "res", "res", 1, "cache: A restam 40 s", { tone: "ok" }), msg("c3", "res", "app", 2, "CNAME → CNAME → A · TTL 40", { tone: "ok" })], { laneState: { res: state("cache hit", "ok") } }),
    },
    {
      kind: "conceito",
      nav: "Expira só o A",
      title: "Aos 61 s, expira só o que venceu",
      body: [
        "Passados 61 s, o `A` (60 s) venceu, mas os dois CNAMEs (600 e 300 s) continuam válidos. O resolver faz **uma única consulta**: o A de `edge.cdn-exemplo.net`. Os elos intermediários não são perguntados de novo.",
        "Resultado: 1 consulta em vez de 3, e o IP novo, se a CDN o trocou, chega em até 60 s. Esse comportamento, por registro e não por nome, é o que o exercício do módulo pede.",
      ],
      changes: ["só o A expirou", "1 consulta em vez de 3", "TTL do A volta a 60 s"],
      metrics: m17(1, "≈ 25 ms", "2 válidos + 1 novo"),
      terminal: { suggest: [DIG_CNAME], outputs: { [DIG_CNAME]: ANS_T61 } },
      extra: [cacheGrid([["www.loja.com.br", "CNAME", 539], ["loja.cdn-exemplo.net", "CNAME", 239], ["edge.cdn-exemplo.net", "A", "60 (renovado)"]], [2], "Cache do resolver, em t = 61 s")],
      stage: seq17([msg("e1", "app", "res", 0, "A? www.loja.com.br"), msg("e2", "res", "a2", 1, "A? edge.cdn-exemplo.net"), msg("e3", "a2", "res", 2, "A 198.51.100.50 · TTL 60", { tone: "ok" }), msg("e4", "res", "app", 3, "CNAME → CNAME → A", { tone: "ok" })], {
        notes: [note("res", 4, "os dois CNAMEs ainda valem: sem consulta", "info")],
      }),
    },
    {
      kind: "problema",
      nav: "NXDOMAIN",
      title: "O nome ainda não existe",
      body: [
        "A aplicação pergunta por `api.loja.com.br`, que o time de infraestrutura ainda não criou. O autoritativo responde **NXDOMAIN** (o nome não existe) e anexa o registro **SOA** da zona, cujo último campo, `300`, é o **TTL negativo**.",
        "O resolver guarda a **ausência** por até 300 s (RFC 2308). É o **cache negativo**: ele evita que um nome inexistente (um erro de digitação, uma consulta de varredura) seja perguntado a cada tentativa.",
      ],
      changes: ["+ NXDOMAIN para api.loja.com.br", "+ SOA com TTL negativo 300 s"],
      metrics: m17(1, "≈ 41 ms", "NXDOMAIN por 300 s", "warn"),
      terminal: { suggest: [DIG_API], outputs: { [DIG_API]: DIG_NX } },
      extra: [cacheGrid([["www.loja.com.br", "CNAME", 600], ["api.loja.com.br", "NXDOMAIN", 300]], [1])],
      stage: seq17([msg("n1", "app", "res", 0, "A? api.loja.com.br"), msg("n2", "res", "a1", 1, "A? api.loja.com.br"), msg("n3", "a1", "res", 2, "NXDOMAIN · SOA (TTL negativo 300)", { tone: "bad" }), msg("n4", "res", "app", 3, "NXDOMAIN", { tone: "bad" })]),
    },
    {
      kind: "problema",
      nav: "Deploy não pega",
      title: "Criou o registro e o nome continua inexistente",
      body: [
        "Dois minutos depois, o time cria `api.loja.com.br` no autoritativo. A aplicação pergunta de novo e continua recebendo **NXDOMAIN**: o resolver ainda tem a ausência no cache, com 180 s restantes. A resposta errada vem de graça e de forma instantânea.",
        "A cura é **esperar** o TTL negativo, ou testar o nome antes de usá-lo. Na JVM há mais uma camada: `networkaddress.cache.negative.ttl` (10 s por padrão) guarda o fracasso dentro do próprio processo.",
      ],
      callout: { kind: "atencao", text: "Consultar um nome antes de ele existir faz o cache negativo ocultar o registro novo até o TTL do SOA acabar." },
      changes: ["registro criado no autoritativo", "o resolver ainda responde NXDOMAIN (180 s)"],
      metrics: m17(0, "< 1 ms", "NXDOMAIN, restam 180 s", "bad"),
      terminal: { suggest: [DIG_API], outputs: { [DIG_API]: DIG_NX_LATER } },
      extra: [cacheGrid([["www.loja.com.br", "CNAME", 480], ["api.loja.com.br", "NXDOMAIN", 180]], [1], "Cache do resolver, em t = 120 s")],
      stage: seq17([msg("p1", "a1", "a1", 0, "cria o registro api.loja.com.br", { tone: "ok" }), msg("p2", "app", "res", 1, "A? api.loja.com.br"), msg("p3", "res", "res", 2, "cache negativo: restam 180 s", { tone: "bad" }), msg("p4", "res", "app", 3, "NXDOMAIN", { tone: "bad" })], {
        laneState: { res: state("cache negativo", "bad") },
      }),
    },
    {
      kind: "tradeoff",
      nav: "TTL e a JVM",
      title: "Rodízio de A, TTL e o cache da JVM",
      body: [
        "Um nome pode ter **vários A**, e o servidor rotaciona a ordem (*round robin*) para distribuir carga: `edge.cdn-exemplo.net` devolve `198.51.100.50` e `198.51.100.51`. O cliente deve **tentar o próximo** se o primeiro falhar. DNS não verifica a saúde dos servidores.",
        "O TTL é uma troca entre frescor e carga. E a JVM tem **o seu próprio cache**: `networkaddress.cache.ttl` vale 30 s por padrão, e o valor `-1` guarda para sempre. Quem depende de failover por DNS precisa conferir esse ajuste, e não só o TTL da zona.",
      ],
      changes: ["+ dois registros A em rodízio", "cache da JVM: 30 s"],
      metrics: m17(1, "≈ 20 ms", "2 endereços", "ok"),
      terminal: { suggest: [DIG_SHORT_EDGE], outputs: { [DIG_SHORT_EDGE]: ["198.51.100.50", "198.51.100.51"].join("\n") } },
      stage: seq17([msg("r1", "app", "res", 0, "A? edge.cdn-exemplo.net"), msg("r2", "res", "app", 1, "A 198.51.100.50, A 198.51.100.51", { tone: "ok" })], {
        notes: [note("app", 2, "o cache da JVM (30 s) guarda esse resultado", "info"), note("res", 4, "na próxima resposta, a ordem rotaciona", "info")],
      }),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Registros, TTLs e dois tipos de cache",
      body: [
        "**A/AAAA** dão o endereço, **CNAME** é apelido (o resolver segue a cadeia), **NS** delega, **MX** é de e-mail. Cada registro tem o seu TTL, e o da resposta é o menor da cadeia.",
        "O **TTL desce** no cache; só o registro vencido é perguntado de novo. **NXDOMAIN também é cacheado**, pelo TTL negativo do SOA. E a JVM acrescenta o seu cache: `networkaddress.cache.ttl` e `...negative.ttl`.",
      ],
      changes: ["Registros, cadeia, TTL e cache negativo"],
      metrics: m17(3, "uma vez", "por registro"),
      terminal: { suggest: [DIG_CNAME], outputs: { [DIG_CNAME]: ANS_FIRST } },
      extra: [cacheGrid([["www.loja.com.br", "CNAME", 600], ["loja.cdn-exemplo.net", "CNAME", 300], ["edge.cdn-exemplo.net", "A", 60], ["api.loja.com.br", "NXDOMAIN", 300]])],
      stage: seq17([ASK, Q1, R1, Q2, R2, Q3, R3, ANS]),
    },
  ],
};

// =====================================================================================
// Cena 18: TLS 1.2 vs 1.3 vs 0-RTT
// =====================================================================================

const LANES18: SeqLane[] = [
  { id: "cli", label: "Cliente", icon: "globe", tone: "mana" },
  { id: "srv", label: "Servidor", icon: "server", tone: "arcane" },
];
const LANES18R: SeqLane[] = [
  { id: "cli", label: "Cliente", icon: "globe", tone: "mana" },
  { id: "atk", label: "Atacante (na rede)", icon: "eye", tone: "rose" },
  { id: "srv", label: "Servidor", icon: "server", tone: "arcane" },
];
const seq18 = (messages: SeqMessage[], extra: Partial<Seq> = {}): Seq => ({ mode: "sequence", lanes: LANES18, messages, ...extra });
const m18 = (rtts: string, versao: string, c?: Metric): Metric[] => [{ id: "v", label: "Versão", value: versao }, { id: "rtt", label: "RTTs até a resposta", value: rtts }, ...(c ? [c] : [])];

const TCP3 = [msg("s1", "cli", "srv", 0, "SYN"), msg("s2", "srv", "cli", 1, "SYN-ACK"), msg("s3", "cli", "srv", 2, "ACK", { tone: "ok" })];
const TCP_BR = { fromAt: 0, toAt: 2, label: "TCP: 1 RTT" };

const T12 = [
  msg("t1", "cli", "srv", 3, "ClientHello · versões, suítes, random", { tone: "ctrl" }),
  msg("t2", "srv", "cli", 4, "ServerHello · Certificate · ServerKeyExchange · ServerHelloDone", { tone: "ctrl" }),
  msg("t3", "cli", "srv", 5, "ClientKeyExchange · ChangeCipherSpec · Finished", { tone: "ctrl" }),
  msg("t4", "srv", "cli", 6, "ChangeCipherSpec · Finished", { tone: "ctrl" }),
  msg("t5", "cli", "srv", 7, "GET /pedidos (criptografado)", { tone: "data" }),
  msg("t6", "srv", "cli", 8, "200 OK (criptografado)", { tone: "ok" }),
];
const T13 = [
  msg("u1", "cli", "srv", 3, "ClientHello · key_share (x25519) · versões", { tone: "ctrl" }),
  msg("u2", "srv", "cli", 4, "ServerHello · key_share · {Certificate · CertificateVerify · Finished}", { tone: "ctrl" }),
  msg("u3", "cli", "srv", 5, "{Finished} · GET /pedidos", { tone: "data" }),
  msg("u4", "srv", "cli", 6, "200 OK", { tone: "ok" }),
];

const OPENSSL = "openssl s_client -connect loja.com.br:443 -tls1_3";
const OPENSSL_OUT = [
  "CONNECTED(00000003)",
  "---",
  "Certificate chain",
  " 0 s:CN = loja.com.br",
  "   i:O = CA de Exemplo, CN = CA de Exemplo Intermediaria R1",
  "---",
  "SSL handshake has read 2891 bytes and written 311 bytes",
  "Verification: OK",
  "---",
  "New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384",
  "Server public key is 256 bit",
].join("\n");
const CURL12 = "curl -sv --tlsv1.2 --tls-max 1.2 https://loja.com.br/ -o /dev/null";
const CURL12_OUT = [
  "* TLSv1.2 (OUT), TLS handshake, Client hello (1):",
  "* TLSv1.2 (IN), TLS handshake, Server hello (2):",
  "* TLSv1.2 (IN), TLS handshake, Certificate (11):",
  "* TLSv1.2 (IN), TLS handshake, Server key exchange (12):",
  "* TLSv1.2 (IN), TLS handshake, Server finished (14):",
  "* TLSv1.2 (OUT), TLS handshake, Client key exchange (16):",
  "* TLSv1.2 (OUT), TLS change cipher, Change cipher spec (1):",
  "* TLSv1.2 (OUT), TLS handshake, Finished (20):",
  "* TLSv1.2 (IN), TLS handshake, Finished (20):",
  "* SSL connection using TLSv1.2 / ECDHE-ECDSA-AES128-GCM-SHA256",
].join("\n");

const versionGrid: GridPanel = {
  kind: "grid",
  label: "RTTs até a resposta HTTP (sem contar o DNS)",
  colHeaders: ["Cenário", "TCP", "TLS", "Requisição", "Total"],
  rows: [
    ["TLS 1.2, conexão nova", 1, 2, 1, 4],
    ["TLS 1.3, conexão nova", 1, 1, 1, 3],
    ["TLS 1.3, 0-RTT (retomada)", 1, 0, 1, 2],
    ["TLS 1.3, conexão reaproveitada", 0, 0, 1, 1],
  ],
  tones: [{ r: 0, c: 4, tone: "bad" }, { r: 1, c: 4, tone: "active" }, { r: 2, c: 4, tone: "done" }, { r: 3, c: 4, tone: "done" }],
};

export const tlsHandshake: SceneDef = {
  title: "TLS 1.2, TLS 1.3 e 0-RTT: quantas idas e voltas",
  summary: "Compare os handshakes de TLS 1.2 (2 RTT), TLS 1.3 (1 RTT) e 0-RTT, e veja o risco de replay do early data.",
  shell: "bash",
  goals: [
    { text: "Contar os RTTs do handshake TLS 1.2", step: 3 },
    { text: "Ver por que o TLS 1.3 precisa de apenas 1 RTT", step: 4 },
    { text: "Entender o 0-RTT e o risco de replay", step: 8 },
    { text: "Comparar as versões e saber o que o servidor aceita", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Sobre o TCP",
      title: "O TLS roda por cima de uma conexão TCP",
      body: [
        "Antes do TLS, o handshake TCP já gastou **1 RTT**. O TLS acrescenta o que o TCP não dá: **confidencialidade** (criptografia), **integridade** (ninguém altera) e **autenticação** (o servidor prova quem é, com um certificado).",
        "Para isso, cliente e servidor precisam combinar versão, algoritmos e uma chave secreta, tudo antes do primeiro byte de HTTP. O número de idas e voltas dessa conversa muda muito entre as versões.",
      ],
      changes: ["handshake TCP: 1 RTT"],
      metrics: m18("–", "–", { id: "tcp", label: "Já pago", value: "1 RTT (TCP)" }),
      stage: seq18(TCP3, { brackets: [TCP_BR] }),
    },
    {
      kind: "conceito",
      nav: "TLS 1.2: ida 1",
      title: "TLS 1.2, primeira ida e volta",
      body: [
        "O cliente envia o **ClientHello**: versões aceitas, lista de suítes de cifras e um número aleatório. O servidor responde com tudo de uma vez: **ServerHello** (a suíte escolhida), o **Certificate**, o **ServerKeyExchange** (sua parte da troca de chaves) e o **ServerHelloDone**.",
        "Ainda nada foi criptografado e o cliente só agora conhece o servidor. Primeiro RTT do TLS gasto.",
      ],
      changes: ["+ ClientHello", "+ ServerHello, Certificate e KeyExchange"],
      metrics: m18("–", "TLS 1.2", { id: "tls", label: "TLS até aqui", value: "1 RTT" }),
      stage: seq18([...TCP3, T12[0], T12[1]], { brackets: [TCP_BR, { fromAt: 3, toAt: 4, label: "TLS: 1 RTT" }] }),
    },
    {
      kind: "conceito",
      nav: "TLS 1.2: ida 2",
      title: "TLS 1.2, segunda ida e volta",
      body: [
        "O cliente verifica o certificado, calcula a chave e envia o **ClientKeyExchange**, o **ChangeCipherSpec** (a partir daqui, tudo criptografado) e o **Finished**. O servidor responde com o seu `ChangeCipherSpec` e `Finished`. Só então o `GET` pode sair.",
        "São **2 RTTs de TLS** após o TCP: a resposta HTTP chega no **quarto RTT**. Com 120 ms de RTT, são 480 ms antes de o primeiro byte útil voltar.",
      ],
      callout: { kind: "atencao", text: "TLS 1.2 conexão nova: 1 (TCP) + 2 (TLS) + 1 (HTTP) = 4 RTTs. Por isso reaproveitar conexões compensa tanto." },
      changes: ["+ ClientKeyExchange e Finished", "+ GET criptografado e resposta"],
      metrics: m18("4", "TLS 1.2", { id: "ms", label: "Com RTT de 120 ms", value: "≈ 480 ms", tone: "bad" }),
      terminal: { suggest: [CURL12], outputs: { [CURL12]: CURL12_OUT } },
      stage: seq18([...TCP3, ...T12], { brackets: [TCP_BR, { fromAt: 3, toAt: 4, label: "TLS: RTT 1" }, { fromAt: 5, toAt: 6, label: "TLS: RTT 2" }, { fromAt: 7, toAt: 8, label: "HTTP: 1 RTT" }] }),
    },
    {
      kind: "solucao",
      nav: "TLS 1.3: 1 RTT",
      title: "TLS 1.3: o cliente já manda a sua chave",
      body: [
        "O TLS 1.3 corta uma ida e volta com uma aposta: o cliente **adivinha** o grupo de troca de chaves (x25519, quase universal) e já manda a sua **key_share** no `ClientHello`. O servidor responde com a dele e **o resto do handshake já criptografado**: certificado, assinatura e `Finished`.",
        "O cliente conclui, envia o seu `Finished` **junto com o primeiro `GET`** e a resposta chega no **terceiro RTT** (1 TCP + 1 TLS + 1 HTTP). O certificado já não trafega em claro.",
      ],
      callout: { kind: "chave", text: "TLS 1.3: o handshake cabe em 1 RTT. Conexão nova: 3 RTTs até a resposta, contra 4 no TLS 1.2." },
      changes: ["handshake em 1 RTT", "certificado criptografado", "GET junto com o Finished"],
      metrics: m18("3", "TLS 1.3", { id: "ms", label: "Com RTT de 120 ms", value: "≈ 360 ms", tone: "ok" }),
      terminal: { suggest: [OPENSSL], outputs: { [OPENSSL]: OPENSSL_OUT } },
      stage: seq18([...TCP3, ...T13], { brackets: [TCP_BR, { fromAt: 3, toAt: 4, label: "TLS: 1 RTT" }, { fromAt: 5, toAt: 6, label: "HTTP: 1 RTT" }] }),
    },
    {
      kind: "conceito",
      nav: "Chaves efêmeras",
      title: "De onde vem a chave: ECDHE",
      body: [
        "Cada lado gera um **par de chaves efêmero** (ECDHE) só para esta conexão e envia a parte pública. Combinando a sua chave privada com a pública do outro, os dois chegam ao **mesmo segredo**, que nunca trafega. Dele derivam as chaves de tráfego (HKDF).",
        "O certificado só **assina** o handshake, para provar quem é o servidor. Como as chaves efêmeras são descartadas depois, roubar a chave privada do certificado no futuro **não decifra o tráfego antigo**: é o *forward secrecy*, obrigatório no TLS 1.3.",
      ],
      changes: ["chaves efêmeras de cada lado", "forward secrecy"],
      metrics: m18("3", "TLS 1.3", { id: "fs", label: "Forward secrecy", value: "sim", tone: "ok" }),
      stage: seq18([...TCP3, ...T13], {
        brackets: [TCP_BR],
        notes: [note("cli", 7, "gera par efêmero; ECDH(privada dele, pública do servidor)", "info"), note("srv", 8, "mesmo segredo → chaves de tráfego; chaves efêmeras descartadas", "ok")],
      }),
    },
    {
      kind: "conceito",
      nav: "Retomada",
      title: "Retomada com ticket: sem certificado",
      body: [
        "Ao fim de um handshake, o servidor envia um **ticket de sessão** (`NewSessionTicket`). Numa nova conexão, o cliente o apresenta no `ClientHello` (*pre-shared key*), junto com uma `key_share` nova (para manter o forward secrecy).",
        "O servidor aceita e **dispensa o certificado e a assinatura**: o handshake continua em 1 RTT, mas é mais barato (menos bytes e menos CPU). É o que o navegador faz ao voltar a um site conhecido.",
      ],
      changes: ["ClientHello com ticket (PSK)", "sem Certificate nem assinatura"],
      metrics: m18("3", "TLS 1.3 (retomada)", { id: "cpu", label: "Custo de CPU", value: "menor", tone: "ok" }),
      stage: seq18(
        [
          ...TCP3,
          msg("r1", "cli", "srv", 3, "ClientHello · ticket (PSK) · key_share", { tone: "ctrl" }),
          msg("r2", "srv", "cli", 4, "ServerHello · {Finished}   (sem certificado)", { tone: "ctrl" }),
          msg("r3", "cli", "srv", 5, "{Finished} · GET /pedidos", { tone: "data" }),
          msg("r4", "srv", "cli", 6, "200 OK", { tone: "ok" }),
        ],
        { brackets: [TCP_BR, { fromAt: 3, toAt: 4, label: "TLS: 1 RTT" }] },
      ),
    },
    {
      kind: "conceito",
      nav: "0-RTT",
      title: "0-RTT: a requisição vai no primeiro voo",
      body: [
        "Com um ticket que permite **early data**, o cliente envia a requisição **dentro do primeiro voo**, criptografada com uma chave derivada do ticket. O servidor processa e responde sem esperar o fim do handshake.",
        "Economiza mais um RTT: **2 RTTs** até a resposta (1 TCP + 1 de requisição e resposta). Em QUIC, onde não há o handshake TCP, o 0-RTT significa uma resposta em 1 RTT.",
      ],
      changes: ["GET dentro do ClientHello (early data)", "resposta em 2 RTTs"],
      metrics: m18("2", "TLS 1.3 (0-RTT)", { id: "ms", label: "Com RTT de 120 ms", value: "≈ 240 ms", tone: "ok" }),
      stage: seq18(
        [...TCP3, msg("z1", "cli", "srv", 3, "ClientHello · ticket · early_data: GET /catalogo", { tone: "data" }), msg("z2", "srv", "cli", 4, "ServerHello · {Finished} · 200 OK", { tone: "ok" })],
        { brackets: [TCP_BR, { fromAt: 3, toAt: 4, label: "1 RTT" }] },
      ),
    },
    {
      kind: "problema",
      nav: "Replay",
      title: "O risco do 0-RTT: replay",
      body: [
        "Os dados do 0-RTT **não têm proteção contra repetição**: um atacante que captura o primeiro voo pode **reenviá-lo** ao servidor (ou a outro servidor do mesmo cluster), e a requisição é processada duas vezes. Não há handshake novo para provar frescor.",
        "Por isso, só se deve usar 0-RTT com requisições **idempotentes** (`GET` de leitura). Servidores e CDNs podem rejeitar early data em endpoints sensíveis (HTTP 425 *Too Early*, RFC 8470), e o cliente refaz após o handshake.",
      ],
      callout: { kind: "atencao", text: "Nunca aceite POST de pagamento ou criação de pedido em early data. Se o servidor aceitar 0-RTT, a API precisa ser idempotente." },
      changes: ["+ atacante repete o primeiro voo", "a requisição pode rodar 2 vezes"],
      metrics: m18("2", "TLS 1.3 (0-RTT)", { id: "risk", label: "Replay", value: "possível", tone: "bad" }),
      stage: {
        mode: "sequence",
        lanes: LANES18R,
        messages: [
          msg("y1", "cli", "srv", 0, "early_data: POST /pagar R$ 100", { tone: "data" }),
          msg("y2", "atk", "srv", 2, "mesmo voo, repetido (replay)", { tone: "bad" }),
        ],
        notes: [note("srv", 3, "processa duas vezes: cobra em dobro", "bad"), note("atk", 1, "captura o pacote na rede", "warn")],
        laneState: { srv: state("sem prova de frescor", "bad") },
      },
    },
    {
      kind: "tradeoff",
      nav: "Comparação",
      title: "Qual versão usar",
      body: [
        "Use **TLS 1.3** em tudo o que for possível: 1 RTT, certificado criptografado, só suítes modernas. Mantenha o **TLS 1.2** como piso para clientes antigos, com suítes de forward secrecy. Versões anteriores (1.0 e 1.1) estão obsoletas e não devem estar habilitadas.",
        "O **0-RTT** vale onde a latência é crítica e as requisições são idempotentes. Em APIs com efeito colateral, deixe-o desligado. Reaproveitar a conexão continua o ganho maior: 1 RTT só para a requisição.",
      ],
      changes: ["comparação dos cenários"],
      metrics: m18("2 a 4", "1.2 / 1.3", { id: "best", label: "Melhor ganho", value: "reusar conexão", tone: "ok" }),
      terminal: { suggest: [OPENSSL], outputs: { [OPENSSL]: OPENSSL_OUT } },
      extra: [versionGrid],
      stage: seq18([...TCP3, ...T13], { brackets: [TCP_BR] }),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Menos idas e voltas, mais cuidado com o replay",
      body: [
        "**TLS 1.2**: 2 RTTs de handshake (4 até a resposta). **TLS 1.3**: 1 RTT (3 até a resposta), certificado criptografado e forward secrecy obrigatório. **0-RTT**: 2 RTTs até a resposta, ao risco de replay: só para requisições idempotentes.",
        "A retomada por ticket dispensa o certificado. O maior ganho de todos ainda é **não repetir o handshake**: reutilize conexões.",
      ],
      changes: ["TLS 1.2, 1.3 e 0-RTT"],
      metrics: m18("4 / 3 / 2", "1.2 / 1.3 / 0-RTT"),
      extra: [versionGrid],
      stage: seq18([...TCP3, ...T13], { laneState: { cli: state("TLS 1.3", "ok"), srv: state("TLS 1.3", "ok") }, brackets: [TCP_BR] }),
    },
  ],
};

// =====================================================================================
// Cena 19: HTTPS, certificados, cadeia de confiança e SNI (iso)
// =====================================================================================

const P19 = (i: number) => rowXY(i, 3.6);
const S1: [number, number] = [4.4, -11.6];
const S2: [number, number] = [8, -8];
const S3: [number, number] = [11.6, -4.4];

type H19 = { srv?: Status; srvBadge?: string; s1?: Status; s2?: Status; s3?: Status; obs?: boolean };

function hospedagem(o: H19 = {}): IsoEntity[] {
  return [
    users("cli", ...P19(0), 3, "navegadores"),
    box("srv", ...P19(1), "server", "203.0.113.10", { size: "md", tone: "arcane", status: o.srv, badges: o.srvBadge ? [{ text: o.srvBadge, tone: "warn" }] : undefined }),
    box("s1", ...S1, "globe", "loja.com.br", { size: "sm", tone: "mana", status: o.s1 }),
    box("s2", ...S2, "globe", "blog.exemplo.org", { size: "sm", tone: "ember", status: o.s2 }),
    box("s3", ...S3, "globe", "api.exemplo.net", { size: "sm", tone: "sky", status: o.s3 }),
    ...(o.obs ? [box("obs", 4.4, 2.8, "eye", "quem observa a rede", { size: "sm", tone: "rose", status: "warn" })] : []),
  ];
}
const HOST_LINKS = [link("cli", "srv"), link("srv", "s1"), link("srv", "s2"), link("srv", "s3")];

type C19 = { raiz?: Status; inter?: Status; interLabel?: string; folha?: Status; folhaBadge?: string; ts?: boolean };

function cadeia(o: C19 = {}): IsoEntity[] {
  return [
    users("cli", ...P19(0), 3, "navegadores"),
    box("srv", ...P19(1), "server", "loja.com.br:443", { size: "md", tone: "arcane" }),
    box("raiz", ...S1, "shield", "CA raiz", { size: "sm", tone: "ember", status: o.raiz }),
    box("inter", ...S2, "key", o.interLabel ?? "CA intermediária", { size: "sm", tone: "sky", status: o.inter }),
    box("folha", ...S3, "lock", "folha loja.com.br", { size: "sm", tone: "mana", status: o.folha, badges: o.folhaBadge ? [{ text: o.folhaBadge, tone: "warn" }] : undefined }),
    ...(o.ts ? [box("ts", 2.0, -8.0, "database", "truststore", { size: "sm", tone: "violet", status: "hi" })] : []),
  ];
}
const CHAIN_LINKS = [link("raiz", "inter"), link("inter", "folha"), link("cli", "srv")];

const m19 = (a: string, b: string, c?: Metric): Metric[] => [{ id: "a", label: "IPs", value: a }, { id: "b", label: "Certificados", value: b }, ...(c ? [c] : [])];

const SNI_OK = "openssl s_client -connect 203.0.113.10:443 -servername loja.com.br";
const SNI_NO = "openssl s_client -connect 203.0.113.10:443";
const SNI_OK_OUT = ["CONNECTED(00000003)", "---", "Certificate chain", " 0 s:CN = loja.com.br", "   i:O = CA de Exemplo, CN = CA de Exemplo Intermediaria R1", "---", "New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384"].join("\n");
const SNI_NO_OUT = ["CONNECTED(00000003)", "---", "Certificate chain", " 0 s:CN = padrao.exemplo.net", "   i:O = CA de Exemplo, CN = CA de Exemplo Intermediaria R1", "---", "New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384"].join("\n");
const X509 = "openssl x509 -in folha.pem -noout -subject -issuer -dates -ext subjectAltName";
const X509_OUT = [
  "subject=CN = loja.com.br",
  "issuer=O = CA de Exemplo, CN = CA de Exemplo Intermediaria R1",
  "notBefore=Oct 29 12:00:00 2026 GMT",
  "notAfter=Jan 27 12:00:00 2027 GMT",
  "X509v3 Subject Alternative Name:",
  "    DNS:loja.com.br, DNS:www.loja.com.br",
].join("\n");
const NO_INTER = "openssl s_client -connect loja.com.br:443 -servername loja.com.br";
const NO_INTER_OUT = [
  "CONNECTED(00000003)",
  "depth=0 CN = loja.com.br",
  "verify error:num=20:unable to get local issuer certificate",
  "---",
  "Certificate chain",
  " 0 s:CN = loja.com.br",
  "   i:O = CA de Exemplo, CN = CA de Exemplo Intermediaria R1",
  "---",
  "Verification error: unable to get local issuer certificate",
].join("\n");
const ENDDATE = "openssl s_client -connect loja.com.br:443 -servername loja.com.br | openssl x509 -noout -enddate";
const KEYTOOL = "keytool -list -cacerts";
const KEYTOOL_OUT = ["Keystore type: PKCS12", "Keystore provider: SUN", "", "Your keystore contains 146 entries"].join("\n");

export const httpsECertificados: SceneDef = {
  title: "HTTPS: certificados, cadeia de confiança e SNI",
  summary: "Veja um IP servir três domínios graças ao SNI, a cadeia raiz, intermediária e folha, e o que dá errado quando um elo falta.",
  shell: "bash",
  goals: [
    { text: "Entender por que o servidor precisa do SNI para escolher o certificado", step: 3 },
    { text: "Saber o que o SNI revela e o que é o ECH", step: 4 },
    { text: "Ler a cadeia raiz, intermediária e folha", step: 5 },
    { text: "Diagnosticar intermediária ausente e certificado expirando", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um IP, 3 sites",
      title: "Um endereço IP serve vários domínios",
      body: [
        "Um mesmo servidor, `203.0.113.10`, hospeda `loja.com.br`, `blog.exemplo.org` e `api.exemplo.net`. Com HTTP puro, a escolha é fácil: o cabeçalho `Host` diz qual site o cliente quer.",
        "Cada domínio tem o seu **certificado**: o documento que prova ao navegador que aquela chave pública pertence ao domínio. A questão é qual deles apresentar.",
      ],
      metrics: m19("1", "3"),
      terminal: { suggest: ["dig +short loja.com.br", "dig +short blog.exemplo.org"], outputs: { "dig +short loja.com.br": "203.0.113.10", "dig +short blog.exemplo.org": "203.0.113.10" } },
      focus: ["cli", "srv", "s1", "s2", "s3"],
      stage: { mode: "iso", entities: hospedagem(), links: HOST_LINKS, flows: [flow("cli", "srv", 1)] },
    },
    {
      kind: "problema",
      nav: "Qual certificado?",
      title: "O Host só chega depois do TLS",
      body: [
        "Com HTTPS, o handshake TLS acontece **antes** de qualquer byte de HTTP. O cabeçalho `Host` só viaja depois, já criptografado. No momento de apresentar o certificado, o servidor só sabe **o IP e a porta**.",
        "No passado, isso obrigava a ter **um IP por site com HTTPS**, o que gastava endereços IPv4 e encarecia a hospedagem. Faltava um jeito de o cliente dizer o nome *antes* do certificado.",
      ],
      changes: ["o servidor não sabe qual domínio foi pedido"],
      metrics: m19("1", "3 candidatos", { id: "pb", label: "Escolha", value: "sem informação", tone: "warn" }),
      focus: ["cli", "srv"],
      stage: { mode: "iso", entities: hospedagem({ srv: "warn", srvBadge: "qual certificado?", s1: "muted", s2: "muted", s3: "muted" }), links: HOST_LINKS, flows: [flow("cli", "srv", 1, { kind: "heavy" })] },
    },
    {
      kind: "solucao",
      nav: "SNI",
      title: "SNI: o nome vai dentro do ClientHello",
      body: [
        "A extensão **SNI** (*Server Name Indication*) coloca o nome do domínio no `ClientHello`, a primeira mensagem do TLS. O servidor lê `loja.com.br`, escolhe o certificado certo e segue o handshake.",
        "Sem o SNI, o servidor devolve o certificado **padrão**, e o cliente reclama de nome diferente. Um cliente que conecta por IP, sem `SNIHostName`, cai nesse caso.",
      ],
      callout: { kind: "chave", text: "Com o SNI, um único IP e uma única porta servem quantos domínios HTTPS forem necessários." },
      changes: ["+ SNI: loja.com.br", "certificado de loja.com.br escolhido"],
      metrics: m19("1", "1 escolhido", { id: "sni", label: "SNI", value: "loja.com.br", tone: "ok" }),
      terminal: { suggest: [SNI_OK, SNI_NO], outputs: { [SNI_OK]: SNI_OK_OUT, [SNI_NO]: SNI_NO_OUT } },
      focus: ["cli", "srv", "s1"],
      stage: { mode: "iso", entities: hospedagem({ srv: "ok", s1: "hi", s2: "muted", s3: "muted" }), links: HOST_LINKS, flows: [flow("cli", "srv", 2, { label: "SNI: loja.com.br" }), flow("srv", "s1", 1, { kind: "data" })] },
    },
    {
      kind: "tradeoff",
      nav: "SNI em claro",
      title: "O preço: o nome viaja em claro",
      body: [
        "O SNI vai no `ClientHello`, **antes** de existir qualquer chave. Quem observa a rede (um provedor, um Wi-Fi público, um firewall corporativo) lê **qual domínio** você acessa, embora não veja o caminho, os cabeçalhos ou o conteúdo.",
        "Muitos firewalls e *proxies* de filtragem usam justamente o SNI para bloquear sites. A evolução é o **ECH** (*Encrypted Client Hello*), que cifra o `ClientHello` com uma chave publicada no DNS, mas depende de suporte em clientes, CDNs e servidores.",
      ],
      callout: { kind: "atencao", text: "TLS esconde o conteúdo, e não o domínio: o SNI (e o DNS comum) revelam para onde você vai." },
      changes: ["+ observador lê o SNI"],
      metrics: m19("1", "–", { id: "sni", label: "SNI visível", value: "sim", tone: "warn" }),
      focus: ["cli", "obs", "srv"],
      stage: { mode: "iso", entities: hospedagem({ srv: "ok", s1: "hi", s2: "muted", s3: "muted", obs: true }), links: [...HOST_LINKS, link("cli", "obs", { style: "dashed" })], flows: [flow("cli", "srv", 2, { label: "SNI visível" })] },
    },
    {
      kind: "conceito",
      nav: "Cadeia",
      title: "A cadeia de confiança: raiz, intermediária e folha",
      body: [
        "O certificado do site (a **folha**) é assinado por uma **CA intermediária**, que por sua vez é assinada por uma **CA raiz**. As raízes ficam no **truststore** do cliente (o sistema, o navegador, o `cacerts` da JVM); a confiança vem delas.",
        "O servidor envia a **folha e as intermediárias**; a raiz **não** precisa ser enviada. O cliente monta o caminho folha → intermediária → raiz e confere cada assinatura. Raízes ficam offline e as intermediárias assinam o dia a dia, o que limita o estrago de um vazamento.",
      ],
      changes: ["+ CA raiz, CA intermediária e folha", "raiz no truststore do cliente"],
      metrics: m19("1", "2 enviados", { id: "root", label: "Raiz", value: "no truststore", tone: "ok" }),
      focus: ["raiz", "inter", "folha", "ts"],
      stage: { mode: "iso", entities: cadeia({ raiz: "ok", ts: true }), links: [...CHAIN_LINKS, link("ts", "raiz", { style: "dashed" })], flows: [flow("srv", "cli", 2, { kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "O que se valida",
      title: "O que o cliente confere",
      body: [
        "O cliente verifica, em ordem: (1) **a assinatura** de cada elo até uma raiz confiável; (2) a **validade** (`notBefore` e `notAfter`) de todos; (3) o **nome**: o domínio acessado precisa constar no `Subject Alternative Name` (SAN) da folha; (4) a **revogação**, por OCSP ou CRL, quando aplicável.",
        "O campo `CN` do subject é ignorado para o nome nos clientes modernos: **vale o SAN**. Um certificado `*.exemplo.org` cobre `blog.exemplo.org`, mas não `exemplo.org` nem `a.b.exemplo.org`.",
      ],
      changes: ["assinatura, validade, SAN e revogação"],
      metrics: m19("1", "2", { id: "ok", label: "Validação", value: "ok", tone: "ok" }),
      terminal: { suggest: [X509], outputs: { [X509]: X509_OUT } },
      focus: ["folha", "inter", "raiz"],
      stage: { mode: "iso", entities: cadeia({ raiz: "ok", inter: "ok", folha: "hi" }), links: CHAIN_LINKS, flows: [flow("srv", "cli", 1, { kind: "data" })] },
    },
    {
      kind: "problema",
      nav: "Falta a interm.",
      title: "O erro clássico: a intermediária não foi enviada",
      body: [
        "O servidor foi configurado só com o certificado **folha**. Navegadores muitas vezes funcionam (guardam intermediárias em cache ou as baixam pelo campo AIA do certificado), mas **Java, curl e outros clientes falham**: `PKIX path building failed` ou `unable to get local issuer certificate`.",
        "A cadeia está quebrada no meio: o cliente tem a raiz e a folha, mas não o elo entre elas. A correção é servir o **bundle completo** (folha + intermediárias), e não depende do cliente.",
      ],
      callout: { kind: "atencao", text: "Testar só no navegador esconde o problema. Valide com openssl s_client e com o seu cliente Java." },
      changes: ["intermediária ausente", "validação falha fora do navegador"],
      metrics: m19("1", "1 (só a folha)", { id: "err", label: "Erro", value: "issuer não encontrado", tone: "bad" }),
      terminal: { suggest: [NO_INTER], outputs: { [NO_INTER]: NO_INTER_OUT } },
      focus: ["inter", "folha", "cli"],
      stage: { mode: "iso", entities: cadeia({ raiz: "ok", inter: "bad", interLabel: "intermediária ausente", folha: "warn", ts: true }), links: [link("raiz", "inter", { style: "dashed" }), link("inter", "folha", { style: "dashed" }), link("cli", "srv"), link("ts", "raiz", { style: "dashed" })], flows: [flow("srv", "cli", 2, { kind: "bad" })] },
    },
    {
      kind: "problema",
      nav: "Expirando",
      title: "O certificado que vence no feriado",
      body: [
        "Certificados têm validade, e a data costuma ser esquecida até o dia em que o site cai: todos os clientes recusam a conexão **ao mesmo tempo**, num horário que ninguém escolheu. Aqui, a folha vence em 3 dias.",
        "A defesa é **automatizar** a renovação (ACME, como no Let's Encrypt, com certificados de 90 dias) e **monitorar** a data (`openssl ... -enddate`, alertas com antecedência). A validade máxima dos certificados públicos vem diminuindo, o que torna a renovação manual cada vez menos viável.",
      ],
      changes: ["folha expira em 3 dias"],
      metrics: m19("1", "2", { id: "exp", label: "Validade restante", value: "3 dias", tone: "bad" }),
      terminal: { suggest: [ENDDATE], outputs: { [ENDDATE]: "notAfter=Nov 30 12:00:00 2026 GMT" } },
      focus: ["folha"],
      stage: { mode: "iso", entities: cadeia({ raiz: "ok", inter: "ok", folha: "warn", folhaBadge: "vence em 3 dias" }), links: CHAIN_LINKS, flows: [flow("srv", "cli", 1, { kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Java e truststore",
      title: "Na JVM: o truststore decide em quem confiar",
      body: [
        "A JVM confia nas raízes do arquivo `cacerts` (em `$JAVA_HOME/lib/security`). Para uma CA interna, **importe a raiz** com `keytool -importcert` ou aponte um truststore próprio com `-Djavax.net.ssl.trustStore=...`. Para autenticação mútua (mTLS), o cliente também apresenta o seu certificado a partir de um *keystore*.",
        "O atalho perigoso é um `TrustManager` que aceita tudo, ou um `HostnameVerifier` que sempre devolve `true`: o HTTPS continua criptografado, mas **sem autenticação**: qualquer um pode se passar pelo servidor.",
      ],
      callout: { kind: "atencao", text: "Nunca desligue a verificação de certificado em produção para fazer um erro 'sumir'. Corrija a cadeia ou o truststore." },
      changes: ["+ truststore da JVM (cacerts)"],
      metrics: m19("1", "2", { id: "ts", label: "Truststore", value: "cacerts", tone: "ok" }),
      terminal: { suggest: [KEYTOOL], outputs: { [KEYTOOL]: KEYTOOL_OUT } },
      focus: ["cli", "ts", "raiz"],
      stage: { mode: "iso", entities: cadeia({ raiz: "ok", inter: "ok", folha: "ok", ts: true }), links: [...CHAIN_LINKS, link("ts", "raiz", { style: "dashed" })], flows: [flow("srv", "cli", 1, { kind: "data" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Nome certo, cadeia completa, validade em dia",
      body: [
        "O **SNI** permite que um IP sirva vários domínios HTTPS: o nome vai em claro no `ClientHello` (o ECH é a evolução). A **cadeia** é folha, intermediária e raiz: o servidor envia as duas primeiras, e o cliente já tem a raiz.",
        "O cliente valida assinatura, validade, SAN e revogação. Falhas típicas: **intermediária ausente**, **certificado expirado** e **truststore** sem a CA. Automatize a renovação e nunca desligue a verificação.",
      ],
      changes: ["SNI, cadeia, validação e truststore"],
      metrics: m19("1", "cadeia completa"),
      focus: ["cli", "srv", "folha"],
      stage: { mode: "iso", entities: cadeia({ raiz: "ok", inter: "ok", folha: "ok" }), links: CHAIN_LINKS, flows: [flow("srv", "cli", 1, { kind: "data" })] },
    },
  ],
};

// =====================================================================================
// Cena 20: HTTP/1.1, HTTP/2 e HTTP/3 (sequência)
// =====================================================================================

const LANES20: SeqLane[] = [
  { id: "cli", label: "Navegador", icon: "globe", tone: "mana" },
  { id: "srv", label: "Servidor", icon: "server", tone: "arcane" },
];
const LANES20C: SeqLane[] = [
  { id: "c1", label: "Conexão TCP 1", icon: "network", tone: "mana" },
  { id: "c2", label: "Conexão TCP 2", icon: "network", tone: "sky" },
  { id: "c3", label: "Conexão TCP 3", icon: "network", tone: "violet" },
  { id: "srv", label: "Servidor", icon: "server", tone: "arcane" },
];
const LANES20B: SeqLane[] = [
  { id: "cli", label: "Cliente (h2)", icon: "globe", tone: "mana" },
  { id: "lb", label: "Balanceador L4", icon: "scale", tone: "ember" },
  { id: "a", label: "Servidor A", icon: "server", tone: "arcane" },
  { id: "b", label: "Servidor B", icon: "server", tone: "sky" },
];
const seq20 = (messages: SeqMessage[], extra: Partial<Seq> = {}, lanes: SeqLane[] = LANES20): Seq => ({ mode: "sequence", lanes, messages, ...extra });
const m20 = (conexoes: string, handshakes: string, c?: Metric): Metric[] => [{ id: "c", label: "Conexões", value: conexoes }, { id: "h", label: "Handshakes", value: handshakes }, ...(c ? [c] : [])];

const CURL_H2 = "curl -sv --http2 https://loja.com.br/ -o /dev/null";
const CURL_H2_OUT = [
  "* ALPN: curl offers h2,http/1.1",
  "* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384",
  "* ALPN: server accepted h2",
  "* using HTTP/2",
  "> GET / HTTP/2",
  "> Host: loja.com.br",
  "< HTTP/2 200",
  "< content-type: text/html; charset=utf-8",
  "< alt-svc: h3=\":443\"; ma=86400",
].join("\n");
const ALTSVC = "curl -sI https://loja.com.br/ | grep -i alt-svc";
const SS_H2 = "ss -tn dst 203.0.113.10";
const SS_H2_OUT = ["State  Recv-Q  Send-Q   Local Address:Port    Peer Address:Port", "ESTAB  0       0         198.51.100.7:51514   203.0.113.10:443"].join("\n");

const H2_REQ = [
  msg("q1", "cli", "srv", 0, "HEADERS [stream 1] GET /app.css", { tone: "data" }),
  msg("q3", "cli", "srv", 1, "HEADERS [stream 3] GET /app.js", { tone: "data" }),
  msg("q5", "cli", "srv", 2, "HEADERS [stream 5] GET /logo.png", { tone: "data" }),
];

export const http123: SceneDef = {
  title: "HTTP/1.1, HTTP/2 e HTTP/3: multiplexação e head-of-line blocking",
  summary: "Compare seis conexões, streams numa conexão TCP e streams independentes sobre QUIC, e veja onde a perda de um pacote trava os demais.",
  shell: "bash",
  goals: [
    { text: "Entender por que o HTTP/1.1 abre várias conexões", step: 3 },
    { text: "Ver o multiplexing de streams numa só conexão do HTTP/2", step: 5 },
    { text: "Ver o head-of-line blocking do TCP travar todos os streams", step: 6 },
    { text: "Saber como o HTTP/3 sobre QUIC o evita", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Uma página",
      title: "Uma página, vários recursos",
      body: [
        "O navegador pede `/index.html` e descobre que a página precisa de mais recursos: `app.css`, `app.js` e `logo.png` (e, numa página real, dezenas). Cada um é uma requisição HTTP, e a pergunta é **por onde elas trafegam**.",
        "A resposta mudou três vezes: HTTP/1.1 (texto, uma resposta por vez por conexão), HTTP/2 (binário, vários streams numa conexão TCP) e HTTP/3 (streams sobre QUIC, em UDP).",
      ],
      changes: ["+ GET /index.html e a lista de recursos"],
      metrics: m20("1", "1"),
      stage: seq20([msg("a1", "cli", "srv", 0, "GET /index.html", { tone: "data" }), msg("a2", "srv", "cli", 1, "200 · HTML (3 recursos referenciados)", { tone: "ok" })]),
    },
    {
      kind: "problema",
      nav: "HTTP/1.1: serial",
      title: "HTTP/1.1: uma resposta por vez, em ordem",
      body: [
        "Numa conexão HTTP/1.1, o cliente só envia a requisição seguinte **depois** da resposta anterior (o *pipelining* existe, mas foi abandonado na prática por problemas com intermediários). Os três recursos viram uma fila: `app.css`, depois `app.js`, depois `logo.png`.",
        "Cada resposta custa pelo menos 1 RTT. Com muitos recursos e RTT alto, a página demora só pela fila.",
      ],
      changes: ["+ três requisições em série"],
      metrics: m20("1", "1", { id: "rtt", label: "Tempo dos 3 recursos", value: "3 RTTs", tone: "bad" }),
      stage: seq20(
        [
          msg("b1", "cli", "srv", 0, "GET /app.css", { tone: "data" }),
          msg("b2", "srv", "cli", 1, "200 · CSS", { tone: "ok" }),
          msg("b3", "cli", "srv", 2, "GET /app.js", { tone: "data" }),
          msg("b4", "srv", "cli", 3, "200 · JS", { tone: "ok" }),
          msg("b5", "cli", "srv", 4, "GET /logo.png", { tone: "data" }),
          msg("b6", "srv", "cli", 5, "200 · PNG", { tone: "ok" }),
        ],
        { brackets: [{ fromAt: 0, toAt: 1, label: "RTT 1" }, { fromAt: 2, toAt: 3, label: "RTT 2" }, { fromAt: 4, toAt: 5, label: "RTT 3" }] },
      ),
    },
    {
      kind: "solucao",
      nav: "6 conexões",
      title: "A saída do HTTP/1.1: várias conexões",
      body: [
        "Os navegadores abrem **até 6 conexões TCP por host** e distribuem as requisições: os três recursos viajam em paralelo, e o tempo cai para 1 RTT.",
        "O custo: **cada conexão paga seu próprio handshake TCP e TLS**, e recomeça o slow start (aula 14). Seis conexões são seis cwnds pequenas e seis vezes a memória do servidor. Para um backend, 1.000 usuários viram 6.000 conexões.",
      ],
      changes: ["3 conexões em paralelo", "3 handshakes"],
      metrics: m20("6 por host", "6", { id: "rtt", label: "Tempo dos 3 recursos", value: "1 RTT", tone: "ok" }),
      stage: {
        mode: "sequence",
        lanes: LANES20C,
        messages: [msg("p1", "c1", "srv", 0, "GET /app.css", { tone: "data" }), msg("p2", "c2", "srv", 0, "GET /app.js", { tone: "data" }), msg("p3", "c3", "srv", 0, "GET /logo.png", { tone: "data" }), msg("p4", "srv", "c1", 1, "200", { tone: "ok" }), msg("p5", "srv", "c2", 1, "200", { tone: "ok" }), msg("p6", "srv", "c3", 1, "200", { tone: "ok" })],
        notes: [note("srv", 2, "cada conexão: TCP + TLS + slow start", "warn")],
      },
    },
    {
      kind: "problema",
      nav: "HOL no HTTP/1.1",
      title: "Mesmo assim, o grande trava o pequeno",
      body: [
        "Numa mesma conexão HTTP/1.1, uma resposta grande atrasa **todas as seguintes**: o ícone de 1 KB espera o `video-thumb.jpg` de 2 MB terminar. É o **head-of-line blocking** na camada de aplicação.",
        "Com 6 conexões, um recurso lento ocupa 1/6 da capacidade, e os outros seguem. Mas o limite de 6 já nasce pequeno para páginas com 80 recursos.",
      ],
      changes: ["+ resposta grande na frente", "o ícone espera"],
      metrics: m20("1", "1", { id: "hol", label: "Ícone de 1 KB", value: "espera o de 2 MB", tone: "bad" }),
      stage: seq20(
        [msg("h1", "cli", "srv", 0, "GET /video-thumb.jpg", { tone: "data" }), msg("h2", "cli", "srv", 1, "GET /icone.png (1 KB)", { tone: "data" }), msg("h3", "srv", "cli", 2, "200 · JPG de 2 MB", { span: 4, tone: "data" }), msg("h4", "srv", "cli", 7, "200 · ícone", { tone: "ok" })],
        { notes: [note("srv", 4, "o ícone só sai depois da resposta anterior", "bad")] },
      ),
    },
    {
      kind: "solucao",
      nav: "HTTP/2: streams",
      title: "HTTP/2: vários streams em uma conexão",
      body: [
        "O HTTP/2 divide a conexão em **streams** independentes, identificados por número (1, 3, 5 para os iniciados pelo cliente). Requisições e respostas viram **frames binários** (`HEADERS`, `DATA`) que se **intercalam** na mesma conexão TCP: o ícone passa na frente do vídeo.",
        "Uma conexão só, um handshake só, uma cwnd só. Os cabeçalhos são comprimidos (**HPACK**), o que importa muito quando cada requisição repete o mesmo `Host`, `User-Agent` e cookies.",
      ],
      callout: { kind: "chave", text: "HTTP/2: 1 conexão TCP, N streams intercalados. O limite de 6 conexões deixa de existir." },
      changes: ["1 conexão, 3 streams", "frames intercalados"],
      metrics: m20("1", "1", { id: "str", label: "Streams concorrentes", value: 3, tone: "ok" }),
      terminal: { suggest: [CURL_H2, SS_H2], outputs: { [CURL_H2]: CURL_H2_OUT, [SS_H2]: SS_H2_OUT } },
      stage: seq20([...H2_REQ, msg("d3", "srv", "cli", 3, "DATA [stream 3] app.js", { tone: "data" }), msg("d5", "srv", "cli", 4, "DATA [stream 5] logo.png", { tone: "data" }), msg("d1", "srv", "cli", 5, "DATA [stream 1] app.css", { tone: "ok" })], {
        notes: [note("srv", 6, "respostas intercaladas, na ordem em que ficam prontas", "ok")],
      }),
    },
    {
      kind: "problema",
      nav: "HOL do TCP",
      title: "Mas o TCP não sabe de streams",
      body: [
        "O TCP entrega os bytes **em ordem**. Se um segmento com dados do `stream 3` se perde, todos os bytes seguintes, **inclusive os dos streams 5 e 1**, ficam retidos no kernel até a retransmissão chegar. Os streams são independentes para o HTTP/2, mas não para o TCP embaixo.",
        "É o *head-of-line blocking* do transporte: uma única perda trava a conexão inteira. Em redes com perda (celular, Wi-Fi congestionado), vários streams em uma conexão pode ser **pior** que seis conexões.",
      ],
      callout: { kind: "atencao", text: "No HTTP/2, a perda de um pacote atrasa todos os streams da conexão, e não só o do pacote perdido." },
      changes: ["segmento do stream 3 perdido", "streams 1 e 5 retidos pelo TCP"],
      metrics: m20("1", "1", { id: "lost", label: "Streams bloqueados", value: "3 de 3", tone: "bad" }),
      stage: seq20(
        [
          msg("d3", "srv", "cli", 0, "DATA [stream 3] app.js", { tone: "bad", lost: true }),
          msg("d5", "srv", "cli", 1, "DATA [stream 5] logo.png", { tone: "data" }),
          msg("d1", "srv", "cli", 2, "DATA [stream 1] app.css", { tone: "data" }),
          msg("rt", "srv", "cli", 5, "retransmissão do segmento perdido", { span: 1, tone: "ctrl" }),
        ],
        { notes: [note("cli", 3, "o TCP retém os streams 5 e 1 até o stream 3 chegar", "bad"), note("cli", 7, "só agora a aplicação recebe os três", "warn")] },
      ),
    },
    {
      kind: "solucao",
      nav: "HTTP/3: QUIC",
      title: "HTTP/3: streams independentes sobre QUIC",
      body: [
        "O **HTTP/3** roda sobre o **QUIC**, um transporte construído sobre **UDP**. O QUIC conhece os streams: cada um tem sua ordem e sua retransmissão. A perda de um pacote do `stream 4` **atrasa só o `stream 4`**; os streams 0 e 8 seguem entregues.",
        "O QUIC reimplementa em espaço de usuário o que o TCP faz (confiabilidade, controle de congestionamento) e acrescenta TLS 1.3 embutido, pacotes sempre criptografados e identificadores de conexão que permitem **migrar** de Wi-Fi para 4G sem recomeçar.",
      ],
      callout: { kind: "chave", text: "HTTP/3 elimina o head-of-line blocking do transporte: cada stream é recuperado de forma independente." },
      changes: ["pacote do stream 4 perdido", "streams 0 e 8 entregues na hora"],
      metrics: m20("1 (QUIC/UDP)", "1", { id: "lost", label: "Streams bloqueados", value: "1 de 3", tone: "ok" }),
      stage: seq20(
        [
          msg("e4", "srv", "cli", 0, "STREAM [4] app.js", { tone: "bad", lost: true }),
          msg("e8", "srv", "cli", 1, "STREAM [8] logo.png", { tone: "ok" }),
          msg("e0", "srv", "cli", 2, "STREAM [0] app.css", { tone: "ok" }),
          msg("er", "srv", "cli", 5, "retransmissão do stream 4", { span: 1, tone: "ctrl" }),
        ],
        { notes: [note("cli", 3, "streams 8 e 0 entregues sem esperar", "ok"), note("cli", 7, "só o stream 4 esperou", "info")] },
      ),
    },
    {
      kind: "conceito",
      nav: "Handshake QUIC",
      title: "O handshake do QUIC junta transporte e TLS",
      body: [
        "Com TCP + TLS 1.3, são 2 RTTs antes da requisição: 1 do TCP, 1 do TLS. No **QUIC**, o handshake de transporte e o de TLS 1.3 viajam **juntos**: o primeiro RTT já conclui as duas coisas, e a requisição vai logo depois.",
        "Para servidores já conhecidos, o **0-RTT** envia a requisição junto do primeiro pacote (com o risco de replay da aula de TLS). O estado da conexão (inclusive o equivalente ao TIME_WAIT) sai do kernel e passa para a biblioteca QUIC, que leva a complexidade junto.",
      ],
      changes: ["transporte + TLS em 1 RTT"],
      metrics: m20("1 (QUIC)", "1", { id: "rtt", label: "Antes da requisição", value: "1 RTT (TCP+TLS: 2)", tone: "ok" }),
      stage: seq20(
        [
          msg("i1", "cli", "srv", 0, "Initial · ClientHello (TLS 1.3)", { tone: "ctrl" }),
          msg("i2", "srv", "cli", 1, "Initial + Handshake · ServerHello, certificado, Finished", { tone: "ctrl" }),
          msg("i3", "cli", "srv", 2, "Handshake Finished · 1-RTT: GET /", { tone: "data" }),
          msg("i4", "srv", "cli", 3, "200 OK", { tone: "ok" }),
        ],
        { brackets: [{ fromAt: 0, toAt: 1, label: "1 RTT: transporte + TLS" }] },
      ),
    },
    {
      kind: "conceito",
      nav: "Como se descobre",
      title: "Como o navegador chega ao HTTP/3",
      body: [
        "O cliente não sabe de antemão se o servidor fala HTTP/3. A negociação do **HTTP/2** vai dentro do TLS: a extensão **ALPN** (`h2`, `http/1.1`). Na primeira visita, o navegador usa TCP; a resposta traz `alt-svc: h3=\":443\"; ma=86400` (ou um registro `HTTPS` no DNS), dizendo que há HTTP/3 em UDP 443.",
        "Nas próximas conexões o navegador tenta **QUIC** e, se o UDP estiver bloqueado, **volta ao TCP** sem erro. Para o backend, isso significa manter HTTP/2 (e HTTP/1.1) funcionando mesmo depois de ligar o HTTP/3.",
      ],
      changes: ["+ ALPN h2", "+ Alt-Svc anuncia h3"],
      metrics: m20("1 → QUIC", "1", { id: "fb", label: "Se UDP falhar", value: "volta ao TCP", tone: "warn" }),
      terminal: { suggest: [CURL_H2, ALTSVC], outputs: { [CURL_H2]: CURL_H2_OUT, [ALTSVC]: "alt-svc: h3=\":443\"; ma=86400" } },
      stage: seq20(
        [
          msg("j1", "cli", "srv", 0, "TCP + TLS · ALPN: h2", { tone: "ctrl" }),
          msg("j2", "srv", "cli", 1, "200 · alt-svc: h3=\":443\"", { tone: "ok" }),
          msg("j3", "cli", "srv", 3, "QUIC (UDP 443) · ALPN: h3", { tone: "data" }),
          msg("j4", "srv", "cli", 4, "200 (HTTP/3)", { tone: "ok" }),
        ],
        { notes: [note("cli", 5, "UDP bloqueado? volta ao TCP", "info")] },
      ),
    },
    {
      kind: "tradeoff",
      nav: "No backend",
      title: "O que muda para quem escreve serviços",
      body: [
        "Entre serviços (**gRPC** usa HTTP/2), uma **única conexão carrega todos os streams**. Com um balanceador **L4**, que distribui conexões e não requisições, essa conexão fica presa a um servidor: o outro permanece ocioso. A solução é balanceamento **L7** ou *client-side*, que reparte os streams.",
        "No Java, o `HttpClient` (11+) já fala HTTP/2 com fallback para 1.1, e reaproveita a conexão por padrão; o suporte a HTTP/3 depende de bibliotecas ou de versões recentes do JDK. Para clientes finais, mantenha HTTP/2 e 1.1 e habilite HTTP/3 onde a rede permitir o UDP.",
      ],
      callout: { kind: "atencao", text: "Uma conexão HTTP/2 com N streams passa por um balanceador L4 como uma conexão só: a carga fica desigual." },
      changes: ["todos os streams em um servidor", "o outro fica ocioso"],
      metrics: m20("1", "1", { id: "uneven", label: "Distribuição", value: "A: 100% · B: 0%", tone: "bad" }),
      stage: {
        mode: "sequence",
        lanes: LANES20B,
        messages: [msg("g1", "cli", "lb", 0, "1 conexão h2 · todos os streams", { tone: "data" }), msg("g2", "lb", "a", 1, "repassa a conexão inteira", { tone: "data" })],
        notes: [note("b", 2, "ocioso", "warn"), note("a", 3, "recebe tudo", "bad")],
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "De seis conexões a streams independentes",
      body: [
        "**HTTP/1.1**: uma resposta por vez por conexão, e o paralelismo vem de até 6 conexões (cada uma paga handshake e slow start). **HTTP/2**: streams intercalados numa conexão TCP, mas uma perda trava todos (HOL do TCP).",
        "**HTTP/3**: QUIC sobre UDP, streams independentes, handshake de 1 RTT e migração de conexão. Em serviços, cuide do balanceamento de conexões longas em HTTP/2.",
      ],
      changes: ["Três versões, três respostas ao mesmo problema"],
      metrics: m20("6 / 1 / 1", "6 / 1 / 1"),
      stage: seq20([...H2_REQ, msg("d3", "srv", "cli", 3, "DATA [stream 3] app.js", { tone: "data" }), msg("d5", "srv", "cli", 4, "DATA [stream 5] logo.png", { tone: "data" }), msg("d1", "srv", "cli", 5, "DATA [stream 1] app.css", { tone: "ok" })]),
    },
  ],
};
