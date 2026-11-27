/**
 * Cenas do módulo de building blocks de system design.
 * resolucaoDns: modo sequência, shell bash. Chave de registro: system-design-interview/load-balancer-cdn-dns.
 */
import type { SceneDef, SceneStep, SeqLane, SeqMessage, SeqNote } from "../types";

const LANES: SeqLane[] = [
  { id: "nav", label: "Navegador", icon: "globe", tone: "mana" },
  { id: "so", label: "Cache do SO", icon: "cpu", tone: "zinc" },
  { id: "res", label: "Resolver recursivo", icon: "search", tone: "arcane" },
  { id: "raiz", label: "Servidor raiz", icon: "server", tone: "ember" },
  { id: "tld", label: "TLD .br", icon: "server", tone: "sky" },
  { id: "aut", label: "Autoritativo", icon: "server", tone: "rune" },
];

// ---------- mensagens (ids estáveis; cada passo repete as anteriores) ----------

const M1: SeqMessage = { id: "m1", from: "nav", to: "so", at: 0, label: "qual o IP de loja.com.br?" };
const M2: SeqMessage = { id: "m2", from: "so", to: "res", at: 1, label: "loja.com.br?", detail: "resolver do provedor" };
const M3: SeqMessage = { id: "m3", from: "res", to: "raiz", at: 2, label: "loja.com.br?" };
const M4: SeqMessage = { id: "m4", from: "raiz", to: "res", at: 3, span: 1, label: "não sei; pergunte ao .br", detail: "NS a.dns.br" };
const M5: SeqMessage = { id: "m5", from: "res", to: "tld", at: 5, label: "loja.com.br?" };
const M6: SeqMessage = { id: "m6", from: "tld", to: "res", at: 6, span: 1, label: "pergunte ao autoritativo", detail: "NS ns1.loja.com.br" };
const M7: SeqMessage = { id: "m7", from: "res", to: "aut", at: 8, label: "loja.com.br?" };
const M8: SeqMessage = { id: "m8", from: "aut", to: "res", at: 9, span: 1, label: "A 203.0.113.10, TTL 300", tone: "ok" };
const M9: SeqMessage = { id: "m9", from: "res", to: "so", at: 11, label: "A 203.0.113.10", tone: "ok" };
const M10: SeqMessage = { id: "m10", from: "so", to: "nav", at: 12, label: "A 203.0.113.10", tone: "ok" };

const N_CACHE: SeqNote = { lane: "so", at: 0, text: "não está em cache", tone: "warn" };
const N_STORE_RES: SeqNote = { lane: "res", at: 11, text: "guardado por 300 s", tone: "ok" };
const N_STORE_SO: SeqNote = { lane: "so", at: 12, text: "guardado por 300 s", tone: "ok" };

function seq(messages: SeqMessage[], extra: Partial<Extract<SceneStep["stage"], { mode: "sequence" }>> = {}): SceneStep["stage"] {
  return { mode: "sequence", lanes: LANES, messages, ...extra };
}

const metrics = (queries: number, latency: string, cache: string, tone?: "ok" | "warn" | "bad") => [
  { id: "q", label: "Consultas de rede", value: queries },
  { id: "lat", label: "Latência", value: latency, tone },
  { id: "cache", label: "Cache", value: cache },
];

// ---------- saídas do terminal ----------

const DATE = "Fri Nov 27 14:02:11 -03 2026";

function dig(o: { ms: number; ttl: number; server: string }): string {
  return [
    "; <<>> DiG 9.18.28 <<>> loja.com.br",
    ";; global options: +cmd",
    ";; Got answer:",
    ";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 41873",
    ";; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1",
    "",
    ";; OPT PSEUDOSECTION:",
    "; EDNS: version: 0, flags:; udp: 1232",
    ";; QUESTION SECTION:",
    ";loja.com.br.\t\t\tIN\tA",
    "",
    ";; ANSWER SECTION:",
    `loja.com.br.\t\t${o.ttl}\tIN\tA\t203.0.113.10`,
    "",
    `;; Query time: ${o.ms} msec`,
    `;; SERVER: ${o.server}`,
    `;; WHEN: ${DATE}`,
    ";; MSG SIZE  rcvd: 56",
  ].join("\n");
}

