/**
 * Cenas do módulo "Redes no Docker" da trilha Docker.
 * redesBridgeHostNone: isométrico, shell docker (redes-bridge-host-none).
 * redesDefinidasPeloUsuario: isométrico, shell docker (redes-definidas-pelo-usuario-e-dns).
 * portasIptablesMacvlan: isométrico, shell docker (portas-iptables-e-macvlan).
 */
import type { IsoEntity, Metric, SceneDef, Status } from "../types";
import { box, flow, link, users, zone } from "../kit/common";
import { container } from "../kit/docker";

/** (u, v) em colunas e linhas da TELA -> (x, y) da grade isométrica. u = x - y; v = x + y. */
const at = (u: number, v: number): [number, number] => [(v + u) / 2, (v - u) / 2];

type Tone4 = "ok" | "warn" | "bad" | "info";

// =====================================================================================
// Cena 8: bridge, host e none (iso)
// =====================================================================================

type Q8 = { docker0?: boolean; web?: boolean; api?: boolean; host?: boolean; none?: boolean; webStatus?: Status };

function entidades8(q: Q8): IsoEntity[] {
  const out: IsoEntity[] = [];
  if (q.docker0) {
    out.push(
      zone("br", ...at(0, 0), 7, 7, { label: "bridge 172.17.0.0/16", tone: "sky", dashed: true, status: q.docker0 && !q.web ? "new" : undefined }),
      box("d0", ...at(0, 10.5), "network", "docker0", { parent: "br", size: "sm", tone: "sky", badges: [{ text: "172.17.0.1", tone: "info" }] }),
    );
  }
  if (q.web) out.push(container("web", ...at(-3.5, 5), "web", { image: "nginx:1.27", ip: "172.17.0.2", status: "Up 3 minutes", age: "3 minutes" }, { parent: "br", status: q.webStatus, badges: [{ text: "172.17.0.2", tone: "info" }] }));
  if (q.api) out.push(container("api", ...at(3.5, 5), "api", { image: "loja/api:1.0", ip: "172.17.0.3", status: "Up 2 minutes", age: "2 minutes" }, { parent: "br", status: "new", badges: [{ text: "172.17.0.3", tone: "info" }] }));
  out.push(box("eth0", ...at(0, 20.5), "network", "eth0", { size: "md", tone: "ember", badges: [{ text: "203.0.113.10", tone: "info" }] }));
  out.push(box("net", ...at(8.5, 20.5), "cloud", "internet", { size: "md", tone: "zinc" }));
  if (q.host) out.push(container("metrics", ...at(-8.5, 20.5), "metrics", { image: "prom/node-exporter", status: "Up 1 minute", age: "1 minute" }, { status: "warn", badges: [{ text: "usa a rede do host", tone: "warn" }] }));
  if (q.none) out.push(container("batch", ...at(11, 8), "batch", { image: "loja/batch:1.0", status: "Up 1 minute", age: "1 minute" }, { status: "muted", badges: [{ text: "só lo 127.0.0.1", tone: "info" }] }));
  return out;
}

const m8 = (a: string, b: string, tone?: Metric["tone"]): Metric[] => [
  { id: "a", label: "Rede", value: a },
  { id: "b", label: "Isolamento de rede", value: b, tone },
];

const IP_BR = "ip -br addr show docker0";
const IP_BR_OUT = "docker0          UP             172.17.0.1/16";
const NET_LS = "docker network ls";
const NET_LS_OUT = [
  "NETWORK ID     NAME      DRIVER    SCOPE",
  "1f9d3a5c7b21   bridge    bridge    local",
  "6c0e8a2d4f93   host      host      local",
  "a84b1d7e5c06   none      null      local",
].join("\n");
const VETH = "ip -br link show type veth";
const VETH_OUT = ["veth3a1b2c@if11  UP             7e:2f:90:11:aa:5c <BROADCAST,MULTICAST,UP,LOWER_UP>", "vethc4d5e6@if13  UP             3a:91:0c:d4:e7:2b <BROADCAST,MULTICAST,UP,LOWER_UP>"].join("\n");
const BRCTL = "bridge link show";
const BRCTL_OUT = ["12: veth3a1b2c@if11: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master docker0 state forwarding priority 32 cost 2", "14: vethc4d5e6@if13: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master docker0 state forwarding priority 32 cost 2"].join("\n");
const POST = "sudo iptables -t nat -S POSTROUTING";
const POST_OUT = ["-P POSTROUTING ACCEPT", "-A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE"].join("\n");
const PING_API = "docker exec web ping -c 1 172.17.0.3";
const PING_API_OUT = ["PING 172.17.0.3 (172.17.0.3): 56 data bytes", "64 bytes from 172.17.0.3: seq=0 ttl=64 time=0.094 ms", "", "--- 172.17.0.3 ping statistics ---", "1 packets transmitted, 1 packets received, 0% packet loss"].join("\n");
const RUN_HOST = "docker run -d --network host --name metrics prom/node-exporter";
const SS_HOST = "ss -ltn sport = :9100";
const SS_HOST_OUT = ["State   Recv-Q  Send-Q   Local Address:Port   Peer Address:Port", "LISTEN  0       4096                 *:9100              *:*"].join("\n");
const RUN_NONE = "docker run -d --network none --name batch loja/batch:1.0";
const IP_NONE = "docker exec batch cat /proc/net/dev";
const IP_NONE_OUT = [
  "Inter-|   Receive                                                |  Transmit",
  " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
  "    lo:       0       0    0    0    0     0          0         0        0       0    0    0    0     0       0          0",
].join("\n");

