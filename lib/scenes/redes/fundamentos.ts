/**
 * Cenas do módulo "Do clique ao pacote" da trilha Redes para Backend.
 * caminhoDaRequisicao: modo isométrico, shell bash (cliente-servidor-e-requisicao).
 * encapsulamento: modo camadas (modelo-osi-e-encapsulamento).
 * redeLocal: modo isométrico + tabela MAC, shell bash (comunicacao-host-a-host).
 */
import type { IsoEntity, IsoLink, Layer, LayerStack, Metric, SceneDef, SceneStep } from "../types";
import { box, flow, link, zone } from "../kit/common";
import { client, networkSwitch, pingOutput, rowXY, router } from "../kit/net";

// =====================================================================================
// Cena 1: o caminho de uma requisição (iso)
// =====================================================================================

const G = 2.4;
const P = (i: number) => rowXY(i, G);

const CEL = () => client("cel", ...P(0), "celular");
const WIFI = () => router("wifi", ...P(1), "roteador Wi-Fi");
const ISP = () => router("isp", ...P(2), "provedor");
const NET = (label = "internet") => box("net", ...P(3), "cloud", label, { size: "md", tone: "sky" });

/** Data center: uma zona com o servidor dentro, centrada na posição i da fileira. */
function dc(i: number, label = "data center", status?: "warn"): IsoEntity[] {
  const [cx, cy] = P(i);
  return [
    zone("dc", cx - 1.7, cy - 1.7, 3.4, 3.4, { label, tone: "arcane" }),
    box("srv", 2.3, 1.1, "server", "servidor", { parent: "dc", size: "md", tone: "arcane", status }),
  ];
}

const seg = (from: string, to: string, label: string, tone?: IsoLink["tone"]): IsoLink => link(from, to, { label, tone });

const m1 = (rede: string, srv: string, total: string, tone?: Metric["tone"]): Metric[] => [
  { id: "rede", label: "Rede (ida e volta)", value: rede, tone },
  { id: "srv", label: "Servidor", value: srv },
  { id: "tot", label: "Total", value: total, tone },
];

const PING_NEAR = pingOutput({ host: "loja.com.br", ip: "203.0.113.10", ttl: 57, times: [34.2, 33.8, 34.6] });
const PING_FAR = pingOutput({ host: "loja.com.br", ip: "203.0.113.10", ttl: 49, times: [121.4, 119.8, 120.9] });
const PING_EDGE = pingOutput({ host: "img.loja.com.br", ip: "198.51.100.30", ttl: 61, times: [17.9, 18.4, 18.1] });
const IP_ROUTE = ["default via 192.168.0.1 dev wlan0 proto dhcp src 192.168.0.23 metric 600", "192.168.0.0/24 dev wlan0 proto kernel scope link src 192.168.0.23 metric 600"].join("\n");
const IP_ADDR = [
  "3: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default qlen 1000",
  "    link/ether 3c:22:fb:8a:51:0e brd ff:ff:ff:ff:ff:ff",
  "    inet 192.168.0.23/24 brd 192.168.0.255 scope global dynamic wlan0",
  "       valid_lft 85231sec preferred_lft 85231sec",
].join("\n");
const CURL_NEAR = ["conexão (TCP): 0.035s", "primeiro byte:  0.096s"].join("\n");
const CURL_CMD = "curl -o /dev/null -s -w 'conexão (TCP): %{time_connect}s\\nprimeiro byte:  %{time_starttransfer}s\\n' http://loja.com.br";
const PING = "ping -c 3 loja.com.br";