const DIG_TRACE = [
  "; <<>> DiG 9.18.28 <<>> +trace loja.com.br",
  ";; global options: +cmd",
  ".\t\t\t518400\tIN\tNS\ta.root-servers.net.",
  ".\t\t\t518400\tIN\tNS\tb.root-servers.net.",
  ";; Received 811 bytes from 127.0.0.53#53(127.0.0.53) in 2 ms",
  "",
  "br.\t\t\t172800\tIN\tNS\ta.dns.br.",
  "br.\t\t\t172800\tIN\tNS\tb.dns.br.",
  ";; Received 664 bytes from 198.41.0.4#53(a.root-servers.net) in 21 ms",
  "",
  "loja.com.br.\t\t3600\tIN\tNS\tns1.loja.com.br.",
  "loja.com.br.\t\t3600\tIN\tNS\tns2.loja.com.br.",
  ";; Received 220 bytes from 200.160.0.10#53(a.dns.br) in 34 ms",
  "",
  "loja.com.br.\t\t300\tIN\tA\t203.0.113.10",
  ";; Received 72 bytes from 203.0.113.53#53(ns1.loja.com.br) in 36 ms",
].join("\n");

const FIRST_VISIT = {
  "dig loja.com.br": dig({ ms: 112, ttl: 300, server: "8.8.8.8#53(8.8.8.8) (UDP)" }),
  "dig +trace loja.com.br": DIG_TRACE,
  "dig loja.com.br +short": "203.0.113.10",
};

const CACHED_VISIT = {
  "dig loja.com.br": dig({ ms: 0, ttl: 212, server: "127.0.0.53#53(127.0.0.53) (UDP)" }),
  "dig loja.com.br +short": "203.0.113.10",
};

const DIG = "dig loja.com.br";
const TRACE = "dig +trace loja.com.br";
const SHORT = "dig loja.com.br +short";

// ---------- a cena ----------