export const redesBridgeHostNone: SceneDef = {
  title: "Redes no Docker: bridge, host e none",
  summary: "Veja a bridge docker0 ligar containers por pares veth, sair para a internet com NAT, e os dois extremos: a rede do host e nenhuma rede.",
  shell: "docker",
  goals: [
    { text: "Entender o que é a docker0 e o par veth", step: 3 },
    { text: "Ver como o container sai para a internet (NAT)", step: 5 },
    { text: "Saber quando usar host e none", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um host",
      title: "O host tem uma interface, e os containers precisam de rede",
      body: [
        "O host tem uma placa, a `eth0`, com o IP `203.0.113.10`, e fala com a internet. Cada container novo tem o seu próprio **net namespace** (aula 2): sem interface alguma até que o Docker ligue uma.",
        "O Docker oferece alguns **drivers de rede**. Os três embutidos mais simples: `bridge` (o padrão), `host` e `none`.",
      ],
      metrics: m8("sem bridge", "-"),
      terminal: { suggest: [NET_LS], outputs: { [NET_LS]: NET_LS_OUT } },
      focus: ["eth0", "net"],
      stage: { mode: "iso", entities: entidades8({}), links: [link("eth0", "net")] },
    },
    {
      kind: "conceito",
      nav: "docker0",
      title: "A docker0 é um switch virtual dentro do host",
      body: [
        "Quando o daemon sobe, cria a **bridge `docker0`** com a faixa `172.17.0.0/16` e o IP `172.17.0.1`. Uma bridge Linux faz o que o switch da aula de redes locais faz: aprende MACs e encaminha quadros entre as portas dela.",
        "Ela também é o **gateway** dos containers. Cada container ligado receberá um IP desta faixa.",
      ],
      callout: { kind: "bom-saber", text: "Se a faixa 172.17.0.0/16 colide com a rede da empresa, mude-a com `bip` no daemon.json." },
      changes: ["+ docker0 172.17.0.1/16"],
      metrics: m8("bridge docker0", "-"),
      terminal: { suggest: [IP_BR], outputs: { [IP_BR]: IP_BR_OUT } },
      focus: ["br", "d0"],
      stage: { mode: "iso", entities: entidades8({ docker0: true }), links: [link("d0", "eth0", { style: "dashed" }), link("eth0", "net")] },
    },
    {
      kind: "conceito",
      nav: "Par veth",
      title: "Cada container entra por um par veth",
      body: [
        "Para ligar o container, o Docker cria um **par veth**, um cabo virtual de duas pontas. Uma ponta fica **dentro** do namespace do container, com o nome `eth0` e o IP `172.17.0.2`. A outra fica no host, **plugada na docker0**.",
        "Tudo o que entra por uma ponta sai pela outra. Os nomes `veth3a1b2c@if11` que você vê no host são essas pontas.",
      ],
      changes: ["+ container web 172.17.0.2", "+ par veth até a docker0"],
      cmd: "docker run -d --name web nginx:1.27",
      metrics: m8("bridge docker0", "namespace próprio"),
      terminal: { suggest: [VETH, BRCTL, "docker ps"], outputs: { [VETH]: "veth3a1b2c@if11  UP             7e:2f:90:11:aa:5c <BROADCAST,MULTICAST,UP,LOWER_UP>", [BRCTL]: "12: veth3a1b2c@if11: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master docker0 state forwarding priority 32 cost 2" } },
      focus: ["br", "web", "d0"],
      stage: { mode: "iso", entities: entidades8({ docker0: true, web: true, webStatus: "new" }), links: [link("web", "d0", { label: "veth" }), link("d0", "eth0", { style: "dashed" }), link("eth0", "net")] },
    },
    {
      kind: "conceito",
      nav: "Entre containers",
      title: "Containers na mesma bridge falam por IP",
      body: [
        "Um segundo container, `api`, recebe `172.17.0.3`. Os dois estão na **mesma sub-rede**, então o tráfego entre eles é L2: um ARP descobre o MAC e a docker0 encaminha o quadro, sem passar pelo roteamento do host.",
        "Na bridge padrão, o acesso é **só por IP**. Nomes de container não resolvem nela; é o assunto da próxima aula.",
      ],
      changes: ["+ container api 172.17.0.3", "tráfego web ↔ api pela docker0"],
      metrics: m8("bridge docker0", "namespace próprio"),
      terminal: { suggest: [PING_API, "docker ps"], outputs: { [PING_API]: PING_API_OUT } },
      focus: ["web", "api", "d0"],
      stage: {
        mode: "iso",
        entities: entidades8({ docker0: true, web: true, api: true }),
        links: [link("web", "d0", { label: "veth" }), link("api", "d0", { label: "veth" }), link("d0", "eth0", { style: "dashed" }), link("eth0", "net")],
        flows: [flow("web", "api", 2, { via: ["d0"], kind: "data" })],
      },
    },
    {
      kind: "conceito",
      nav: "Saída com NAT",
      title: "Para a internet, o host faz NAT",
      body: [
        "O IP `172.17.0.2` é privado e não existe na internet. Quando o container acessa uma API externa, o pacote vai à docker0, atravessa o host e, em `POSTROUTING`, uma regra **MASQUERADE** troca a origem por `203.0.113.10`.",
        "É o NAT da aula 8 de redes, feito pelo próprio kernel do host. A resposta volta pela tabela de conexões (*conntrack*) e é entregue ao container certo.",
      ],
      changes: ["+ NAT de saída (MASQUERADE)"],
      metrics: m8("bridge docker0", "saída com NAT"),
      terminal: { suggest: [POST], outputs: { [POST]: POST_OUT } },
      focus: ["web", "d0", "eth0", "net"],
      stage: {
        mode: "iso",
        entities: entidades8({ docker0: true, web: true, api: true }),
        links: [link("web", "d0"), link("api", "d0"), link("d0", "eth0", { style: "dashed" }), link("eth0", "net")],
        flows: [flow("web", "net", 2, { via: ["d0", "eth0"] })],
      },
    },
    {
      kind: "tradeoff",
      nav: "Rede host",
      title: "--network host: sem isolamento, sem NAT",
      body: [
        "Com `--network host`, o container **não ganha namespace de rede**: usa a pilha do host, as mesmas interfaces e portas. Sem veth, sem NAT e sem o custo dele; o processo escuta direto em `:9100` do host.",
        "O preço é o **isolamento**: duas aplicações não podem usar a mesma porta, e o container enxerga a rede do host inteira. Em Docker Desktop, o \"host\" é a VM Linux, não o seu notebook.",
      ],
      callout: { kind: "atencao", text: "Host network só tem o efeito pleno em Linux. Em Mac e Windows, a porta abre na VM, não no seu sistema." },
      changes: ["+ metrics direto na eth0 do host"],
      cmd: RUN_HOST,
      metrics: m8("host", "nenhum", "warn"),
      terminal: { suggest: [RUN_HOST, SS_HOST], outputs: { [RUN_HOST]: "5d7a0c2e4b9f1a3c5e7d9b1f3a5c7e9d0b2f4a6c8e1d3b5f7a9c0e2d4b6f8a1c", [SS_HOST]: SS_HOST_OUT } },
      focus: ["metrics", "eth0"],
      stage: {
        mode: "iso",
        entities: entidades8({ docker0: true, web: true, api: true, host: true }),
        links: [link("metrics", "eth0"), link("d0", "eth0", { style: "dashed" }), link("eth0", "net"), link("web", "d0"), link("api", "d0")],
      },
    },
    {
      kind: "conceito",
      nav: "Rede none",
      title: "--network none: só o loopback",
      body: [
        "Com `--network none`, o container tem o namespace de rede, mas só o **loopback** (`lo`). Nada entra nem sai: serve para tarefas que processam arquivos sem tocar na rede, e é uma barreira simples de exfiltração de dados.",
        "Qualquer rede pode ser adicionada depois com `docker network connect`. A lista de redes embutidas é a que `docker network ls` mostra.",
      ],
      changes: ["+ container batch sem rede"],
      cmd: RUN_NONE,
      metrics: m8("none", "total", "ok"),
      terminal: { suggest: [IP_NONE, NET_LS], outputs: { [RUN_NONE]: "e19c4a7b2d5f8031c6e9a2b4d7f0135c8e1a4b7d0f3c6e9a2b5d8f1c4e7a0b3d", [IP_NONE]: IP_NONE_OUT, [NET_LS]: NET_LS_OUT } },
      focus: ["batch"],
      stage: {
        mode: "iso",
        entities: entidades8({ docker0: true, web: true, api: true, host: true, none: true }),
        links: [link("metrics", "eth0"), link("d0", "eth0", { style: "dashed" }), link("eth0", "net"), link("web", "d0"), link("api", "d0")],
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "A **bridge** liga containers por pares veth a um switch virtual (`docker0`) e usa NAT para sair. O **host** dispensa o isolamento e o NAT. O **none** remove a rede.",
        "A bridge padrão não resolve nomes. Para isso, e para isolar aplicações entre si, você cria uma rede definida pelo usuário, na próxima aula.",
      ],
      metrics: m8("bridge, host, none", "escolha por container", "ok"),
      terminal: { suggest: [NET_LS], outputs: { [NET_LS]: NET_LS_OUT } },
      focus: ["br", "metrics", "batch"],
      stage: {
        mode: "iso",
        entities: entidades8({ docker0: true, web: true, api: true, host: true, none: true }),
        links: [link("metrics", "eth0"), link("d0", "eth0", { style: "dashed" }), link("eth0", "net"), link("web", "d0"), link("api", "d0")],
      },
    },
  ],
};

