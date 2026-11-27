/**
 * Cenas do módulo "Proxies e balanceamento" da trilha Redes para Backend.
 * proxyEReverseProxy: isométrico, shell bash (proxy-e-reverse-proxy).
 * balanceamentoL4L7: isométrico + tabelas (load-balancer-l4-vs-l7).
 * acessoAoBanco: isométrico, shell bash (acesso-de-rede-ao-banco).
 */
import type { IsoEntity, Metric, SceneDef, Status } from "../types";
import type { GridPanel } from "@/lib/visualizers/types";
import { box, flow, link, users, zone } from "../kit/common";
import { rowXY } from "../kit/net";

// =====================================================================================
// Cena 25: proxy e reverse proxy (iso)
// =====================================================================================

const P25 = (i: number) => rowXY(i, 3.6);
/** Posição na vertical da tela a partir do i-ésimo ponto da fileira (d > 0 desce, d < 0 sobe). */
const V = (i: number, d: number, gap = 3.6): [number, number] => {
  const [x, y] = rowXY(i, gap);
  return [x + d, y + d];
};

type Q25 = { site?: string; siteStatus?: Status; fpBadge?: string; atk?: boolean; rpBadges?: string[]; backBadge?: string; backStatus?: Status; rp2?: boolean };

function forward(q: Q25 = {}): IsoEntity[] {
  return [
    users("func", ...P25(0), 5, "funcionários"),
    box("fp", ...P25(1), "shield", "forward proxy", { size: "md", tone: "ember", badges: q.fpBadge ? [{ text: q.fpBadge, tone: "info" }] : undefined }),
    box("net", ...P25(2), "cloud", "internet", { size: "md", tone: "zinc" }),
    box("site", ...P25(3), "server", "api.exemplo.com", { size: "md", tone: "arcane", status: q.siteStatus, badges: q.site ? [{ text: q.site, tone: "info" }] : undefined }),
  ];
}

function reverse(q: Q25 = {}): IsoEntity[] {
  return [
    users("cli", ...P25(0), 7, "clientes"),
    ...(q.atk ? [users("atk", ...V(0, 3.6), 3, "cliente malicioso")] : []),
    box("rp", ...P25(1), "scale", "reverse proxy", { size: "md", tone: "ember", badges: q.rpBadges?.map((text) => ({ text, tone: "info" as const })) }),
    ...(q.rp2 ? [box("rp2", ...V(1, -3.6), "scale", "reverse proxy 2", { size: "md", tone: "ember" })] : []),
    box("b1", ...V(3, -2.4), "server", "backend 1", { size: "md", tone: "arcane", status: q.backStatus, badges: q.backBadge ? [{ text: q.backBadge, tone: q.backStatus === "warn" ? "warn" : "info" }] : undefined }),
    box("b2", ...V(3, 2.4), "server", "backend 2", { size: "md", tone: "arcane" }),
  ];
}

const LINKS_F = [link("func", "fp"), link("fp", "net"), link("net", "site")];
const LINKS_R = [link("cli", "rp"), link("rp", "b1"), link("rp", "b2")];
const m25 = (a: string, b: string, c?: Metric): Metric[] => [{ id: "a", label: "O servidor vê", value: a }, { id: "b", label: "O cliente vê", value: b }, ...(c ? [c] : [])];

const CONNECT_CMD = "curl -v -x http://proxy.corp:3128 https://api.exemplo.com/";
const CONNECT_OUT = [
  "*   Trying 192.0.2.10:3128...",
  "* Connected to proxy.corp (192.0.2.10) port 3128",
  "* Establish HTTP proxy tunnel to api.exemplo.com:443",
  "> CONNECT api.exemplo.com:443 HTTP/1.1",
  "> Host: api.exemplo.com:443",
  "> User-Agent: curl/8.5.0",
  "> Proxy-Connection: Keep-Alive",
  ">",
  "< HTTP/1.1 200 Connection established",
  "<",
  "* CONNECT phase completed",
].join("\n");
const LOG_CMD = "tail -n 1 /var/log/nginx/access.log";
const LOG_OUT = '192.0.2.10 - - [27/Nov/2026:14:02:11 +0000] "GET /pedidos HTTP/1.1" 200 412 "-" "curl/8.5.0" xff="203.0.113.50"';