export const resolucaoDns: SceneDef = {
  title: "Do nome ao IP: como o DNS resolve loja.com.br",
  summary: "Acompanhe uma consulta DNS do navegador até o servidor autoritativo e veja por que o cache e o TTL importam.",
  shell: "bash",
  goals: [
    { text: "Entender a resolução recursiva", step: 5 },
    { text: "Saber o papel do TTL", step: 7 },
    { text: "Ligar DNS a CDN e balanceamento", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um nome",
      title: "Você digita um nome",
      body: [
        "Você digita `loja.com.br` e o navegador precisa de um IP para abrir a conexão. Computadores se falam por número; o nome é só um apelido fácil de lembrar.",
        "A primeira parada é o cache do sistema operacional. Nada por lá: o nome nunca foi consultado, ou a resposta antiga venceu.",
      ],
      metrics: metrics(0, "0 ms", "vazio"),
      terminal: { suggest: [DIG], outputs: FIRST_VISIT },
      stage: seq([M1], { notes: [N_CACHE] }),
    },
    {
      kind: "problema",
      nav: "Ninguém sabe",
      title: "Nem o resolver sabe a resposta",
      body: [
        "O sistema operacional pergunta ao **resolver recursivo** configurado (o do seu provedor ou o `8.8.8.8`). Ele também não tem o nome em cache e começa do topo da hierarquia: o servidor raiz.",
        "O raiz não conhece `loja.com.br`, mas sabe quem cuida do `.br` e responde apontando para lá. Cada ida e volta como essa custa tempo de rede, aqui cerca de 20 ms.",
      ],
      metrics: metrics(1, "≈ 20 ms", "vazio"),
      terminal: { suggest: [TRACE, DIG], outputs: FIRST_VISIT },
      stage: seq([M1, M2, M3, M4], { notes: [N_CACHE], brackets: [{ fromAt: 2, toAt: 4, label: "1 RTT ≈ 20 ms" }] }),
    },
    {
      kind: "conceito",
      nav: "Delegação",
      title: "Cada nível só conhece o próximo",
      body: [
        "O resolver repete a pergunta ao servidor do `.br`. Ele também não sabe o IP, mas sabe quem é o **servidor autoritativo** do domínio e delega: pergunte a `ns1.loja.com.br`.",
      ],
      callout: { kind: "chave", text: "Cada nível só conhece o próximo; ninguém guarda o mundo inteiro. É isso que deixa o DNS crescer sem um servidor central." },
      metrics: metrics(2, "≈ 55 ms", "vazio"),
      terminal: { suggest: [TRACE], outputs: FIRST_VISIT },
      stage: seq([M1, M2, M3, M4, M5, M6], {
        notes: [N_CACHE],
        brackets: [
          { fromAt: 2, toAt: 4, label: "1 RTT ≈ 20 ms" },
          { fromAt: 5, toAt: 7, label: "1 RTT ≈ 35 ms" },
        ],
      }),
    },
    {
      kind: "conceito",
      nav: "A resposta",
      title: "O autoritativo responde",
      body: [
        "O servidor autoritativo é o dono do domínio e tem a resposta final: `A 203.0.113.10`, com um **TTL** de 300 segundos, que diz por quanto tempo o resultado pode ser guardado.",
        "Foram 3 consultas de rede e cerca de 90 ms só para descobrir um IP.",
      ],
      metrics: metrics(3, "≈ 90 ms", "vazio"),
      terminal: { suggest: [TRACE, SHORT], outputs: FIRST_VISIT },
      stage: seq([M1, M2, M3, M4, M5, M6, M7, M8], {
        notes: [N_CACHE],
        brackets: [
          { fromAt: 2, toAt: 4, label: "1 RTT ≈ 20 ms" },
          { fromAt: 5, toAt: 7, label: "1 RTT ≈ 35 ms" },
          { fromAt: 8, toAt: 10, label: "1 RTT ≈ 35 ms" },
        ],
      }),
    },
    {
      kind: "solucao",
      nav: "Volta e guarda",
      title: "A resposta volta e fica guardada",
      body: [
        "O resolver entrega o IP ao sistema operacional, que entrega ao navegador. No caminho, os dois guardam a resposta por 300 s.",
        "O navegador já pode abrir a conexão (TCP e TLS vêm a seguir). Em números: cerca de 110 ms, e a resposta agora mora em dois caches.",
      ],
      metrics: metrics(3, "≈ 110 ms", "res + SO"),
      terminal: { suggest: [DIG, SHORT], outputs: FIRST_VISIT },
      stage: seq([M1, M2, M3, M4, M5, M6, M7, M8, M9, M10], {
        notes: [N_CACHE, N_STORE_RES, N_STORE_SO],
        brackets: [{ fromAt: 0, toAt: 12, label: "total ≈ 110 ms" }],
      }),
    },
    {
      kind: "conceito",
      nav: "Segunda visita",
      title: "A segunda visita é quase de graça",
      body: [
        "Na próxima vez que alguém abre `loja.com.br`, o cache do SO já tem o IP e responde na hora: nenhuma consulta de rede, menos de 1 ms.",
      ],
      callout: { kind: "bom-saber", text: "O cache é o motivo de o DNS aguentar a internet: a maioria das perguntas nunca chega aos servidores raiz." },
      metrics: metrics(0, "< 1 ms", "SO", "ok"),
      terminal: { suggest: [DIG], outputs: CACHED_VISIT },
      stage: seq(
        [
          { id: "v1", from: "nav", to: "so", at: 0, label: "qual o IP de loja.com.br?" },
          { id: "v2", from: "so", to: "so", at: 1, label: "achei no cache", detail: "TTL restante 212 s", tone: "ok" },
          { id: "v3", from: "so", to: "nav", at: 2, label: "A 203.0.113.10", tone: "ok" },
        ],
        { laneState: { so: { text: "cache hit", tone: "ok" } } },
      ),
    },
    {
      kind: "tradeoff",
      nav: "TTL",
      title: "TTL: frescor contra carga",
      body: [
        "O TTL é uma troca. Com **30 s**, uma mudança de IP (um failover, por exemplo) chega rápido a todo mundo, mas os resolvers perguntam o tempo todo.",
        "Com **1 dia**, quase tudo vem do cache e o autoritativo sossega, mas um IP errado continua no ar por horas, e você não controla o cache dos outros.",
      ],
      callout: { kind: "atencao", text: "Baixe o TTL antes de uma migração, não durante: o valor antigo ainda está nos caches." },
      changes: ["+ Nota: TTL de 30 s", "+ Nota: TTL de 1 dia"],
      metrics: metrics(0, "< 1 ms", "SO", "ok"),
      terminal: { suggest: [DIG], outputs: CACHED_VISIT },
      stage: seq(
        [
          { id: "v1", from: "nav", to: "so", at: 0, label: "qual o IP de loja.com.br?" },
          { id: "v2", from: "so", to: "so", at: 1, label: "achei no cache", detail: "TTL restante 212 s", tone: "ok" },
          { id: "v3", from: "so", to: "nav", at: 2, label: "A 203.0.113.10", tone: "ok" },
        ],
        {
          laneState: { so: { text: "cache hit", tone: "ok" } },
          notes: [
            { lane: "res", at: 4, text: "TTL 30 s: troca de IP em segundos, mas o resolver pergunta toda hora", tone: "info" },
            { lane: "aut", at: 7, text: "TTL 1 dia: quase tudo em cache, mas um IP errado fica no ar por horas", tone: "warn" },
          ],
        },
      ),
    },
    {
      kind: "conceito",
      nav: "DNS que escolhe",
      title: "O DNS pode responder diferente por região",
      body: [
        "O autoritativo não precisa devolver sempre o mesmo IP. Ao ver de qual resolver veio a pergunta, ele escolhe: para um resolver em São Paulo, o edge `GRU`; para um em Lisboa, o `LIS`.",
        "É assim que CDNs e balanceamento global (**GeoDNS**) mandam cada usuário ao ponto mais próximo. Para failover de segundos o load balancer é mais indicado, porque o TTL limita a velocidade do DNS.",
      ],
      changes: ["+ A 203.0.113.10 (resolver em SP)", "+ A 198.51.100.20 (resolver em Lisboa)"],
      metrics: metrics(3, "≈ 90 ms", "vazio"),
      terminal: { suggest: [SHORT], outputs: FIRST_VISIT },
      stage: seq(
        [
          { id: "g1", from: "res", to: "aut", at: 0, label: "loja.com.br?", detail: "pergunta vinda de SP" },
          { id: "g2", from: "aut", to: "res", at: 1, span: 1, label: "A 203.0.113.10", detail: "resolver em SP → edge GRU", tone: "ok" },
          { id: "g3", from: "res", to: "aut", at: 3, label: "loja.com.br?", detail: "pergunta vinda de Lisboa" },
          { id: "g4", from: "aut", to: "res", at: 4, span: 1, label: "A 198.51.100.20", detail: "resolver em Lisboa → edge LIS", tone: "data" },
        ],
        { notes: [{ lane: "aut", at: 6, text: "mesmo nome, IPs diferentes: GeoDNS", tone: "info" }] },
      ),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O caminho completo",
      body: [
        "Navegador e SO guardam, o resolver pergunta por você, raiz e TLD **delegam** e o autoritativo é o dono do domínio. O TTL define por quanto tempo cada resposta fica guardada.",
        "Entender essa cadeia ajuda a explicar CDN, GeoDNS e failover em entrevistas de system design: todos são variações de quem responde e por quanto tempo.",
      ],
      changes: ["Diagrama completo, sem animação", "Cada lane resume o seu papel"],
      metrics: metrics(3, "≈ 110 ms", "res + SO"),
      terminal: { suggest: [DIG, TRACE], outputs: FIRST_VISIT },
      stage: seq([M1, M2, M3, M4, M5, M6, M7, M8, M9, M10], {
        notes: [N_CACHE, N_STORE_RES, N_STORE_SO],
        laneState: {
          nav: { text: "só consome" },
          so: { text: "guarda por TTL", tone: "info" },
          res: { text: "pergunta por você", tone: "info" },
          raiz: { text: "delega" },
          tld: { text: "delega" },
          aut: { text: "dono do domínio", tone: "ok" },
        },
      }),
    },
  ],
};