// =====================================================================================
// Cena 9: redes definidas pelo usuário e DNS (iso)
// =====================================================================================

type Q9 = {
  br?: boolean;
  lj?: boolean;
  outra?: boolean;
  /** Onde estão api e db: na bridge padrão ou na rede loja. */
  where: "br" | "lj";
  dbIp?: string;
  dns?: boolean;
  ext?: boolean;
  web2Badges?: { text: string; tone?: Tone4 }[];
  apiStatus?: Status;
  dbStatus?: Status;
};

function entidades9(q: Q9): IsoEntity[] {
  const out: IsoEntity[] = [];
  if (q.br) out.push(zone("br", ...at(-9, 0), 5, 5, { label: "bridge (padrão)", tone: "sky", dashed: true }));
  if (q.outra) out.push(zone("outra", ...at(-9, 0), 5, 5, { label: "rede outra", tone: "violet", dashed: true }));
  if (q.lj) out.push(zone("lj", ...at(4, 0), 7, 7, { label: "rede loja 172.18.0.0/16", tone: "sky", dashed: true, status: q.where === "lj" ? undefined : "new" }));
  const inBr = q.where === "br";
  const parent = inBr ? "br" : "lj";
  const ipApi = inBr ? "172.17.0.2" : "172.18.0.2";
  const ipDb = q.dbIp ?? (inBr ? "172.17.0.3" : "172.18.0.3");
  const [au, av] = inBr ? [-2.4, 4] : [-3, 8];
  const [du, dv] = inBr ? [2.4, 4] : [3, 8];
  out.push(
    container("api", ...at(au, av), "api", { image: "loja/api:1.0", ip: ipApi, status: "Up 2 hours", age: "2 hours" }, { parent, status: q.apiStatus, badges: [{ text: ipApi, tone: "info" }] }),
    container("db", ...at(du, dv), "db", { image: "postgres:16", ip: ipDb, status: "Up 2 hours", age: "2 hours" }, { parent, status: q.dbStatus, badges: [{ text: ipDb, tone: "info" }] }),
  );
  if (q.dns) out.push(box("dns", ...at(0, 3.5), "search", "DNS embutido", { parent: "lj", size: "sm", tone: "violet", badges: [{ text: "127.0.0.11", tone: "info" }] }));
  if (q.ext) out.push(box("ext", ...at(15, 7), "cloud", "DNS do host", { size: "md", tone: "zinc" }));
  if (q.outra) out.push(container("web2", ...at(0, 4), "web2", { image: "nginx:1.27", ip: "172.19.0.2", status: "Up 1 minute", age: "1 minute" }, { parent: "outra", badges: q.web2Badges ?? [{ text: "172.19.0.2", tone: "info" }] }));
  return out;
}

const m9 = (a: string, b: string, tone?: Metric["tone"]): Metric[] => [
  { id: "a", label: "api acha o db por nome?", value: a, tone },
  { id: "b", label: "Rede", value: b },
];