export const caminhoDaRequisicao: SceneDef = {
  title: "O caminho de uma requisição: do celular ao servidor",
  summary: "Siga um toque em “comprar” por Wi-Fi, provedor, internet e data center, e veja a latência somar trecho a trecho.",
  shell: "bash",
  goals: [
    { text: "Ver a requisição como uma sequência de saltos", step: 5 },
    { text: "Separar latência de rede do tempo do servidor", step: 6 },
    { text: "Entender por que a distância importa", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um toque",
      title: "Você toca em “comprar”",
      body: [
        "O app do celular precisa falar com o servidor da loja, que está em outro prédio, talvez em outra cidade. Não existe um fio direto entre os dois: a mensagem vai ser entregue por uma cadeia de equipamentos.",
        "O celular só conhece a própria rede: um endereço local (`192.168.0.23`) e o **gateway padrão** (`192.168.0.1`), para onde manda tudo o que não é local.",
      ],
      metrics: m1("0 ms", "0 ms", "0 ms"),
      terminal: { suggest: ["ip addr show wlan0", "ip route"], outputs: { "ip addr show wlan0": IP_ADDR, "ip route": IP_ROUTE } },
      stage: { mode: "iso", entities: [CEL()] },
    },
    {
      kind: "conceito",
      nav: "Wi-Fi",
      title: "Primeiro salto: o roteador de casa",
      body: [
        "O pacote sai pelo ar até o roteador Wi-Fi. É o primeiro **salto** (hop). O meio de transmissão é compartilhado com os outros aparelhos da casa, e isso custa de 2 a 5 ms por ida e volta.",
        "O roteador é o gateway padrão: ele não é o destino, só o próximo passo do caminho.",
      ],
      metrics: m1("4 ms", "0 ms", "4 ms"),
      terminal: { suggest: ["ip route"], outputs: { "ip route": IP_ROUTE } },
      stage: { mode: "iso", entities: [CEL(), WIFI()], links: [seg("cel", "wifi", "≈ 4 ms")], flows: [flow("cel", "wifi", 2)] },
    },
    {
      kind: "conceito",
      nav: "Provedor",
      title: "O provedor e o último quilômetro",
      body: [
        "Do roteador, a fibra ou o cabo leva o pacote até a central do provedor. Esse trecho é o **último quilômetro**: de 5 a 15 ms em fibra, bem mais em 4G.",
        "Daqui em diante os equipamentos são roteadores de operadora. Nenhum deles sabe o que o app quer; só olham o endereço de destino e escolhem o próximo salto.",
      ],
      metrics: m1("14 ms", "0 ms", "14 ms"),
      terminal: { suggest: [PING], outputs: { [PING]: PING_NEAR } },
      stage: {
        mode: "iso",
        entities: [CEL(), WIFI(), ISP()],
        links: [seg("cel", "wifi", "≈ 4 ms"), seg("wifi", "isp", "≈ 10 ms")],
        flows: [flow("cel", "isp", 2, { via: ["wifi"] })],
      },
    },
    {
      kind: "conceito",
      nav: "Internet",
      title: "A internet: vários roteadores em cadeia",
      body: [
        "A internet é uma rede de redes. O pacote atravessa de 3 a 10 roteadores de operadoras diferentes, e cada um decide só o próximo salto com base na própria tabela de rotas.",
        "Ninguém planeja o caminho inteiro. É por isso que a rota pode mudar de um pacote para o seguinte e que a ida e a volta podem passar por caminhos diferentes.",
      ],
      callout: { kind: "chave", text: "Roteadores pensam só no próximo salto. O caminho completo é consequência, não plano." },
      metrics: m1("32 ms", "0 ms", "32 ms"),
      terminal: { suggest: [PING], outputs: { [PING]: PING_NEAR } },
      stage: {
        mode: "iso",
        entities: [CEL(), WIFI(), ISP(), NET()],
        links: [seg("cel", "wifi", "≈ 4 ms"), seg("wifi", "isp", "≈ 10 ms"), seg("isp", "net", "≈ 18 ms")],
        flows: [flow("cel", "net", 2, { via: ["wifi", "isp"] })],
      },
    },
    {
      kind: "conceito",
      nav: "Data center",
      title: "Chegada ao data center",
      body: [
        "Na entrada do data center ficam firewalls e balanceadores. Eles entregam o pacote ao servidor certo em cerca de 2 ms: a rede interna é curta e rápida.",
        "Somando os trechos, a rede custou **34 ms de ida e volta**. O `ping` mede exatamente isso, sem nenhum trabalho da aplicação.",
      ],
      metrics: m1("34 ms", "0 ms", "34 ms"),
      terminal: { suggest: [PING], outputs: { [PING]: PING_NEAR } },
      stage: {
        mode: "iso",
        entities: [CEL(), WIFI(), ISP(), NET(), ...dc(4)],
        links: [seg("cel", "wifi", "≈ 4 ms"), seg("wifi", "isp", "≈ 10 ms"), seg("isp", "net", "≈ 18 ms"), seg("net", "dc", "≈ 2 ms")],
        flows: [flow("cel", "srv", 2, { via: ["wifi", "isp", "net", "dc"] })],
      },
    },
    {
      kind: "solucao",
      nav: "A resposta volta",
      title: "O servidor responde",
      body: [
        "O servidor consulta o banco, monta a resposta e a devolve. Esse trabalho custa **26 ms** e não tem nada a ver com a rede.",
        "A resposta volta pelos mesmos saltos (ou por outros) e chega ao celular. No total foram 60 ms: 34 ms de rede mais 26 ms de aplicação. Separar as duas parcelas é o primeiro passo de qualquer diagnóstico de lentidão.",
      ],
      metrics: m1("34 ms", "26 ms", "60 ms", "ok"),
      terminal: { suggest: [PING, CURL_CMD], outputs: { [PING]: PING_NEAR, [CURL_CMD]: CURL_NEAR } },
      stage: {
        mode: "iso",
        entities: [CEL(), WIFI(), ISP(), NET(), ...dc(4)],
        links: [seg("cel", "wifi", "≈ 4 ms"), seg("wifi", "isp", "≈ 10 ms"), seg("isp", "net", "≈ 18 ms"), seg("net", "dc", "≈ 2 ms")],
        flows: [flow("srv", "cel", 2, { via: ["dc", "net", "isp", "wifi"], kind: "data" })],
      },
    },
    {
      kind: "problema",
      nav: "Longe demais",
      title: "E se o servidor estiver do outro lado do mundo?",
      body: [
        "Suponha o mesmo servidor numa região dos Estados Unidos, a cerca de 7.700 km. A luz na fibra anda perto de 200 mil km/s, então só a distância já impõe mais de 77 ms de ida e volta, sem contar nenhum roteador.",
        "Na prática a rede passa de 100 ms de ida e volta. A aplicação continua com os mesmos 26 ms, mas o usuário espera 146 ms. Nenhum código resolve isso: é física.",
      ],
      callout: { kind: "atencao", text: "Cada ida e volta que o seu protocolo exige custa um RTT inteiro. Distância multiplicada por número de viagens." },
      metrics: m1("120 ms", "26 ms", "146 ms", "bad"),
      focus: ["net", "dc", "srv"],
      terminal: { suggest: [PING], outputs: { [PING]: PING_FAR } },
      stage: {
        mode: "iso",
        entities: [CEL(), WIFI(), ISP(), NET("internet (cabo submarino)"), ...dc(6, "data center EUA", "warn")],
        links: [seg("cel", "wifi", "≈ 4 ms"), seg("wifi", "isp", "≈ 10 ms"), seg("isp", "net", "≈ 18 ms"), seg("net", "dc", "≈ 88 ms", "rose")],
        flows: [flow("cel", "srv", 1, { via: ["wifi", "isp", "net", "dc"], kind: "heavy" })],
      },
    },
    {
      kind: "solucao",
      nav: "Aproxime",
      title: "Aproxime o conteúdo do usuário",
      body: [
        "A saída é diminuir a distância: uma região mais perto ou uma **borda de CDN** dentro do provedor, que guarda imagens, CSS e JavaScript. O celular nem chega ao data center para esses arquivos.",
        "O trecho que sobra é o do celular até a borda: cerca de 18 ms de ida e volta. Para dados dinâmicos, como o carrinho, a requisição ainda precisa ir ao servidor de origem.",
      ],
      metrics: m1("18 ms", "0 ms", "18 ms", "ok"),
      terminal: { suggest: ["ping -c 3 img.loja.com.br"], outputs: { "ping -c 3 img.loja.com.br": PING_EDGE } },
      stage: {
        mode: "iso",
        entities: [CEL(), WIFI(), ISP(), box("edge", 0.4, -9.2, "layers", "borda CDN", { size: "md", tone: "rune", status: "new" }), NET(), ...dc(4)],
        links: [seg("cel", "wifi", "≈ 4 ms"), seg("wifi", "isp", "≈ 10 ms"), link("isp", "edge", { tone: "mana" })],
        flows: [flow("cel", "edge", 2, { via: ["wifi", "isp"] })],
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Cada trecho soma",
      body: [
        "Uma requisição é uma cadeia de saltos: Wi-Fi, provedor, vários roteadores, data center, servidor. A latência é a soma dos trechos mais o tempo da aplicação.",
        "Para reduzir: aproxime o servidor, reduza o número de viagens (menos handshakes, mais reuso de conexão) e meça separado rede e aplicação.",
      ],
      changes: ["Diagrama completo, sem animação", "Rede e aplicação medidas à parte"],
      metrics: m1("34 ms", "26 ms", "60 ms", "ok"),
      terminal: { suggest: [PING], outputs: { [PING]: PING_NEAR } },
      stage: {
        mode: "iso",
        entities: [CEL(), WIFI(), ISP(), NET(), ...dc(4)],
        links: [seg("cel", "wifi", "≈ 4 ms"), seg("wifi", "isp", "≈ 10 ms"), seg("isp", "net", "≈ 18 ms"), seg("net", "dc", "≈ 2 ms")],
      },
    },
  ],
};

// =====================================================================================
// Cena 2: modelo OSI, TCP/IP e encapsulamento (camadas)
// =====================================================================================

const HTTP_REQ = "GET /pedidos HTTP/1.1 · 81 B";

const http = (o: Partial<Layer> = {}): Layer => ({ id: "http", label: "HTTP", sub: HTTP_REQ, tone: "mana", ...o });
const tcp = (o: Partial<Layer> = {}): Layer => ({ id: "tcp", label: "TCP", sub: "porta 52814 → 80 · 20 B", tone: "sky", ...o });
const ip = (ttl: number, o: Partial<Layer> = {}): Layer => ({ id: "ip", label: "IP", sub: `192.168.0.23 → 203.0.113.10 · TTL ${ttl} · 20 B`, tone: "arcane", ...o });
const eth = (src: string, dst: string, o: Partial<Layer> = {}): Layer => ({ id: "eth", label: "Ethernet", sub: `${src} → ${dst} · 14 B`, tone: "ember", ...o });

const MAC_NB = "3c:22:fb:8a:51:0e";
const MAC_GW_LAN = "a4:91:b1:5c:2e:07";
const MAC_GW_WAN = "a4:91:b1:5c:2e:08";
const MAC_NEXT = "f0:9f:c2:11:7a:30";
const MAC_SRV = "52:54:00:6d:19:c4";

const stk = (id: string, label: string, layers: Layer[]): LayerStack => ({ id, label, orientation: "nested", layers });
const bands = (id: string, label: string, layers: Layer[]): LayerStack => ({ id, label, orientation: "bands", layers });
const L = (id: string, label: string, sub: string, tone: Layer["tone"]): Layer => ({ id, label, sub, tone });

const m2 = (headers: string, frame: string, ttl?: string): Metric[] => [
  { id: "hdr", label: "Cabeçalhos", value: headers },
  { id: "frame", label: "Quadro", value: frame },
  ...(ttl ? [{ id: "ttl", label: "TTL", value: ttl }] : []),
];

const CURL_V = [
  "*   Trying 203.0.113.10:80...",
  "* Connected to loja.com.br (203.0.113.10) port 80",
  "> GET /pedidos HTTP/1.1",
  "> Host: loja.com.br",
  "> User-Agent: curl/8.5.0",
  "> Accept: */*",
  ">",
  "< HTTP/1.1 200 OK",
  "< Content-Type: application/json",
  "< Content-Length: 412",
  "<",
].join("\n");
const CURL_V_CMD = "curl -v http://loja.com.br/pedidos";
const IP_LINK = [
  "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000",
  `    link/ether ${MAC_NB} brd ff:ff:ff:ff:ff:ff`,
].join("\n");
const IP_LINK_CMD = "ip link show eth0";

export const encapsulamento: SceneDef = {
  title: "Encapsulamento: a mensagem ganha envelopes",
  summary: "Veja uma requisição HTTP receber cabeçalhos de TCP, IP e Ethernet, atravessar um roteador e ser desembrulhada no destino.",
  shell: "bash",
  goals: [
    { text: "Ver as camadas do modelo TCP/IP", step: 2 },
    { text: "Montar o quadro: HTTP, TCP, IP, Ethernet", step: 5 },
    { text: "Saber o que o roteador troca e o que preserva", step: 7 },
    { text: "Ver o destino desembrulhar na ordem inversa", step: 9 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Só a mensagem",
      title: "O app tem uma mensagem HTTP",
      body: [
        "O navegador monta o pedido: `GET /pedidos HTTP/1.1` com alguns cabeçalhos, 81 bytes de texto. Isso é a camada de **aplicação**, e ela só se preocupa com o que a conversa significa.",
        "A rede não entende HTTP. Para entregar esses bytes a outra máquina, alguém precisa dizer a quem, por qual caminho e em qual porta. Cada tarefa fica em uma camada.",
      ],
      metrics: m2("0 B", "81 B"),
      terminal: { suggest: [CURL_V_CMD], outputs: { [CURL_V_CMD]: CURL_V } },
      stage: { mode: "layers", stacks: [stk("src", "Notebook 192.168.0.23", [http()])] },
    },
    {
      kind: "conceito",
      nav: "As camadas",
      title: "Sete camadas no OSI, quatro no TCP/IP",
      body: [
        "O **modelo OSI** divide a comunicação em 7 camadas, um vocabulário de referência. A internet roda o **modelo TCP/IP**, que agrupa as três de cima em aplicação e as duas de baixo em acesso à rede.",
        "No dia a dia, “L4” é transporte (TCP, UDP), “L3” é rede (IP), “L2” é enlace (Ethernet, Wi-Fi) e “L7” é aplicação. Balanceadores e firewalls são descritos assim.",
      ],
      callout: { kind: "bom-saber", text: "OSI é mapa para conversar; TCP/IP é o que está implementado. Ninguém roda “sessão” e “apresentação” como camadas separadas." },
      changes: ["+ Modelo OSI (7 camadas)", "+ Modelo TCP/IP (4 camadas)"],
      stage: {
        mode: "layers",
        stacks: [
          bands("osi", "Modelo OSI", [
            L("o7", "7 Aplicação", "HTTP, DNS, SMTP", "mana"),
            L("o6", "6 Apresentação", "codificação, TLS", "mana"),
            L("o5", "5 Sessão", "diálogo entre apps", "mana"),
            L("o4", "4 Transporte", "TCP, UDP: portas", "sky"),
            L("o3", "3 Rede", "IP: endereços, rotas", "arcane"),
            L("o2", "2 Enlace", "Ethernet, Wi-Fi: MAC", "ember"),
            L("o1", "1 Física", "cabo, rádio, fibra", "zinc"),
          ]),
          bands("tcpip", "Modelo TCP/IP", [
            L("t4", "Aplicação", "HTTP, DNS, TLS", "mana"),
            L("t3", "Transporte", "TCP, UDP", "sky"),
            L("t2", "Internet", "IP, ICMP", "arcane"),
            L("t1", "Acesso à rede", "Ethernet, Wi-Fi", "ember"),
          ]),
        ],
      },
    },
    {
      kind: "conceito",
      nav: "TCP",
      title: "O transporte acrescenta as portas",
      body: [
        "O TCP embrulha a mensagem num **segmento**: cabeçalho de 20 bytes (no mínimo) com a porta de origem (`52814`, escolhida pelo sistema) e a de destino (`80`). As portas dizem qual programa recebe os bytes na máquina de destino.",
        "Ele também numera os bytes e controla confirmações. Isso vira o assunto do módulo de TCP.",
      ],
      metrics: m2("20 B", "101 B"),
      stage: { mode: "layers", stacks: [stk("src", "Notebook 192.168.0.23", [tcp({ status: "new" }), http({ status: "muted" })])] },
    },
    {
      kind: "conceito",
      nav: "IP",
      title: "A rede acrescenta os endereços",
      body: [
        "O IP embrulha o segmento num **pacote**: 20 bytes de cabeçalho com o endereço de origem, o de destino e o **TTL**, que começa em 64 no Linux e cai a cada roteador. É o endereço IP que permite atravessar várias redes.",
        "Até aqui nada sabe como chegar ao `203.0.113.10`; o pacote só diz para onde quer ir.",
      ],
      metrics: m2("40 B", "121 B", "64"),
      stage: { mode: "layers", stacks: [stk("src", "Notebook 192.168.0.23", [ip(64, { status: "new" }), tcp({ status: "muted" }), http({ status: "muted" })])] },
    },
    {
      kind: "conceito",
      nav: "Ethernet",
      title: "O enlace acrescenta os endereços MAC",
      body: [
        "Por fim a camada de enlace cria o **quadro** Ethernet: 14 bytes com o MAC de origem, o MAC de destino e o tipo (`0x0800` = IPv4), mais 4 bytes de verificação (FCS) no fim.",
        "O MAC de destino **não** é o do servidor: é o do próximo salto, o gateway `192.168.0.1`. Quadro de 135 bytes sem o FCS, e 81 deles são a mensagem original.",
      ],
      callout: { kind: "chave", text: "MAC vale só dentro de uma rede local; IP vale de ponta a ponta. O quadro nunca sai da rede onde nasceu." },
      metrics: m2("54 B", "135 B", "64"),
      terminal: { suggest: [IP_LINK_CMD], outputs: { [IP_LINK_CMD]: IP_LINK } },
      stage: {
        mode: "layers",
        stacks: [stk("src", "Notebook 192.168.0.23", [eth(MAC_NB, MAC_GW_LAN, { status: "new" }), ip(64, { status: "muted" }), tcp({ status: "muted" }), http({ status: "muted" })])],
      },
    },
    {
      kind: "conceito",
      nav: "Chega ao roteador",
      title: "O roteador recebe o quadro",
      body: [
        "O quadro viaja pelo Wi-Fi até o gateway. Ele confere que o MAC de destino é o dele e **descarta o envelope Ethernet**: o enlace terminou ali. Sobra o pacote IP.",
        "Agora o roteador olha só o IP: o destino é `203.0.113.10`, não é uma rede dele. Precisa encaminhar.",
      ],
      metrics: m2("40 B", "121 B", "64"),
      stage: {
        mode: "layers",
        stacks: [
          stk("src", "Notebook 192.168.0.23", [eth(MAC_NB, MAC_GW_LAN), ip(64), tcp(), http()]),
          stk("rtr", "Roteador (gateway)", [ip(64, { status: "hi" }), tcp({ status: "muted" }), http({ status: "muted" })]),
        ],
        wires: [{ from: "src", to: "rtr", label: "quadro" }],
      },
    },
    {
      kind: "conceito",
      nav: "Troca o Ethernet",
      title: "O roteador troca o Ethernet e baixa o TTL",
      body: [
        "Ele diminui o TTL de 64 para 63, recalcula o checksum do cabeçalho IP e monta um **novo quadro Ethernet** para o próximo salto, com o MAC do seu lado externo como origem e o do roteador seguinte como destino.",
        "TCP e HTTP não foram tocados. IP de origem e de destino continuam iguais: os MACs mudam a cada salto, os IPs não (exceto com NAT, que vem na aula 8).",
      ],
      callout: { kind: "chave", text: "A cada salto: Ethernet novo, TTL menos 1. O resto viaja intacto até o destino." },
      metrics: m2("54 B", "135 B", "63"),
      stage: {
        mode: "layers",
        stacks: [
          stk("rtr", "Roteador (gateway)", [eth(MAC_GW_WAN, MAC_NEXT, { status: "new" }), ip(63, { status: "warn" }), tcp({ status: "muted" }), http({ status: "muted" })]),
        ],
      },
    },
    {
      kind: "solucao",
      nav: "Chega ao servidor",
      title: "Depois de alguns saltos, o servidor",
      body: [
        "O último roteador está na mesma rede do servidor. Ele usa o MAC do servidor como destino do quadro, e o servidor, ao ver o próprio MAC, aceita.",
        "No caminho o TTL caiu mais algumas vezes (aqui chega com 61, depois de 3 roteadores). Se chegasse a 0 antes, o pacote teria sido descartado.",
      ],
      metrics: m2("54 B", "135 B", "61"),
      stage: {
        mode: "layers",
        stacks: [
          stk("rtr", "Último roteador", [eth("00:1b:21:3a:0c:11", MAC_SRV), ip(61), tcp({ status: "muted" }), http({ status: "muted" })]),
          stk("dst", "Servidor 203.0.113.10", [eth("00:1b:21:3a:0c:11", MAC_SRV, { status: "new" }), ip(61, { status: "muted" }), tcp({ status: "muted" }), http({ status: "muted" })]),
        ],
        wires: [{ from: "rtr", to: "dst", label: "quadro" }],
      },
    },
    {
      kind: "conceito",
      nav: "Desembrulha",
      title: "O destino desembrulha na ordem inversa",
      body: [
        "O servidor remove o Ethernet (o MAC é dele), depois o IP (o endereço é dele), depois o TCP (a porta 80 tem alguém escutando). Cada camada lê só o seu cabeçalho e entrega o resto para cima.",
        "No fim, o servidor web recebe os 81 bytes do `GET /pedidos`. O ciclo se repete na resposta, no sentido contrário.",
      ],
      metrics: m2("0 B", "81 B"),
      stage: { mode: "layers", stacks: [stk("dst", "Servidor 203.0.113.10", [http({ status: "ok" })])] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Cada camada fala só com a sua igual",
      body: [
        "Cada camada acrescenta o seu cabeçalho na ida e o remove na chegada. HTTP conversa com HTTP, TCP com TCP, IP com IP. Os roteadores só mexem nos dois envelopes de baixo.",
        "Diagnosticar rede é perguntar em qual camada o problema está: endereço (L3), porta ou conexão (L4) ou aplicação (L7).",
      ],
      changes: ["Quadro completo, 135 bytes", "Roteador: só IP e Ethernet"],
      metrics: m2("54 B", "135 B", "64"),
      stage: {
        mode: "layers",
        stacks: [stk("src", "Notebook 192.168.0.23", [eth(MAC_NB, MAC_GW_LAN), ip(64), tcp(), http()])],
      },
    },
  ],
};

// =====================================================================================
// Cena 3: MAC, switch e a rede local (iso + tabela MAC)
// =====================================================================================

const MAC = { a: "aa:aa:aa:00:00:01", b: "bb:bb:bb:00:00:02", c: "cc:cc:cc:00:00:03", gw: "a4:91:b1:5c:2e:07" };

// losango: A em cima, B à direita, C embaixo e gateway à esquerda (distância 3 na grade)
const D = 3.4;
const POS = { a: [-D, -D], b: [D, -D], c: [D, D], gw: [-D, D] } as const;

const nodes = (o: { a?: "warn" | "hi" | "ok" | "new"; b?: "warn" | "hi" | "ok" | "new"; c?: "warn" | "hi" | "ok" | "new"; gw?: "warn" | "hi" | "ok" | "new" } = {}): IsoEntity[] => [
  networkSwitch("sw", 0, 0, "switch"),
  box("a", ...POS.a, "server", "A · porta 1", { size: "md", tone: "mana", status: o.a }),
  box("b", ...POS.b, "server", "B · porta 2", { size: "md", tone: "mana", status: o.b }),
  box("c", ...POS.c, "server", "C · porta 3", { size: "md", tone: "mana", status: o.c }),
  router("gw", ...POS.gw, "gateway · porta 4", { status: o.gw }),
];
const portLinks = (): IsoLink[] => [link("sw", "a"), link("sw", "b"), link("sw", "c"), link("sw", "gw")];

type MacRow = [string, string, string];
const macTable = (rows: MacRow[], hi?: number, label = "Tabela MAC do switch"): SceneStep["extra"] => [
  {
    kind: "grid",
    label,
    colHeaders: ["MAC", "Porta", "Quem é"],
    rows: rows.length ? rows : [["(vazia)", "", ""]],
    tones: hi !== undefined ? [0, 1, 2].map((c) => ({ r: hi, c, tone: "done" as const })) : [],
  },
];
const ROW_A: MacRow = [MAC.a, "1", "A"];
const ROW_B: MacRow = [MAC.b, "2", "B"];
const ROW_C: MacRow = [MAC.c, "3", "C"];
const ROW_GW: MacRow = [MAC.gw, "4", "gateway"];

const m3 = (table: number, frames: string, tone?: Metric["tone"]): Metric[] => [
  { id: "tab", label: "Entradas na tabela", value: table },
  { id: "fr", label: "Portas que recebem", value: frames, tone },
];

const IP_NEIGH_A = ["192.168.0.12 dev eth0 lladdr bb:bb:bb:00:00:02 REACHABLE", "192.168.0.1 dev eth0 lladdr a4:91:b1:5c:2e:07 STALE"].join("\n");
const IP_LINK_A = ["2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000", `    link/ether ${MAC.a} brd ff:ff:ff:ff:ff:ff`].join("\n");
const ROUTE_C = ["default via 192.168.0.1 dev eth0 proto dhcp src 192.168.0.30 metric 100", "192.168.0.0/24 dev eth0 proto kernel scope link src 192.168.0.30"].join("\n");
const NEIGH = "ip neigh";
const LINK = "ip link show eth0";
const ROUTE = "ip route";

export const redeLocal: SceneDef = {
  title: "A rede local: MAC, switch e broadcast",
  summary: "Veja um switch aprender quem está em cada porta, inundar quando não sabe e entregar só ao destino quando sabe.",
  shell: "bash",
  goals: [
    { text: "Entender o que é um endereço MAC", step: 1 },
    { text: "Ver o switch aprender pela porta de origem", step: 3 },
    { text: "Diferenciar unicast, flood e broadcast", step: 6 },
    { text: "Saber como um quadro sai da rede local", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Quatro máquinas",
      title: "Quatro máquinas, um switch",
      body: [
        "Três servidores e um gateway estão ligados a um **switch**, cada um numa porta. Toda placa de rede tem um endereço **MAC** de 48 bits, gravado de fábrica, que identifica a interface dentro da rede local.",
        "O switch nasce sem saber nada: a tabela MAC está vazia. Ele vai aprendê-la olhando o tráfego.",
      ],
      metrics: m3(0, "–"),
      focus: ["sw", "a", "b"],
      terminal: { suggest: [LINK], outputs: { [LINK]: IP_LINK_A, [NEIGH]: IP_NEIGH_A } },
      extra: macTable([]),
      stage: { mode: "iso", entities: nodes(), links: portLinks() },
    },
    {
      kind: "conceito",
      nav: "A envia a B",
      title: "A manda um quadro para B",
      body: [
        "A sabe o MAC de B (`bb:bb:bb:00:00:02`) e monta o quadro. Ele entra no switch pela **porta 1**.",
        "Antes de decidir para onde mandar, o switch aprende: o MAC de **origem** do quadro, `aa:aa:aa:00:00:01`, só pode estar atrás da porta por onde o quadro chegou. Primeira linha da tabela.",
      ],
      callout: { kind: "chave", text: "O switch aprende pela porta e pelo MAC de ORIGEM. O destino é só consultado." },
      metrics: m3(1, "–"),
      focus: ["sw", "a"],
      terminal: { suggest: [NEIGH], outputs: { [NEIGH]: IP_NEIGH_A } },
      extra: macTable([ROW_A], 0),
      stage: { mode: "iso", entities: nodes({ a: "hi" }), links: portLinks(), flows: [flow("a", "sw", 2)] },
    },
    {
      kind: "problema",
      nav: "Destino ignorado",
      title: "Onde está o B? O switch inunda",
      body: [
        "O MAC de B ainda não está na tabela. Sem saber a porta, o switch faz **flooding** (unicast desconhecido): copia o quadro para todas as portas, menos a de origem.",
        "C e o gateway recebem uma cópia, olham o MAC de destino, veem que não é deles e descartam. Só B aceita. Funciona, mas desperdiça banda e expõe o quadro a quem não precisava vê-lo.",
      ],
      metrics: m3(1, "2, 3 e 4", "warn"),
      focus: ["sw", "b", "c", "gw"],
      terminal: { suggest: [NEIGH], outputs: { [NEIGH]: IP_NEIGH_A } },
      extra: macTable([ROW_A]),
      stage: {
        mode: "iso",
        entities: nodes({ b: "ok" }),
        links: portLinks(),
        flows: [flow("a", "sw", 1), flow("sw", "b", 1, { kind: "data" }), flow("sw", "c", 1, { kind: "bad" }), flow("sw", "gw", 1, { kind: "bad" })],
      },
    },
    {
      kind: "conceito",
      nav: "B responde",
      title: "B responde e o switch aprende B",
      body: [
        "B responde para A. O quadro chega à **porta 2** com origem `bb:bb:bb:00:00:02`: segunda linha da tabela. Como o MAC de A já é conhecido (porta 1), o switch encaminha **só** pela porta 1.",
        "Esse envio direto, para uma única porta, é o **unicast**. C e o gateway não veem nada.",
      ],
      metrics: m3(2, "1"),
      focus: ["sw", "a", "b"],
      extra: macTable([ROW_A, ROW_B], 1),
      stage: { mode: "iso", entities: nodes({ b: "hi", a: "ok" }), links: portLinks(), flows: [flow("b", "sw", 2), flow("sw", "a", 2, { kind: "data" })] },
    },
    {
      kind: "solucao",
      nav: "Unicast direto",
      title: "Dali em diante, tudo direto",
      body: [
        "Com A e B na tabela, a conversa deles passa a ser entregue só às portas certas. O switch consulta a tabela a cada quadro, em hardware, em nanossegundos.",
        "Aqui está a diferença para o antigo **hub**, que repetia tudo em todas as portas: o switch separa os domínios de colisão e dá a cada par uma conversa privada.",
      ],
      metrics: m3(2, "só a 2"),
      focus: ["sw", "a", "b"],
      extra: macTable([ROW_A, ROW_B]),
      stage: { mode: "iso", entities: nodes({ a: "ok", b: "ok" }), links: portLinks(), flows: [flow("a", "sw", 2), flow("sw", "b", 2, { kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Broadcast",
      title: "Broadcast: perguntar a todos",
      body: [
        "Às vezes A quer falar com todo mundo, por exemplo ao perguntar “quem tem o IP 192.168.0.1?” (ARP). O MAC de destino é `ff:ff:ff:ff:ff:ff`, e o switch **sempre** repete o quadro por todas as portas, menos a de origem.",
        "Só o gateway responde, em unicast, e o switch aprende a porta 4. O conjunto de máquinas que ouve os broadcasts umas das outras é um **domínio de broadcast**; o roteador fica na borda dele.",
      ],
      callout: { kind: "atencao", text: "Em redes enormes, broadcast demais vira ruído. Por isso se dividem as redes em sub-redes e VLANs." },
      metrics: m3(3, "2, 3 e 4"),
      focus: ["sw", "b", "c", "gw"],
      extra: macTable([ROW_A, ROW_B, ROW_GW], 2),
      stage: {
        mode: "iso",
        entities: nodes({ a: "hi", gw: "ok" }),
        links: portLinks(),
        flows: [flow("a", "sw", 2), flow("sw", "b", 1), flow("sw", "c", 1), flow("sw", "gw", 1), flow("gw", "a", 1, { via: ["sw"], kind: "data" })],
      },
    },
    {
      kind: "conceito",
      nav: "Sair da rede",
      title: "Para sair da rede, fale com o gateway",
      body: [
        "C quer falar com `203.0.113.10`, que não está na rede local. Ele não manda o quadro ao MAC do servidor (inalcançável por enlace): usa o MAC do **gateway**, `a4:91:b1:5c:2e:07`, e o IP de destino continua o do servidor.",
        "O switch aprende C (porta 3), já conhece o gateway (porta 4, aprendido na resposta do ARP) e entrega só nele. Dali o roteador assume.",
      ],
      metrics: m3(4, "só a 4"),
      focus: ["sw", "c", "gw"],
      terminal: { suggest: [ROUTE], outputs: { [ROUTE]: ROUTE_C } },
      extra: macTable([ROW_A, ROW_B, ROW_C, ROW_GW], 2),
      stage: { mode: "iso", entities: nodes({ c: "hi", gw: "ok" }), links: portLinks(), flows: [flow("c", "sw", 2), flow("sw", "gw", 2, { kind: "data" })] },
    },
    {
      kind: "tradeoff",
      nav: "Tabela finita",
      title: "A tabela não é eterna",
      body: [
        "Cada entrada expira se o MAC fica quieto: o padrão é **300 segundos**. Se B for ligado em outra porta, o primeiro quadro dele corrige a tabela. A memória é finita: de milhares a centenas de milhares de entradas, conforme o equipamento.",
        "Um atacante pode inundar o switch com MACs falsos (**MAC flooding**) até encher a tabela. Sem espaço para aprender, o switch passa a inundar tudo, e o invasor vê o tráfego alheio.",
      ],
      callout: { kind: "atencao", text: "Dois switches ligados em anel sem proteção criam um laço: o broadcast gira para sempre. O STP bloqueia portas para impedir." },
      metrics: m3(4, "–", "warn"),
      focus: ["sw", "b"],
      extra: macTable([ROW_A, ROW_B, ROW_C, ROW_GW], 1),
      stage: { mode: "iso", entities: nodes({ b: "warn" }), links: portLinks() },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que um switch faz",
      body: [
        "O switch aprende pela porta e pelo MAC de **origem**, entrega só ao destino conhecido, inunda quando não conhece e repete todo broadcast. Atua na camada 2 e não olha IP.",
        "A rede local termina no roteador: para falar com o resto do mundo, o quadro vai ao MAC do gateway.",
      ],
      changes: ["Tabela completa", "Um MAC por porta"],
      metrics: m3(4, "–"),
      extra: macTable([ROW_A, ROW_B, ROW_C, ROW_GW]),
      stage: { mode: "iso", entities: nodes(), links: portLinks() },
    },
  ],
};