export const proxyEReverseProxy: SceneDef = {
  title: "Proxy e reverse proxy: quem enxerga o quê",
  summary: "Compare o forward proxy da empresa com o reverse proxy do data center e veja como o IP do cliente se perde e volta por cabeçalhos.",
  shell: "bash",
  goals: [
    { text: "Distinguir forward proxy de reverse proxy", step: 4 },
    { text: "Entender o CONNECT e por que o HTTPS passa em túnel", step: 3 },
    { text: "Recuperar o IP do cliente com X-Forwarded-For", step: 7 },
    { text: "Saber em que parte do cabeçalho confiar", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Intermediário",
      title: "Um proxy fica no meio da conversa",
      body: [
        "Um **proxy** é um intermediário: ele fala com uma das pontas em nome da outra. Dependendo de **quem o configura** e de **quem ele protege**, ele é de dois tipos bem diferentes.",
        "Primeiro, o da empresa: os funcionários só chegam à internet passando por ele.",
      ],
      metrics: m25("?", "?"),
      focus: ["func", "fp", "net"],
      stage: { mode: "iso", entities: forward(), links: LINKS_F, flows: [flow("func", "site", 1, { via: ["fp", "net"] })] },
    },
    {
      kind: "conceito",
      nav: "Forward proxy",
      title: "Forward proxy: o cliente é configurado para usá-lo",
      body: [
        "No **forward proxy**, o navegador ou o sistema aponta para ele (`HTTPS_PROXY`). Todo o tráfego de saída passa por ali: filtro de conteúdo, auditoria, cache e **um único IP de saída**.",
        "O servidor de destino enxerga o **IP do proxy**, e não o do funcionário. O proxy sabe quem é o cliente; o servidor não.",
      ],
      changes: ["+ servidor vê só o proxy", "Saída por um único IP"],
      metrics: m25("192.0.2.10 (o proxy)", "o proxy configurado"),
      focus: ["func", "fp", "site"],
      stage: { mode: "iso", entities: forward({ fpBadge: "192.0.2.10", site: "vê 192.0.2.10" }), links: LINKS_F, flows: [flow("func", "site", 2, { via: ["fp", "net"] })] },
    },
    {
      kind: "conceito",
      nav: "CONNECT",
      title: "HTTPS atravessa o proxy num túnel CONNECT",
      body: [
        "O proxy não pode ler HTTPS. Por isso o cliente manda `CONNECT api.exemplo.com:443`: o proxy abre um TCP até o destino, responde `200` e passa a **copiar bytes** nos dois sentidos.",
        "O TLS vai **de ponta a ponta**: o proxy só vê o destino e o volume. Quem inspeciona o conteúdo intercepta o TLS com um certificado próprio, o que é política da empresa, e não parte do protocolo.",
      ],
      callout: { kind: "chave", text: "CONNECT cria um túnel TCP. O proxy vê para onde vai o tráfego, mas não o que ele contém." },
      changes: ["+ túnel TLS de ponta a ponta"],
      cmd: CONNECT_CMD,
      terminal: { suggest: [CONNECT_CMD], outputs: { [CONNECT_CMD]: CONNECT_OUT } },
      focus: ["func", "fp", "site"],
      stage: { mode: "iso", entities: forward({ fpBadge: "túnel", site: "TLS até aqui" }), links: LINKS_F, flows: [flow("func", "site", 3, { via: ["fp", "net"], kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Reverse proxy",
      title: "Reverse proxy: o servidor o coloca na frente",
      body: [
        "No **reverse proxy**, o cliente não sabe que ele existe: acha que fala com o servidor. Quem o configura é **quem opera o serviço**, e os backends ficam numa rede privada, alcançáveis só por ele.",
        "É o desenho de Nginx, HAProxy, Envoy e dos balanceadores de nuvem. O forward proxy protege os clientes; o reverse proxy organiza e protege os servidores.",
      ],
      callout: { kind: "chave", text: "Forward: o cliente sabe do proxy. Reverse: o cliente não sabe; quem configura é o servidor." },
      changes: ["− funcionários e forward proxy", "+ clientes, reverse proxy e backends"],
      metrics: m25("o proxy", "um só endereço"),
      focus: ["cli", "rp", "b1", "b2"],
      stage: { mode: "iso", entities: reverse(), links: LINKS_R, flows: [flow("cli", "b1", 2, { via: ["rp"] }), flow("cli", "b2", 2, { via: ["rp"] })] },
    },
    {
      kind: "conceito",
      nav: "O que ele faz",
      title: "O que um reverse proxy faz pelos backends",
      body: [
        "Ele **termina o TLS**, roteia por host e caminho, comprime, guarda cache, aplica limite de taxa e esconde os backends. Os backends falam HTTP simples na rede privada e só precisam cuidar da aplicação.",
        "Como todo o tráfego passa por ele, é também o lugar natural para métricas, logs de acesso e proteção contra abuso.",
      ],
      changes: ["+ TLS terminado", "+ cache e roteamento"],
      focus: ["cli", "rp", "b1"],
      stage: { mode: "iso", entities: reverse({ rpBadges: ["termina TLS", "roteia"] }), links: LINKS_R, flows: [flow("cli", "b1", 2, { via: ["rp"] }), flow("cli", "b2", 2, { via: ["rp"] })] },
    },
    {
      kind: "problema",
      nav: "IP perdido",
      title: "O backend só vê o IP do proxy",
      body: [
        "A conexão que chega ao backend **vem do proxy**: o IP de origem é `192.0.2.10`, para todos os clientes. Os logs ficam iguais, a geolocalização erra e o limite de taxa por IP trata todos como um só cliente.",
        "É o sintoma do início da aula: todos bloqueados por causa de um.",
      ],
      callout: { kind: "atencao", text: "Atrás de um proxy, o IP de origem da conexão é o do proxy. Sem ajuste, o limite por IP vale para todos juntos." },
      changes: ["backend 1: vê 192.0.2.10"],
      metrics: m25("192.0.2.10", "—", { id: "rl", label: "Limite por IP", value: "bloqueia todos", tone: "bad" }),
      focus: ["cli", "rp", "b1"],
      stage: { mode: "iso", entities: reverse({ backStatus: "warn", backBadge: "origem 192.0.2.10" }), links: LINKS_R, flows: [flow("cli", "b1", 3, { via: ["rp"], kind: "heavy" })] },
    },
    {
      kind: "solucao",
      nav: "X-Forwarded-For",
      title: "O IP do cliente viaja num cabeçalho",
      body: [
        "O proxy acrescenta o IP de quem lhe chamou em **`X-Forwarded-For`** (de fato) ou em **`Forwarded`** (RFC 7239), com `X-Forwarded-Proto` para o protocolo original. Cada proxy da cadeia acrescenta um item à lista.",
        "A aplicação lê o cabeçalho (`server.forward-headers-strategy` no Spring, `real_ip_header` no Nginx) e devolve a cada cliente o seu próprio limite.",
      ],
      cmd: LOG_CMD,
      changes: ["+ X-Forwarded-For: 203.0.113.50", "Limite por IP: por cliente"],
      metrics: m25("192.0.2.10", "203.0.113.50 no cabeçalho", { id: "rl", label: "Limite por IP", value: "por cliente", tone: "ok" }),
      terminal: { suggest: [LOG_CMD], outputs: { [LOG_CMD]: LOG_OUT } },
      focus: ["cli", "rp", "b1"],
      stage: { mode: "iso", entities: reverse({ rpBadges: ["acrescenta XFF"], backStatus: "ok", backBadge: "cliente 203.0.113.50" }), links: LINKS_R, flows: [flow("cli", "b1", 2, { via: ["rp"], kind: "data" })] },
    },
    {
      kind: "problema",
      nav: "XFF forjável",
      title: "O cabeçalho pode ser forjado: confie só no seu proxy",
      body: [
        "Qualquer cliente pode enviar `X-Forwarded-For: 203.0.113.99` por conta própria. O proxy **acrescenta** o IP real ao final: a lista fica `203.0.113.99, 198.51.100.7`, com o valor inventado na frente.",
        "Regra: confie só no que **os seus proxies** acrescentaram. Conte a partir da **direita**, pulando o número de proxies conhecidos, e nunca use o primeiro item de uma lista que veio de fora.",
      ],
      callout: { kind: "atencao", text: "Usar o primeiro item do X-Forwarded-For deixa o atacante escolher o próprio IP e escapar de bloqueios." },
      changes: ["+ cliente malicioso com XFF forjado"],
      focus: ["atk", "rp", "b1"],
      stage: { mode: "iso", entities: reverse({ atk: true, rpBadges: ["XFF: forjado, real"], backStatus: "warn", backBadge: "lê o item errado" }), links: [...LINKS_R, link("atk", "rp")], flows: [flow("atk", "b1", 2, { via: ["rp"], kind: "bad" }), flow("cli", "b2", 2, { via: ["rp"] })] },
    },
    {
      kind: "conceito",
      nav: "PROXY protocol",
      title: "Para L4, o PROXY protocol entrega o IP na conexão",
      body: [
        "Um proxy de **camada 4** não lê HTTP e não pode acrescentar cabeçalhos. O **PROXY protocol** (HAProxy) faz o proxy escrever, no **início da conexão TCP**, uma linha com o IP e a porta originais.",
        "O backend precisa estar configurado para esperá-la: se não estiver, interpreta a linha como lixo e a conexão falha. Vale para bancos, filas e TLS passthrough.",
      ],
      changes: ["+ PROXY TCP4 203.0.113.50 ..."],
      focus: ["cli", "rp", "b1"],
      stage: { mode: "iso", entities: reverse({ rpBadges: ["proxy L4"], backStatus: "ok", backBadge: "lê o PROXY header" }), links: LINKS_R, flows: [flow("cli", "b1", 2, { via: ["rp"], kind: "data" })] },
    },
    {
      kind: "tradeoff",
      nav: "O custo",
      title: "O preço do intermediário",
      body: [
        "Todo proxy acrescenta **um salto de latência**, mais uma conexão a gerenciar e **um ponto único de falha**: por isso se põem dois ou mais. Os **timeouts** também se encadeiam: se o backend fechar conexões ociosas antes de o proxy parar de reaproveitá-las, aparecem `502` esporádicos.",
        "Regra: o keep-alive do backend maior que o ocioso do proxy, e proxies redundantes.",
      ],
      callout: { kind: "bom-saber", text: "502 esporádico com tudo saudável costuma ser keep-alive do backend menor que o do proxy." },
      changes: ["+ reverse proxy 2 (redundância)"],
      focus: ["rp", "rp2", "b1"],
      stage: { mode: "iso", entities: reverse({ rp2: true }), links: [...LINKS_R, link("cli", "rp2"), link("rp2", "b1"), link("rp2", "b2")], flows: [flow("cli", "b1", 1, { via: ["rp"] }), flow("cli", "b2", 1, { via: ["rp2"] })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Forward protege clientes, reverse protege servidores",
      body: [
        "**Forward proxy**: o cliente o configura; o servidor vê o proxy; HTTPS passa em túnel `CONNECT`. **Reverse proxy**: o servidor o configura; o cliente não o vê; termina TLS, roteia e esconde os backends.",
        "O IP do cliente volta por `X-Forwarded-For` ou `Forwarded` (L7) ou pelo PROXY protocol (L4), e só se confia no que os seus proxies acrescentaram.",
      ],
      changes: ["Forward e reverse lado a lado"],
      metrics: m25("o proxy", "—", { id: "ip", label: "IP do cliente", value: "por cabeçalho", tone: "ok" }),
      focus: ["cli", "rp", "b1", "b2"],
      stage: { mode: "iso", entities: reverse({ rpBadges: ["XFF + TLS"] }), links: LINKS_R, flows: [flow("cli", "b1", 1, { via: ["rp"] }), flow("cli", "b2", 1, { via: ["rp"] })] },
    },
  ],
};

// =====================================================================================
// Cena 26: balanceamento L4 vs L7 (iso)
// =====================================================================================

const P26 = (i: number) => rowXY(i, 3.6);
const V26 = (i: number, d: number): [number, number] => {
  const [x, y] = rowXY(i, 3.6);
  return [x + d, y + d];
};

type Q26 = {
  lbLabel?: string; lbBadge?: string; lbStatus?: Status; a?: number; b?: number; aStatus?: Status; bStatus?: Status; aBadge?: string; bBadge?: string;
  est?: boolean; two?: boolean; cli?: number;
};

function balance(q: Q26 = {}): IsoEntity[] {
  const lbAt = q.two ? P26(1) : P26(1.5);
  return [
    users("cli", ...P26(0), q.cli ?? 6, "clientes"),
    ...(q.two ? [box("l4", ...lbAt, "scale", "NLB (L4)", { size: "md", tone: "sky" }), box("lb", ...P26(2), "scale", "ALB (L7)", { size: "md", tone: "ember" })] : [box("lb", ...lbAt, "scale", q.lbLabel ?? "balanceador", { size: "md", tone: "ember", status: q.lbStatus, badges: q.lbBadge ? [{ text: q.lbBadge, tone: "info" }] : undefined })]),
    box("a", ...V26(3, q.est ? -3.2 : -2.4), "server", "api-a", { size: "md", tone: "arcane", meter: q.a, status: q.aStatus, badges: q.aBadge ? [{ text: q.aBadge, tone: q.aStatus === "warn" ? "warn" : "info" }] : undefined }),
    box("b", ...V26(3, q.est ? 0 : 2.4), "server", "api-b", { size: "md", tone: "arcane", meter: q.b, status: q.bStatus, badges: q.bBadge ? [{ text: q.bBadge, tone: q.bStatus === "bad" ? "bad" : "info" }] : undefined }),
    ...(q.est ? [box("est", ...V26(3, 3.2), "folder", "estáticos", { size: "md", tone: "mana" })] : []),
  ];
}
const links26 = (o: { est?: boolean; two?: boolean; labels?: boolean } = {}) => [
  ...(o.two ? [link("cli", "l4"), link("l4", "lb")] : [link("cli", "lb")]),
  link("lb", "a", o.labels ? { label: "/api" } : {}),
  link("lb", "b", o.labels ? { label: "/api" } : {}),
  ...(o.est ? [link("lb", "est", o.labels ? { label: "/static" } : {})] : []),
];
const m26 = (a: string, b: string, ta?: "ok" | "warn" | "bad", tb?: "ok" | "warn" | "bad"): Metric[] => [{ id: "a", label: "CPU api-a", value: a, tone: ta }, { id: "b", label: "CPU api-b", value: b, tone: tb }];

const algoGrid: GridPanel = {
  kind: "grid",
  label: "Algoritmos de balanceamento",
  colHeaders: ["Algoritmo", "Decide por", "Bom quando"],
  rows: [
    ["Round robin", "rodízio", "requisições parecidas"],
    ["Ponderado", "peso de cada backend", "backends de tamanhos diferentes"],
    ["Least connections", "menos conexões ativas", "duração varia muito"],
    ["Least outstanding requests", "menos requisições em andamento (L7)", "latência varia por requisição"],
    ["Hash consistente", "chave (IP, cookie, cabeçalho)", "afinidade e cache local"],
  ],
  tones: [{ r: 3, c: 0, tone: "active" }, { r: 4, c: 0, tone: "active" }],
};
const nlbAlbGrid: GridPanel = {
  kind: "grid",
  label: "Na AWS",
  colHeaders: ["", "NLB (L4)", "ALB (L7)"],
  rows: [
    ["Camada", "TCP/UDP/TLS", "HTTP/HTTPS/gRPC"],
    ["Decide por", "conexão", "requisição, host, caminho, cabeçalho"],
    ["TLS", "passthrough ou termina", "termina"],
    ["IP do cliente", "preservado (conforme o modo)", "no X-Forwarded-For"],
    ["Health check", "TCP (ou HTTP)", "HTTP com código esperado"],
  ],
};

export const balanceamentoL4L7: SceneDef = {
  title: "Balanceamento L4 vs L7",
  summary: "Veja o L4 repassar conexões e desequilibrar clientes HTTP/2, e o L7 terminar o TLS, rotear por caminho e distribuir requisições.",
  goals: [
    { text: "Explicar o que o L4 enxerga e o que ele não enxerga", step: 2 },
    { text: "Reconhecer o desequilíbrio de HTTP/2 atrás de L4", step: 3 },
    { text: "Ver o que o L7 permite: TLS, rotas e health check", step: 6 },
    { text: "Escolher um algoritmo e saber NLB contra ALB", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um LB, vários",
      title: "Um balanceador distribui os clientes entre réplicas",
      body: [
        "Duas réplicas da API atrás de um balanceador, e clientes que chamam um único endereço. A pergunta é o **que** o balanceador distribui: conexões ou requisições?",
        "A resposta depende da camada em que ele opera: **L4** (transporte) ou **L7** (aplicação).",
      ],
      metrics: m26("50%", "50%"),
      focus: ["cli", "lb", "a", "b"],
      stage: { mode: "iso", entities: balance({ a: 50, b: 50 }), links: links26(), flows: [flow("cli", "a", 2, { via: ["lb"] }), flow("cli", "b", 2, { via: ["lb"] })] },
    },
    {
      kind: "conceito",
      nav: "L4",
      title: "L4: decide por conexão, sem ver o HTTP",
      body: [
        "O **L4** olha IP e porta. Para cada **nova conexão TCP** escolhe um backend e encaminha os pacotes dela (NAT ou DSR). Não vê caminho, cabeçalho nem requisição; no TLS passthrough nem lê o conteúdo.",
        "É rápido e barato, e **consistente por conexão**: tudo o que passa numa conexão vai para o mesmo backend.",
      ],
      callout: { kind: "chave", text: "L4 distribui conexões. O que acontece dentro de cada conexão, ele não vê." },
      changes: ["balanceador: L4"],
      metrics: m26("50%", "50%"),
      focus: ["cli", "lb", "a", "b"],
      stage: { mode: "iso", entities: balance({ lbLabel: "balanceador L4", lbBadge: "IP e porta", a: 50, b: 50 }), links: links26(), flows: [flow("cli", "a", 2, { via: ["lb"] }), flow("cli", "b", 2, { via: ["lb"] })] },
    },
    {
      kind: "problema",
      nav: "HTTP/2 em L4",
      title: "Conexões longas desequilibram a carga",
      body: [
        "Clientes HTTP/2 e gRPC abrem **uma** conexão e a mantêm por horas, levando milhares de requisições (aula 20). O L4 balanceou as **conexões**: duas caíram em `api-a` e uma em `api-b`, e as requisições seguem por elas.",
        "Resultado: `api-a` a 90% e `api-b` quase ociosa, com o balanceador funcionando exatamente como projetado. Escalar para uma terceira réplica não ajuda as conexões já abertas.",
      ],
      callout: { kind: "atencao", text: "Atrás de L4, uma conexão longa fixa o cliente num backend. Réplicas novas não recebem carga das conexões existentes." },
      changes: ["api-a: 90% de CPU", "api-b: 10% de CPU"],
      metrics: m26("90%", "10%", "bad", "ok"),
      focus: ["cli", "a", "b"],
      stage: { mode: "iso", entities: balance({ lbLabel: "balanceador L4", lbBadge: "IP e porta", a: 90, aStatus: "warn", aBadge: "2 conexões", b: 10, bBadge: "1 conexão" }), links: links26(), flows: [flow("cli", "a", 4, { via: ["lb"], kind: "heavy" }), flow("cli", "b", 1, { via: ["lb"] })] },
    },
    {
      kind: "solucao",
      nav: "L7 termina TLS",
      title: "L7: termina a conexão e lê a requisição",
      body: [
        "O **L7** termina o TLS com o certificado do serviço, lê o HTTP e abre ou reaproveita **suas próprias conexões** para os backends. Cada requisição pode ir a um backend diferente.",
        "O mesmo cliente HTTP/2, com a mesma conexão longa, passa a ter as requisições espalhadas pelas duas réplicas: 50% e 50%.",
      ],
      changes: ["balanceador: L7, termina TLS", "api-a e api-b: 50%"],
      metrics: m26("50%", "50%", "ok", "ok"),
      focus: ["cli", "lb", "a", "b"],
      stage: { mode: "iso", entities: balance({ lbLabel: "balanceador L7", lbBadge: "termina TLS", a: 50, b: 50 }), links: links26(), flows: [flow("cli", "a", 2, { via: ["lb"], kind: "data" }), flow("cli", "b", 2, { via: ["lb"], kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Rotas L7",
      title: "L7 roteia por host, caminho e cabeçalho",
      body: [
        "Com a requisição à vista, o L7 aplica regras: `/api` vai para o grupo da API, `/static` para outro, `Host: loja.exemplo.com` para outro serviço, e cabeçalhos podem escolher a versão do backend.",
        "É o que torna um único endereço público capaz de servir vários serviços, e a base de canários e testes A/B por cabeçalho.",
      ],
      changes: ["+ grupo de estáticos", "+ regras por caminho"],
      metrics: m26("50%", "50%"),
      focus: ["lb", "a", "est"],
      stage: { mode: "iso", entities: balance({ lbLabel: "balanceador L7", est: true, a: 50, b: 50 }), links: links26({ est: true, labels: true }), flows: [flow("cli", "a", 2, { via: ["lb"], kind: "data" }), flow("cli", "est", 1, { via: ["lb"] })] },
    },
    {
      kind: "conceito",
      nav: "Health check",
      title: "Health check de aplicação e retry",
      body: [
        "O L4 sabe só se a **porta aceita conexão**. O L7 pergunta à aplicação: `GET /healthz` esperando `200`. Um backend que responde `500` sai da rotação e volta quando se recuperar.",
        "Com a requisição em mãos, o L7 também pode **repetir** em outro backend se um falhar, mas só com requisições idempotentes, ou um `POST` pode ser duplicado.",
      ],
      changes: ["api-b: GET /healthz → 500", "api-b sai da rotação"],
      metrics: m26("100%", "—", "warn"),
      focus: ["lb", "a", "b"],
      stage: { mode: "iso", entities: balance({ lbLabel: "balanceador L7", a: 100, aStatus: "warn", b: 0, bStatus: "bad", bBadge: "healthz 500" }), links: links26(), flows: [flow("lb", "a", 1, { kind: "hc" }), flow("lb", "b", 1, { kind: "bad" }), flow("cli", "a", 3, { via: ["lb"], kind: "heavy" })] },
    },
    {
      kind: "conceito",
      nav: "Algoritmos",
      title: "Como o balanceador escolhe o backend",
      body: [
        "**Round robin** reveza; **ponderado** respeita pesos; **least connections** olha as conexões ativas; **least outstanding requests** olha as requisições em andamento (só L7); o **hash consistente** manda a mesma chave ao mesmo backend.",
        "O hash consistente dá afinidade (cache local, sessão) e, quando um backend entra ou sai, só uma fração das chaves muda de lugar.",
      ],
      changes: ["+ pesos nos backends"],
      metrics: m26("67%", "33%"),
      extra: [algoGrid],
      focus: ["lb", "a", "b"],
      stage: { mode: "iso", entities: balance({ lbLabel: "balanceador L7", a: 67, aBadge: "peso 2", b: 33, bBadge: "peso 1" }), links: links26(), flows: [flow("cli", "a", 3, { via: ["lb"], kind: "data" }), flow("cli", "b", 1, { via: ["lb"], kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "NLB e ALB",
      title: "Na AWS: NLB é L4 e ALB é L7",
      body: [
        "O **NLB** opera em L4: TCP, UDP e TLS, vazão muito alta, IP do cliente preservado conforme o modo. O **ALB** opera em L7: HTTP, regras por caminho e cabeçalho, health check HTTP e o IP do cliente no `X-Forwarded-For`.",
        "Escolha pelo tráfego: gRPC e HTTP/2 pedem L7; bancos, filas e protocolos próprios, L4.",
      ],
      changes: ["+ comparação NLB e ALB"],
      extra: [nlbAlbGrid],
      focus: ["cli", "lb", "a"],
      stage: { mode: "iso", entities: balance({ lbLabel: "ALB ou NLB", a: 50, b: 50 }), links: links26(), flows: [flow("cli", "a", 1, { via: ["lb"] }), flow("cli", "b", 1, { via: ["lb"] })] },
    },
    {
      kind: "tradeoff",
      nav: "L4 + L7",
      title: "Camadas combinadas e o custo do L7",
      body: [
        "O L7 gasta CPU em TLS e em ler cada requisição, e acrescenta um salto de latência. O L4 é barato e simples, mas cego. Por isso é comum **L4 na frente e L7 atrás**: o NLB entrega um IP estável e absorve o volume, e o ALB ou Envoy decide por requisição.",
        "Cada camada também tem limite próprio de conexões e de CPU para TLS: dimensione os dois.",
      ],
      callout: { kind: "bom-saber", text: "L4 é vazão e simplicidade; L7 é inteligência por requisição. Combinar os dois é um desenho comum." },
      changes: ["+ NLB (L4) na frente do ALB (L7)"],
      metrics: m26("50%", "50%"),
      focus: ["l4", "lb", "a"],
      stage: { mode: "iso", entities: balance({ two: true, a: 50, b: 50 }), links: links26({ two: true }), flows: [flow("cli", "a", 2, { via: ["l4", "lb"], kind: "data" }), flow("cli", "b", 2, { via: ["l4", "lb"], kind: "data" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "L4 distribui conexões; L7 distribui requisições",
      body: [
        "**L4**: IP e porta, rápido, por conexão; ruim para HTTP/2 e gRPC de conexão longa. **L7**: termina TLS, roteia por host, caminho e cabeçalho, faz health check HTTP e retry, e distribui requisições.",
        "Algoritmos: round robin, ponderado, least connections, least outstanding requests e hash consistente. Na AWS: NLB é L4, ALB é L7.",
      ],
      changes: ["Conexões contra requisições"],
      metrics: m26("50%", "50%", "ok", "ok"),
      focus: ["cli", "lb", "a", "b"],
      stage: { mode: "iso", entities: balance({ lbLabel: "balanceador L7", a: 50, b: 50 }), links: links26(), flows: [flow("cli", "a", 1, { via: ["lb"], kind: "data" }), flow("cli", "b", 1, { via: ["lb"], kind: "data" })] },
    },
  ],
};

// =====================================================================================
// Cena 27: acesso de rede ao banco (iso)
// =====================================================================================

const Z = (k: number): [number, number] => [k * 6.0 - 2.3, -k * 6.0 - 2.3];

type Q27 = { dbIn?: "pub" | "dados"; dbStatus?: Status; dbBadge?: string; atk?: boolean; dev?: boolean; job?: boolean; appBadge?: string; zones?: boolean };

function vpc(q: Q27 = {}): IsoEntity[] {
  const dbIn = q.dbIn ?? "dados";
  const [z0x, z0y] = Z(0);
  const [z1x, z1y] = Z(1);
  const [z2x, z2y] = Z(2);
  return [
    users("inet", ...rowXY(-1, 6.0), 6, "internet"),
    ...(q.atk ? [users("atk", ...rowXY(-1, 6.0).map((v, i) => v + (i === 0 ? 3.4 : 3.4)) as [number, number], 3, "atacantes")] : []),
    zone("pub", z0x, z0y, 4.6, 4.6, { label: "subnet pública", tone: "ember" }),
    zone("priv", z1x, z1y, 4.6, 4.6, { label: "privada · aplicação", tone: "mana" }),
    ...(dbIn === "dados" ? [zone("dados", z2x, z2y, 4.6, 4.6, { label: "privada · dados", tone: "arcane" })] : []),
    box("alb", 1.2, 3.4, "scale", "balanceador", { parent: "pub", size: "sm", tone: "ember" }),
    ...(q.dev ? [box("bastion", 3.4, 1.2, "terminal", "bastion / SSM", { parent: "pub", size: "sm", tone: "sky" })] : []),
    box("app", 1.2, 3.4, "server", "aplicação", { parent: "priv", size: "sm", tone: "mana", badges: q.appBadge ? [{ text: q.appBadge, tone: "info" }] : undefined }),
    ...(q.job ? [box("job", 3.4, 1.2, "cog", "job relatório", { parent: "priv", size: "sm", tone: "mana", status: "bad", badges: [{ text: "sg-job", tone: "bad" }] })] : []),
    ...(dbIn === "dados"
      ? [box("db", 2.3, 2.3, "database", "Postgres :5432", { parent: "dados", size: "sm", tone: "arcane", status: q.dbStatus, badges: q.dbBadge ? [{ text: q.dbBadge, tone: "info" }] : undefined })]
      : [box("db", 3.4, 1.2, "database", "Postgres", { parent: "pub", size: "sm", tone: "arcane", status: "bad", badges: [{ text: "IP público", tone: "bad" }] })]),
    ...(q.dev ? [users("dev", ...rowXY(-1, 6.0).map((v, i) => (i === 0 ? v - 2.0 : v + 2.0)) as [number, number], 1, "engenheiro")] : []),
  ];
}
const links27 = (o: { dev?: boolean; pubdb?: boolean; job?: boolean } = {}) => [
  link("inet", "alb"),
  link("alb", "app"),
  link(o.pubdb ? "inet" : "app", "db", o.pubdb ? { style: "dashed", tone: "rose" } : {}),
  ...(o.job ? [link("job", "db", { style: "dashed", tone: "rose" })] : []),
  ...(o.dev ? [link("dev", "bastion"), link("bastion", "db", { style: "dashed" })] : []),
];

const NC_CMD = "nc -vz db.interno 5432";
const NC_TIMEOUT = "nc: connect to db.interno (10.0.2.15) port 5432 (tcp) timed out: Operation now in progress";
const NC_REFUSED = "nc: connect to db.interno (10.0.2.15) port 5432 (tcp) failed: Connection refused";
const NC_OK = "Connection to db.interno (10.0.2.15) 5432 port [tcp/postgresql] succeeded!";
const PSQL_CMD = 'psql "host=db.interno dbname=pedidos user=app sslmode=verify-full sslrootcert=/etc/ssl/rds-ca.pem" -c "select ssl, version from pg_stat_ssl where pid = pg_backend_pid()"';
const PSQL_OUT = [" ssl | version", "-----+---------", " t   | TLSv1.3", "(1 row)"].join("\n");

const roteiroGrid: GridPanel = {
  kind: "grid",
  label: "Roteiro quando dá timeout",
  colHeaders: ["#", "O que conferir", "Onde"],
  rows: [
    [1, "SG do banco libera 5432 para o SG da aplicação?", "security group do banco"],
    [2, "SG de saída da aplicação permite?", "security group da aplicação"],
    [3, "NACL libera ida e volta nas portas efêmeras?", "NACL das duas subnets"],
    [4, "Há rota entre as subnets?", "tabelas de rotas"],
    [5, "O banco escuta no IP certo?", "listen_addresses e pg_hba.conf"],
  ],
};
const m27 = (a: string, b: string, tb?: "ok" | "warn" | "bad"): Metric[] => [{ id: "a", label: "IP público", value: a }, { id: "b", label: "Porta 5432 aberta para", value: b, tone: tb }];

export const acessoAoBanco: SceneDef = {
  title: "Acesso de rede ao banco de dados",
  summary: "Tire o banco da internet: subnets privadas, security group por referência, NACL stateless, acesso humano por SSM ou túnel e TLS até o banco.",
  shell: "bash",
  goals: [
    { text: "Colocar o banco numa subnet privada sem IP público", step: 2 },
    { text: "Escrever a regra do security group por referência", step: 3 },
    { text: "Entender o NACL stateless e as portas efêmeras", step: 4 },
    { text: "Diferenciar timeout de recusa ao diagnosticar", step: 7 },
  ],
  steps: [
    {
      kind: "problema",
      nav: "Banco público",
      title: "O banco com IP público é alvo na internet",
      body: [
        "O Postgres foi criado com IP público e o security group libera a **5432** para `0.0.0.0/0`. Em dias, o log mostra milhares de tentativas de login de endereços de todo o mundo.",
        "A senha pode até ser boa, mas o banco **nunca deveria ser alcançável** pela internet: a defesa certa está na rede.",
      ],
      callout: { kind: "atencao", text: "Porta de banco aberta para 0.0.0.0/0 é um incidente esperando acontecer." },
      changes: ["banco com IP público", "+ atacantes tentando a 5432"],
      metrics: m27("sim", "0.0.0.0/0", "bad"),
      focus: ["inet", "atk", "db"],
      stage: { mode: "iso", entities: vpc({ dbIn: "pub", atk: true }), links: [...links27({ pubdb: true }), link("atk", "db", { style: "dashed", tone: "rose" })], flows: [flow("atk", "db", 3, { kind: "bad" })] },
    },
    {
      kind: "solucao",
      nav: "Subnet privada",
      title: "O banco vai para uma subnet privada",
      body: [
        "Uma **subnet privada** não tem rota de entrada da internet, e o banco **não tem IP público**. Nem o IP privado dele é alcançável de fora da VPC: um atacante precisaria comprometer antes algo dentro da rede.",
        "O desenho: subnet **pública** (balanceador, NAT, bastion), **privada de aplicação** e **privada de dados**.",
      ],
      changes: ["banco → subnet de dados", "Sem IP público"],
      metrics: m27("não", "ninguém ainda", "ok"),
      focus: ["inet", "alb", "app", "db"],
      stage: { mode: "iso", entities: vpc(), links: links27(), flows: [flow("inet", "app", 2, { via: ["alb"] })] },
    },
    {
      kind: "conceito",
      nav: "Security group",
      title: "Security group: a 5432 só para o SG da aplicação",
      body: [
        "O **security group** é o firewall do recurso, e é **stateful**: a resposta de uma conexão permitida volta sem regra de saída. A regra do banco: `TCP 5432, origem = sg-app`.",
        "Referenciar o **security group**, e não uma faixa de IP, acompanha as instâncias que sobem e descem. Tudo o que não está liberado é negado.",
      ],
      callout: { kind: "chave", text: "Regra do banco: TCP 5432, origem = security group da aplicação. Sem 0.0.0.0/0." },
      changes: ["+ regra: 5432 ← sg-app"],
      metrics: m27("não", "só sg-app", "ok"),
      focus: ["app", "db"],
      stage: { mode: "iso", entities: vpc({ dbBadge: "5432 ← sg-app", appBadge: "sg-app" }), links: links27(), flows: [flow("app", "db", 3, { kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "NACL",
      title: "NACL é stateless: a volta precisa de regra",
      body: [
        "A **NACL** age na subnet e **não lembra** de conexões. Liberar a entrada na 5432 não libera a resposta: é preciso uma regra de saída para as **portas efêmeras** (1024 a 65535) do cliente, em cada sentido.",
        "Esquecer isso é clássico: o SYN chega, o SYN-ACK morre na volta, e o erro parece ser do banco. Por padrão a NACL da VPC permite tudo; só se mexe nela com motivo.",
      ],
      changes: ["NACL: ida na 5432, volta nas efêmeras"],
      metrics: m27("não", "só sg-app", "ok"),
      focus: ["app", "dados", "db"],
      stage: { mode: "iso", entities: vpc({ dbBadge: "NACL: volta 1024-65535", appBadge: "porta efêmera" }), links: links27(), flows: [flow("app", "db", 2, { kind: "req" }), flow("db", "app", 2, { kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Acesso humano",
      title: "Pessoas entram por SSM, bastion ou túnel",
      body: [
        "Quem precisa consultar o banco não ganha a 5432 aberta. O **SSM Session Manager** encaminha uma porta sem abrir nenhuma entrada (IAM e auditoria); o **bastion** é um salto mínimo na subnet pública; e o **túnel SSH** (`ssh -L 5433:db.interno:5432`) expõe o banco em `localhost:5433`.",
        "O banco continua sem IP público, e o acesso fica registrado.",
      ],
      cmd: "ssh -L 5433:db.interno:5432 usuario@bastion",
      changes: ["+ engenheiro", "+ bastion / SSM"],
      focus: ["dev", "bastion", "db"],
      stage: { mode: "iso", entities: vpc({ dev: true }), links: links27({ dev: true }), flows: [flow("dev", "db", 2, { via: ["bastion"], kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "TLS até o banco",
      title: "Cifrar e validar: sslmode=verify-full",
      body: [
        "Dentro da VPC o tráfego também vai cifrado. No Postgres, `sslmode=verify-full` exige TLS e **valida a cadeia e o nome** do servidor (aula 19), impedindo que um intermediário se passe pelo banco. `require` cifra, mas não confere quem está do outro lado.",
        "O `pg_stat_ssl` confirma, do lado do banco, que a conexão está cifrada.",
      ],
      cmd: "jdbc:postgresql://db.interno:5432/pedidos?sslmode=verify-full",
      changes: ["+ TLS validado até o banco"],
      terminal: { suggest: [PSQL_CMD], outputs: { [PSQL_CMD]: PSQL_OUT } },
      focus: ["app", "db"],
      stage: { mode: "iso", entities: vpc({ appBadge: "verify-full", dbBadge: "TLSv1.3" }), links: links27(), flows: [flow("app", "db", 3, { kind: "data" })] },
    },
    {
      kind: "problema",
      nav: "Timeout",
      title: "Quem não está liberado leva timeout, e não recusa",
      body: [
        "Um novo job de relatório, em outro security group, tenta o banco: nada responde. Security groups e NACLs **descartam em silêncio**, e o cliente vê `connect timed out` depois de esperar.",
        "`Connection refused` é outra coisa: o pacote chegou e alguém respondeu RST, ou seja, a rede está livre e o banco é que não escuta ali.",
      ],
      callout: { kind: "chave", text: "Timeout = algo descartou (firewall, rota). Recusa = chegou, mas nada escuta na porta." },
      changes: ["+ job sem regra", "connect timed out"],
      metrics: m27("não", "só sg-app", "ok"),
      terminal: { suggest: [NC_CMD], outputs: { [NC_CMD]: NC_TIMEOUT } },
      focus: ["job", "db"],
      stage: { mode: "iso", entities: vpc({ job: true }), links: links27({ job: true }), flows: [flow("job", "db", 2, { kind: "bad" }), flow("app", "db", 1, { kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Roteiro",
      title: "O roteiro de diagnóstico, na ordem",
      body: [
        "Siga a lista: security group do banco, security group de saída da aplicação, NACLs nos dois sentidos, rotas entre as subnets e, por último, se o banco escuta no IP certo (`listen_addresses`, `pg_hba.conf`).",
        "Com o job liberado no `sg-job`, o mesmo `nc` passa a conectar.",
      ],
      changes: ["+ regra para sg-job", "nc: succeeded"],
      terminal: { suggest: [NC_CMD], outputs: { [NC_CMD]: NC_OK } },
      extra: [roteiroGrid],
      focus: ["job", "db"],
      stage: { mode: "iso", entities: vpc({ job: true }), links: links27({ job: true }), flows: [flow("app", "db", 1, { kind: "data" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Sem IP público, uma regra, e cifrado",
      body: [
        "Banco em **subnet privada** sem IP público; **security group** (stateful) com `5432 ← sg-app`; **NACL** (stateless) com as portas efêmeras na volta; acesso humano por **SSM, bastion ou túnel**; `sslmode=verify-full`.",
        "Timeout é filtro de rede descartando; recusa é porta sem serviço. O `nc -vz` separa os dois.",
      ],
      changes: ["Camadas de proteção completas"],
      terminal: { suggest: [NC_CMD], outputs: { [NC_CMD]: NC_REFUSED } },
      metrics: m27("não", "só sg-app", "ok"),
      focus: ["inet", "alb", "app", "db"],
      stage: { mode: "iso", entities: vpc({ dbBadge: "5432 ← sg-app", appBadge: "verify-full" }), links: links27(), flows: [flow("app", "db", 1, { kind: "data" })] },
    },
  ],
};