const PING_NAME = "docker exec api ping -c 1 db";
const PING_NAME_FAIL = "ping: bad address 'db'";
const GETENT = "docker exec api getent hosts db";
const RESOLV = "docker exec api cat /etc/resolv.conf";
const RESOLV_OUT = ["nameserver 127.0.0.11", "options ndots:0"].join("\n");
const NET_CREATE = "docker network create loja";
const NET_INSPECT = "docker network inspect loja --format '{{(index .IPAM.Config 0).Subnet}}'";
const RUN_LJ = "docker run -d --network loja --name db postgres:16";
const CONNECT = "docker network connect loja web2";
const PING_WEB2 = "docker exec web2 getent hosts db";

export const redesDefinidasPeloUsuario: SceneDef = {
  title: "Redes definidas pelo usuário e DNS entre containers",
  summary: "Veja a api falhar ao achar o db pelo nome na bridge padrão, e funcionar numa rede criada por você, com o DNS embutido do Docker.",
  shell: "docker",
  goals: [
    { text: "Ver por que a bridge padrão não resolve nomes", step: 2 },
    { text: "Criar uma rede e ganhar DNS por nome", step: 4 },
    { text: "Entender o DNS embutido em 127.0.0.11", step: 5 },
    { text: "Isolar redes e conectar quando for preciso", step: 8 },
  ],
  steps: [
    {
      kind: "problema",
      nav: "Sem DNS",
      title: "Na bridge padrão, o nome db não existe",
      body: [
        "A `api` foi configurada com `jdbc:postgresql://db:5432/loja`. Os dois containers estão na **bridge padrão**, mas nela o Docker **não resolve nomes de container**. O DNS da JVM pergunta ao resolvedor do host, que nunca ouviu falar de `db`.",
        "O resultado é uma `UnknownHostException: db`, mesmo com os dois containers vivos, a poucos centímetros de distância virtual.",
      ],
      callout: { kind: "atencao", text: "Na bridge padrão só funciona IP. Resolução por nome é um recurso das redes definidas pelo usuário." },
      metrics: m9("não", "bridge padrão", "bad"),
      terminal: { suggest: [PING_NAME, "docker ps"], outputs: { [PING_NAME]: PING_NAME_FAIL } },
      focus: ["api", "db"],
      stage: { mode: "iso", entities: entidades9({ br: true, where: "br" }), flows: [flow("api", "db", 2, { kind: "bad" })] },
    },
    {
      kind: "problema",
      nav: "IP fixo",
      title: "Usar o IP funciona, até o IP mudar",
      body: [
        "A saída rápida é configurar a `api` com o IP do `db` (`172.17.0.3`). Funciona hoje. Se o `db` for recriado, o Docker atribui **um IP livre** da faixa, que pode ser outro: a `api` continua apontando para um endereço que já não é do banco, ou é de outro container.",
        "O IP é um **detalhe de execução**, e não uma identidade estável. O `--link` resolvia nomes, mas é um recurso legado e não deve ser usado em projetos novos.",
      ],
      changes: ["db recriado com 172.17.0.4", "api ainda aponta para 172.17.0.3"],
      metrics: m9("só por IP", "bridge padrão", "warn"),
      focus: ["api", "db"],
      stage: { mode: "iso", entities: entidades9({ br: true, where: "br", dbIp: "172.17.0.4", dbStatus: "warn" }), flows: [flow("api", "db", 2, { kind: "bad" })] },
    },
    {
      kind: "solucao",
      nav: "Nova rede",
      title: "Crie uma rede e use --network",
      body: [
        "`docker network create loja` cria uma **bridge definida pelo usuário**, com a próxima faixa livre (aqui `172.18.0.0/16`) e a sua própria interface no host. Os containers que entram nela, com `--network loja`, ganham IPs dela.",
        "É a forma recomendada de ligar aplicações: uma rede por sistema, e cada container entra só nas redes de que precisa.",
      ],
      cmd: NET_CREATE,
      changes: ["+ rede loja (172.18.0.0/16)", "api e db movidos para ela"],
      metrics: m9("ainda não testado", "loja", "warn"),
      terminal: { suggest: [NET_CREATE, NET_INSPECT, RUN_LJ], outputs: { [NET_CREATE]: "a84b1d7e5c06f2d3a9b8c7e6d5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6", [NET_INSPECT]: "172.18.0.0/16", [RUN_LJ]: "c2d4e6f8a0b1c3d5e7f9a1b2c4d6e8f0a2b3c5d7e9f1a3b4c6d8e0f2a4b5c7d9" } },
      focus: ["lj", "api", "db"],
      stage: { mode: "iso", entities: entidades9({ lj: true, where: "lj" }), links: [link("api", "db", { style: "dashed" })] },
    },
    {
      kind: "conceito",
      nav: "DNS embutido",
      title: "O Docker responde às consultas em 127.0.0.11",
      body: [
        "Nas redes definidas pelo usuário, o `/etc/resolv.conf` do container aponta para **127.0.0.11**: um **servidor DNS embutido** no daemon. Ele responde nomes de containers e aliases da própria rede (`db` vira `172.18.0.3`) e encaminha o resto ao resolvedor do host.",
        "A `api` pergunta pelo nome do container (ou por `--network-alias`) e recebe o IP atual. É o mesmo protocolo DNS da aula 17 de redes, com um servidor que conhece só os containers da rede.",
      ],
      callout: { kind: "chave", text: "O DNS embutido só enxerga os containers das redes em que quem pergunta está conectado." },
      changes: ["+ DNS embutido 127.0.0.11", "db: 172.18.0.3"],
      metrics: m9("sim", "loja", "ok"),
      terminal: { suggest: [GETENT, RESOLV], outputs: { [GETENT]: "172.18.0.3        db  db", [RESOLV]: RESOLV_OUT } },
      focus: ["api", "dns", "db"],
      stage: { mode: "iso", entities: entidades9({ lj: true, where: "lj", dns: true }), links: [link("api", "db", { style: "dashed" })], flows: [flow("api", "dns", 2, { kind: "hc" })] },
    },
    {
      kind: "solucao",
      nav: "Nome estável",
      title: "O nome sobrevive à recriação do container",
      body: [
        "Se o `db` for recriado e ganhar `172.18.0.4`, o DNS embutido passa a devolver o IP novo na próxima consulta. A `api` continua usando **`db`** na URL, e o endereço certo é descoberto em cada resolução.",
        "Cuidado com o cache de DNS da JVM, que é o assunto do código desta aula: um TTL alto mantém o IP velho por mais tempo do que o ideal.",
      ],
      changes: ["db recriado: 172.18.0.4", "a api acha o novo IP pelo nome"],
      metrics: m9("sim", "loja", "ok"),
      terminal: { suggest: [GETENT], outputs: { [GETENT]: "172.18.0.4        db  db" } },
      focus: ["api", "db"],
      stage: { mode: "iso", entities: entidades9({ lj: true, where: "lj", dns: true, dbIp: "172.18.0.4", dbStatus: "new" }), links: [link("api", "db", { style: "dashed" })], flows: [flow("api", "db", 3, {})] },
    },
    {
      kind: "conceito",
      nav: "Nomes externos",
      title: "O que não é container vai ao DNS do host",
      body: [
        "Para um nome que não é de container, como `api.exemplo.com`, o DNS embutido **encaminha a consulta** ao resolvedor que o daemon herdou do host (`/etc/resolv.conf` ou o `--dns`). A resposta volta pelo mesmo caminho.",
        "Quando um serviço externo falha só dentro do container, o suspeito é este caminho: o DNS do host inacessível por causa de VPN ou de um resolvedor local em `127.0.0.53`.",
      ],
      changes: ["+ consulta encaminhada ao DNS do host"],
      metrics: m9("sim", "loja", "ok"),
      focus: ["api", "dns", "ext"],
      stage: { mode: "iso", entities: entidades9({ lj: true, where: "lj", dns: true, ext: true }), links: [link("api", "db", { style: "dashed" })], flows: [flow("api", "ext", 2, { via: ["dns"], kind: "hc", label: "api.exemplo.com" })] },
    },
    {
      kind: "problema",
      nav: "Isolamento",
      title: "Redes diferentes não se enxergam",
      body: [
        "Um container `web2` numa **segunda rede** (`outra`) não alcança o `db`: não há rota entre as redes, e o DNS embutido de uma rede não conhece os containers da outra. É a garantia de isolamento do Docker.",
        "Use redes para separar camadas: o banco numa rede só da aplicação, e só o proxy na rede que o mundo acessa.",
      ],
      callout: { kind: "bom-saber", text: "Uma rede por aplicação evita que um container alcance bancos de projetos que não são dele." },
      changes: ["+ rede outra com web2", "web2 → db: sem rota"],
      metrics: m9("não, de outra rede", "outra ≠ loja", "bad"),
      terminal: { suggest: [PING_WEB2], outputs: { [PING_WEB2]: "" } },
      focus: ["web2", "db"],
      stage: { mode: "iso", entities: entidades9({ lj: true, outra: true, where: "lj", dns: true }), flows: [flow("web2", "db", 2, { kind: "bad" })] },
    },
    {
      kind: "solucao",
      nav: "network connect",
      title: "docker network connect: um container em duas redes",
      body: [
        "`docker network connect loja web2` acrescenta uma segunda interface ao `web2`, agora também na rede `loja`, com um IP dela. Ele alcança o `db` por nome e continua na rede `outra`.",
        "É assim que um proxy fica nas duas pontas: na rede pública e na rede privada da aplicação. `docker network disconnect` desfaz.",
      ],
      cmd: CONNECT,
      changes: ["web2: 2 redes (172.19.0.2 e 172.18.0.4)", "web2 → db: ok"],
      metrics: m9("sim, via 2ª rede", "outra + loja", "ok"),
      terminal: { suggest: [CONNECT, PING_WEB2], outputs: { [CONNECT]: "", [PING_WEB2]: "172.18.0.3        db  db" } },
      focus: ["web2", "db"],
      stage: {
        mode: "iso",
        entities: entidades9({ lj: true, outra: true, where: "lj", dns: true, web2Badges: [{ text: "172.19.0.2", tone: "info" }, { text: "172.18.0.4", tone: "ok" }] }),
        flows: [flow("web2", "db", 2, {})],
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "Na **bridge padrão** só há IP e o IP muda. Numa **rede definida pelo usuário**, o DNS embutido em `127.0.0.11` resolve nomes e aliases, e o isolamento entre redes é garantido.",
        "Regra prática: crie uma rede por aplicação, use nomes em vez de IPs e use `network connect` para os poucos containers que precisam atravessar redes.",
      ],
      metrics: m9("sim", "uma rede por app", "ok"),
      focus: ["lj", "api", "db"],
      stage: { mode: "iso", entities: entidades9({ lj: true, outra: true, where: "lj", dns: true, web2Badges: [{ text: "172.19.0.2", tone: "info" }, { text: "172.18.0.4", tone: "ok" }] }) },
    },
  ],
};

// =====================================================================================
// Cena 10: publicação de portas, iptables e macvlan (iso)
// =====================================================================================

type Q10 = {
  ipt?: boolean;
  proxy?: boolean;
  local?: boolean;
  ufw?: boolean;
  webBadge?: string;
  webStatus?: Status;
  ethBadge?: string;
  usersStatus?: Status;
};

function entidades10(q: Q10): IsoEntity[] {
  const out: IsoEntity[] = [
    users("cli", ...at(-13, 8), 3, "clientes", { status: q.usersStatus }),
    box("eth0", ...at(-6, 8), "network", "eth0", { size: "md", tone: "ember", badges: [{ text: q.ethBadge ?? "203.0.113.10", tone: "info" }] }),
    container("web", ...at(8, 8), "web", { image: "nginx:1.27", ip: "172.17.0.2", status: "Up 3 minutes", ports: q.ipt ? "0.0.0.0:8080->80/tcp" : "80/tcp", age: "3 minutes" }, { status: q.webStatus, badges: [{ text: q.webBadge ?? "172.17.0.2:80", tone: q.webStatus === "bad" ? "bad" : "info" }] }),
  ];
  if (q.ipt) out.push(box("ipt", ...at(1, 8), "shield", "iptables nat", { size: "md", tone: "arcane", badges: [{ text: "DNAT 8080 → 80", tone: "info" }] }));
  if (q.proxy) out.push(box("proxy", ...at(1, 15), "cog", "docker-proxy", { size: "sm", tone: "violet" }));
  if (q.local) out.push(box("lo", ...at(-6, 15), "terminal", "localhost", { size: "sm", tone: "mana" }));
  if (q.ufw) out.push(box("ufw", ...at(-11, 2), "shield", "ufw", { size: "sm", tone: "rose", badges: [{ text: "deny 8080", tone: "bad" }] }));
  return out;
}

const m10 = (a: string, b: string, tone?: Metric["tone"]): Metric[] => [
  { id: "a", label: "Porta 8080 do host", value: a },
  { id: "b", label: "Quem alcança", value: b, tone },
];

const RUN_P = "docker run -d --name web -p 8080:80 nginx:1.27";
const NAT_LIST = "sudo iptables -t nat -S DOCKER";
const NAT_LIST_OUT = ["-N DOCKER", "-A DOCKER ! -i docker0 -p tcp -m tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80"].join("\n");
const DOCKER_PORT = "docker port web";
const DOCKER_PORT_OUT = "80/tcp -> 0.0.0.0:8080\n80/tcp -> [::]:8080";
const CONNTRACK = "sudo conntrack -L -p tcp --dport 8080";
const CONNTRACK_OUT = "tcp      6 431996 ESTABLISHED src=198.51.100.7 dst=203.0.113.10 sport=51514 dport=8080 src=172.17.0.2 dst=198.51.100.7 sport=80 dport=51514 [ASSURED] mark=0 use=1";
const PS_PROXY = "ps -ef | grep docker-proxy";
const PS_PROXY_OUT = "root  5120  1190  /usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8080 -container-ip 172.17.0.2 -container-port 80";
const UFW = "sudo ufw status";
const UFW_OUT = ["Status: active", "", "To                         Action      From", "--                         ------      ----", "22/tcp                     ALLOW       Anywhere", "8080/tcp                   DENY        Anywhere"].join("\n");
const CURL_EXT = "curl -sI http://203.0.113.10:8080";
const CURL_EXT_OUT = ["HTTP/1.1 200 OK", "Server: nginx/1.27.2", "Content-Type: text/html"].join("\n");
const RUN_LO = "docker run -d --name web -p 127.0.0.1:8080:80 nginx:1.27";
const DOCKER_USER = "sudo iptables -I DOCKER-USER -i eth0 ! -s 198.51.100.0/24 -p tcp --dport 80 -j DROP";

// ---------- macvlan ----------

type Q10b = { mac0?: boolean; hostBad?: boolean; extra?: boolean };

function entidadesMac(q: Q10b): IsoEntity[] {
  const out: IsoEntity[] = [
    box("gw", ...at(-8, 0), "router", "roteador", { size: "md", tone: "ember", badges: [{ text: "192.0.2.1", tone: "info" }] }),
    box("nb", ...at(8, 0), "globe", "notebook", { size: "md", tone: "mana", badges: [{ text: "192.0.2.30", tone: "info" }] }),
    box("sw", ...at(0, 6.5), "network", "switch da LAN", { size: "md", tone: "sky" }),
    box("host", ...at(-7, 13), "server", "host", { size: "md", tone: "zinc", badges: [{ text: "eth0 192.0.2.10", tone: "info" }] }),
    container("web", ...at(7, 13), "web", { image: "nginx:1.27", ip: "192.0.2.50", status: "Up 2 minutes", ports: "80/tcp", age: "2 minutes" }, { status: "new", badges: [{ text: "192.0.2.50", tone: "ok" }, { text: "MAC próprio", tone: "info" }] }),
  ];
  if (q.mac0) out.push(box("mac0", ...at(0, 19.5), "network", "mac0", { size: "sm", tone: "rune", status: "new", badges: [{ text: "macvlan do host", tone: "info" }] }));
  return out;
}
const linksMac = [link("gw", "sw"), link("nb", "sw"), link("host", "sw"), link("web", "sw")];

export const portasIptablesMacvlan: SceneDef = {
  title: "Publicação de portas, iptables e macvlan",
  summary: "Veja o `-p 8080:80` virar uma regra DNAT, a regra furar o UFW, e o macvlan dar a um container um IP próprio na rede física.",
  shell: "docker",
  goals: [
    { text: "Ver o -p virar DNAT no iptables", step: 2 },
    { text: "Entender o docker-proxy e o caso do localhost", step: 4 },
    { text: "Saber por que o UFW não protege portas publicadas", step: 5 },
    { text: "Usar macvlan e conhecer o limite host ↔ container", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Sem -p",
      title: "Sem publicar, o container não é alcançável de fora",
      body: [
        "O `web` escuta na porta 80 do **seu** namespace, no IP `172.17.0.2`, que é privado e só existe dentro do host. Os clientes da internet só conhecem o `203.0.113.10`, e nada escuta na porta 8080 dele.",
        "Para o mundo alcançar o container, é preciso criar um caminho do IP do host até o IP do container. É para isso que existe a opção `-p`.",
      ],
      metrics: m10("ninguém escuta", "ninguém", "bad"),
      focus: ["cli", "eth0", "web"],
      stage: { mode: "iso", entities: entidades10({}), links: [link("cli", "eth0"), link("eth0", "web", { style: "dashed" })], flows: [flow("cli", "eth0", 2, { kind: "bad", label: ":8080 recusado" })] },
    },
    {
      kind: "conceito",
      nav: "-p vira DNAT",
      title: "-p 8080:80 cria uma regra DNAT",
      body: [
        "Com `-p 8080:80`, o Docker acrescenta na tabela `nat`, chain `DOCKER`, uma regra **DNAT**: o destino `203.0.113.10:8080` vira `172.17.0.2:80`. Ela é aplicada em `PREROUTING`, antes de o kernel decidir para onde o pacote vai.",
        "É o **port forwarding** da aula 8 de redes: NAT de destino, ao contrário do MASQUERADE de saída. O pacote destinado ao host é reescrito e encaminhado para o container.",
      ],
      callout: { kind: "chave", text: "Publicar uma porta não abre nada no container: é uma reescrita de destino feita pelo iptables do host." },
      cmd: RUN_P,
      changes: ["+ regra DNAT 8080 → 172.17.0.2:80"],
      metrics: m10("DNAT → container", "qualquer origem", "warn"),
      terminal: { suggest: [RUN_P, NAT_LIST, DOCKER_PORT], outputs: { [RUN_P]: "7a9c1e3f5b2d4a6c8e0f2b4d6a8c0e1f3b5d7a9c1e3f5b7d9a1c3e5f7b9d1a3c", [NAT_LIST]: NAT_LIST_OUT, [DOCKER_PORT]: DOCKER_PORT_OUT } },
      focus: ["cli", "eth0", "ipt", "web"],
      stage: { mode: "iso", entities: entidades10({ ipt: true }), links: [link("cli", "eth0"), link("eth0", "ipt"), link("ipt", "web")], flows: [flow("cli", "web", 3, { via: ["eth0", "ipt"] })] },
    },
    {
      kind: "conceito",
      nav: "A resposta",
      title: "A resposta volta sem regra extra",
      body: [
        "O kernel registra a tradução no **conntrack**. Quando o `nginx` responde de `172.17.0.2:80`, o pacote é comparado com a entrada e a origem volta a ser `203.0.113.10:8080` antes de sair. O cliente nunca vê o IP do container.",
        "A tabela de conexões é finita e as entradas expiram. É o mesmo mecanismo (e os mesmos limites) do NAT que você viu em redes: milhares de conexões simultâneas ocupam memória do conntrack.",
      ],
      changes: ["resposta restaurada pelo conntrack"],
      metrics: m10("DNAT → container", "qualquer origem", "warn"),
      terminal: { suggest: [CONNTRACK], outputs: { [CONNTRACK]: CONNTRACK_OUT } },
      focus: ["cli", "ipt", "web"],
      stage: { mode: "iso", entities: entidades10({ ipt: true }), links: [link("cli", "eth0"), link("eth0", "ipt"), link("ipt", "web")], flows: [flow("web", "cli", 3, { via: ["ipt", "eth0"], kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "docker-proxy",
      title: "O docker-proxy cobre o tráfego do próprio host",
      body: [
        "O DNAT em `PREROUTING` não vale para pacotes **gerados no próprio host**, como `curl localhost:8080`: eles não passam por esse hook. Para esses, o Docker mantém um processo, o **docker-proxy** (*userland proxy*), escutando na porta publicada e repassando ao container.",
        "Há um processo por porta publicada. Ele pode ser desligado com `\"userland-proxy\": false` no daemon, quando o iptables basta para o caso de uso.",
      ],
      changes: ["+ docker-proxy para o tráfego local"],
      metrics: m10("DNAT + docker-proxy", "externos e locais", "warn"),
      terminal: { suggest: [PS_PROXY], outputs: { [PS_PROXY]: PS_PROXY_OUT } },
      focus: ["lo", "proxy", "web"],
      stage: { mode: "iso", entities: entidades10({ ipt: true, proxy: true, local: true }), links: [link("cli", "eth0"), link("eth0", "ipt"), link("ipt", "web"), link("lo", "proxy"), link("proxy", "web", { style: "dashed" })], flows: [flow("lo", "web", 2, { via: ["proxy"], kind: "data" })] },
    },
    {
      kind: "problema",
      nav: "Fura o UFW",
      title: "A porta publicada ignora o UFW",
      body: [
        "O Docker escreve as próprias regras no iptables, nas chains `nat` e `FORWARD`, antes das regras do UFW. O tráfego publicado é **encaminhado** (vai para o container), e o UFW controla `INPUT`, o tráfego para o próprio host.",
        "Resultado: o `ufw deny 8080` aparece como ativo e a porta continua aberta para o mundo. É um dos problemas mais conhecidos do Docker em servidores expostos.",
      ],
      callout: { kind: "atencao", text: "Regra de firewall do host (UFW, firewalld) não bloqueia portas publicadas pelo Docker. Use a chain DOCKER-USER." },
      changes: ["ufw nega 8080, mas o acesso passa"],
      metrics: m10("aberta", "internet inteira", "bad"),
      terminal: { suggest: [UFW, CURL_EXT], outputs: { [UFW]: UFW_OUT, [CURL_EXT]: CURL_EXT_OUT } },
      focus: ["ufw", "eth0", "web"],
      stage: { mode: "iso", entities: entidades10({ ipt: true, ufw: true, webStatus: "bad", webBadge: "exposto" }), links: [link("cli", "eth0"), link("eth0", "ipt"), link("ipt", "web"), link("ufw", "eth0", { style: "dashed" })], flows: [flow("cli", "web", 3, { via: ["eth0", "ipt"], kind: "bad", label: "passou" })] },
    },
    {
      kind: "solucao",
      nav: "Limitar a origem",
      title: "Publique só onde precisa: 127.0.0.1 ou DOCKER-USER",
      body: [
        "A forma mais simples é publicar **só no loopback**: `-p 127.0.0.1:8080:80`. A regra DNAT passa a valer só para destino `127.0.0.1`, e um proxy reverso no mesmo host faz a ponte com o mundo.",
        "Quando a porta precisa ficar aberta para alguns, as regras do usuário vão na chain **`DOCKER-USER`**, que o Docker consulta antes das próprias regras e nunca reescreve.",
      ],
      cmd: RUN_LO,
      changes: ["porta presa em 127.0.0.1", "internet: sem acesso"],
      metrics: m10("só 127.0.0.1", "o próprio host", "ok"),
      terminal: { suggest: [RUN_LO, DOCKER_USER], outputs: { [RUN_LO]: "8d2f4a6c8e0b1d3f5a7c9e1b3d5f7a9c0e2b4d6f8a1c3e5b7d9f1a3c5e7b9d0f", [DOCKER_USER]: "" } },
      focus: ["cli", "eth0", "web"],
      stage: { mode: "iso", entities: entidades10({ ipt: true, ethBadge: "127.0.0.1:8080", usersStatus: "muted" }), links: [link("cli", "eth0", { style: "dashed" }), link("eth0", "ipt"), link("ipt", "web")], flows: [flow("cli", "eth0", 2, { kind: "bad", label: "sem acesso" })] },
    },
    {
      kind: "conceito",
      nav: "macvlan",
      title: "macvlan: o container ganha um IP na LAN",
      body: [
        "Com o driver **macvlan**, o container recebe **um MAC e um IP da própria rede física** (`192.0.2.50`), pendurado na interface do host (`-o parent=eth0`). Sem bridge, sem NAT e sem `-p`: ele é um participante da LAN, como o notebook e o roteador.",
        "É útil para software legado que exige um IP próprio na rede, ou para monitoração que precisa enxergar a LAN. O preço: o switch passa a ver **vários MACs** numa mesma porta, e ambientes que limitam isso (nuvem, Wi-Fi, port security) não funcionam.",
      ],
      cmd: "docker network create -d macvlan --subnet 192.0.2.0/24 --gateway 192.0.2.1 -o parent=eth0 lan",
      changes: ["+ container com MAC e IP na LAN", "sem NAT e sem -p"],
      metrics: m10("sem -p", "toda a LAN", "ok"),
      terminal: { suggest: ["docker network ls"], outputs: { "docker network ls": ["NETWORK ID     NAME      DRIVER    SCOPE", "1f9d3a5c7b21   bridge    bridge    local", "6c0e8a2d4f93   host      host      local", "d41a7c9e2b58   lan       macvlan   local", "a84b1d7e5c06   none      null      local"].join("\n") } },
      focus: ["sw", "web", "nb"],
      stage: { mode: "iso", entities: entidadesMac({}), links: linksMac, flows: [flow("nb", "web", 3, { via: ["sw"] })] },
    },
    {
      kind: "problema",
      nav: "Host não alcança",
      title: "O host não fala com os containers macvlan",
      body: [
        "Por desenho do kernel, o tráfego entre a interface **pai** (`eth0`) e as sub-interfaces macvlan **não é entregue**: o host não alcança os containers macvlan pela `eth0`, embora o notebook alcance sem problema.",
        "É um erro clássico: o container responde para todo mundo, menos para o host que o criou, e a causa parece ser firewall.",
      ],
      callout: { kind: "atencao", text: "Container macvlan e host pela mesma interface pai não se comunicam. Crie uma interface macvlan auxiliar no host." },
      changes: ["host → web: sem resposta", "notebook → web: ok"],
      metrics: m10("-", "LAN, menos o host", "warn"),
      terminal: { suggest: ["ping -c 1 192.0.2.50"], outputs: { "ping -c 1 192.0.2.50": ["PING 192.0.2.50 (192.0.2.50) 56(84) bytes of data.", "From 192.0.2.10 icmp_seq=1 Destination Host Unreachable", "", "--- 192.0.2.50 ping statistics ---", "1 packets transmitted, 0 received, +1 errors, 100% packet loss, time 0ms"].join("\n") } },
      focus: ["host", "web", "nb"],
      stage: {
        mode: "iso",
        entities: entidadesMac({}),
        links: linksMac,
        flows: [flow("host", "web", 2, { kind: "bad", label: "sem resposta" }), flow("nb", "web", 2, { via: ["sw"] })],
      },
    },
    {
      kind: "solucao",
      nav: "Interface auxiliar",
      title: "Uma interface macvlan no host fecha o caminho",
      body: [
        "A solução é dar ao próprio host uma **interface macvlan** (`mac0`) no mesmo pai, com um IP livre da LAN e uma rota só para o container. Agora o host fala com ele por uma sub-interface, como qualquer outro participante da LAN.",
        "A configuração não é persistente: recrie `mac0` no boot (systemd-networkd ou NetworkManager). Em redes onde o macvlan não é possível, o **ipvlan** (que compartilha o MAC do host) é a alternativa, com a mesma restrição de falar com o host.",
      ],
      cmd: "sudo ip link add mac0 link eth0 type macvlan mode bridge",
      changes: ["+ mac0 no host", "host → web: ok"],
      metrics: m10("-", "LAN, inclusive o host", "ok"),
      terminal: {
        suggest: [
          "sudo ip link add mac0 link eth0 type macvlan mode bridge",
          "sudo ip addr add 192.0.2.60/32 dev mac0",
          "sudo ip link set mac0 up",
          "sudo ip route add 192.0.2.50/32 dev mac0",
          "ping -c 1 192.0.2.50",
        ],
        outputs: {
          "sudo ip link add mac0 link eth0 type macvlan mode bridge": "",
          "sudo ip addr add 192.0.2.60/32 dev mac0": "",
          "sudo ip link set mac0 up": "",
          "sudo ip route add 192.0.2.50/32 dev mac0": "",
          "ping -c 1 192.0.2.50": ["PING 192.0.2.50 (192.0.2.50) 56(84) bytes of data.", "64 bytes from 192.0.2.50: icmp_seq=1 ttl=64 time=0.31 ms", "", "--- 192.0.2.50 ping statistics ---", "1 packets transmitted, 1 received, 0% packet loss, time 0ms"].join("\n"),
        },
      },
      focus: ["host", "mac0", "web"],
      stage: { mode: "iso", entities: entidadesMac({ mac0: true }), links: [...linksMac, link("host", "mac0", { style: "dashed" })], flows: [flow("host", "web", 2, { via: ["mac0"], kind: "data" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "`-p` é **DNAT** no iptables mais um **docker-proxy** para o tráfego local, e ignora o UFW: restrinja com `127.0.0.1` ou com a chain `DOCKER-USER`.",
        "**macvlan** dá ao container um IP próprio na LAN, sem NAT. O host não o alcança pela interface pai sem uma `mac0` auxiliar.",
      ],
      metrics: m10("conforme o driver", "bridge: -p · macvlan: LAN", "ok"),
      focus: ["host", "mac0", "web"],
      stage: { mode: "iso", entities: entidadesMac({ mac0: true }), links: [...linksMac, link("host", "mac0", { style: "dashed" })] },
    },
  ],
};
