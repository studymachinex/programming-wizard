/**
 * Cena: Service e Ingress (modo isométrico, shell kubectl).
 * Chave de registro na Fase 0: cloud-devops/services-ingress-dns; definitiva: kubernetes/services-clusterip-nodeport-lb.
 */
import type { Badge, IsoBox, IsoEntity, IsoFlow, IsoLink, Metric, Resource, SceneDef, SceneStep, Status } from "../types";
import { flow, link, users } from "../kit/common";
import { ingress, kubeProxy, node, pod, service } from "../kit/k8s";

// ---------- cenário base ----------

const NODES = [node("n1", "node-1", 0, 0), node("n2", "node-2", 7, 0), node("n3", "node-3", 14, 0)];

function podRes(name: string, ip: string, nodeName: string, over: Partial<Resource> = {}): Omit<Resource, "kind"> {
  return { name, ip, node: nodeName, ready: "1/1", status: "Running", restarts: 0, age: "5d", ...over };
}

const info = (text: string): Badge => ({ text, tone: "info" });

const web = (): IsoBox => pod("web", "n1", "C", "web", podRes("web-5c7d9b6f4-h8j2d", "10.244.1.4", "node-1"), { tone: "mana", icon: "globe" });

/** Pod api original do node-1 (substituído no passo 2). */
const api1Old = (status?: Status, over: Partial<Resource> = {}): IsoBox =>
  pod("api-1", "n1", "A", "api-x2k9p", podRes("api-6d5f7c9b8-x2k9p", "10.244.1.7", "node-1", over), { status });
const api1New = (status?: Status, badges?: Badge[]): IsoBox =>
  pod("api-1b", "n1", "B", "api-m7q4w", podRes("api-6d5f7c9b8-m7q4w", "10.244.1.19", "node-1", { age: "40s" }), { status, badges });
const api2 = (o: { status?: Status; badges?: Badge[]; res?: Partial<Resource> } = {}): IsoBox =>
  pod("api-2", "n2", "A", "api-b8t2n", podRes("api-6d5f7c9b8-b8t2n", "10.244.2.5", "node-2", o.res), { status: o.status, badges: o.badges });
const api3 = (badges?: Badge[]): IsoBox => pod("api-3", "n3", "A", "api-k3v9z", podRes("api-6d5f7c9b8-k3v9z", "10.244.3.8", "node-3"), { badges });

const proxies = (status?: Status): IsoBox[] => [kubeProxy("kp1", "n1", "D", { status }), kubeProxy("kp2", "n2", "D", { status }), kubeProxy("kp3", "n3", "D", { status })];

const SVC_API_POS = { a: [4.1, -4.1], b: [6.97, -4.83] } as const;
const SVC_WEB_POS = [0.54, -1.96] as const;
const INGRESS_POS = [0.89, -7.32] as const;
const USERS_POS = [6.25, -10.5] as const;

function svcApi(pos: "a" | "b", o: { type?: string; ports?: string; badges?: Badge[]; status?: Status }): IsoBox {
  const [x, y] = SVC_API_POS[pos];
  return service("svc-api", x, y, "api", { type: o.type ?? "ClusterIP", ip: "10.96.0.20", ports: o.ports ?? "80/TCP", age: "2m" }, { badges: o.badges ?? [{ text: "ClusterIP 10.96.0.20", tone: "info" }], status: o.status });
}

const CLUSTER_IP = (): Badge => ({ text: "ClusterIP 10.96.0.20", tone: "info" });
const SELECTOR = (): Badge => info("selector app=api");

function stage(entities: IsoEntity[], links: IsoLink[] = [], flows: IsoFlow[] = []): SceneStep["stage"] {
  return { mode: "iso", entities: [...NODES, ...entities], links, flows };
}

// links e fluxos recorrentes
const toApis = (style: "solid" | "dashed", skip: string[] = []): IsoLink[] =>
  ["api-1b", "api-2", "api-3"].filter((id) => !skip.includes(id)).map((id) => link("svc-api", id, { style, tone: "violet" }));

const viaSvc = (ids: string[], o: Record<string, Partial<IsoFlow>> = {}): IsoFlow[] =>
  ids.map((id) => flow("web", id, 1, { via: ["svc-api"], ...o[id] }));

const fromSvc = (ids: string[]): IsoFlow[] => ids.map((id) => flow("svc-api", id, 1));

const m = (pods: number, endpoints: number, rps: number, err: number): Metric[] => [
  { id: "pods", label: "Pods da API", value: pods },
  { id: "eps", label: "Endpoints", value: endpoints, tone: endpoints < pods ? "warn" : undefined },
  { id: "rps", label: "Req/s", value: rps },
  { id: "err", label: "Erros", value: `${err}%`, tone: err > 0 ? "bad" : "ok" },
];

// ---------- saídas do terminal ----------

const EP3 = "10.244.1.19:8080,10.244.2.5:8080,10.244.3.8:8080";
const EP2 = "10.244.1.19:8080,10.244.3.8:8080";

function endpoints(eps: string): Record<string, string> {
  return {
    "kubectl get endpoints api": ["NAME   ENDPOINTS" + " ".repeat(Math.max(1, eps.length - 8)) + "   AGE", `api    ${eps}   2m`].join("\n"),
  };
}

function describeSvc(o: { type?: string; eps: string; nodePort?: boolean }): Record<string, string> {
  const lines = [
    "Name:                     api",
    "Namespace:                default",
    "Labels:                   app=api",
    "Selector:                 app=api",
    `Type:                     ${o.type ?? "ClusterIP"}`,
    "IP Family Policy:         SingleStack",
    "IP Families:              IPv4",
    "IP:                       10.96.0.20",
    "IPs:                      10.96.0.20",
    "Port:                     <unset>  80/TCP",
    "TargetPort:               8080/TCP",
    ...(o.nodePort ? ["NodePort:                <unset>  30080/TCP"] : []),
    `Endpoints:                ${o.eps}`,
    "Session Affinity:         None",
    "Events:                   <none>",
  ];
  return { "kubectl describe svc api": lines.join("\n") };
}

const GET_INGRESS = {
  "kubectl get ingress": ["NAME   CLASS   HOSTS         ADDRESS        PORTS   AGE", "loja   nginx   loja.com.br   203.0.113.20   80      1m"].join("\n"),
};

const PODS_CMD = "kubectl get pods -o wide";
const SVC_CMD = "kubectl get svc";

// ---------- a cena ----------

export const serviceEIngress: SceneDef = {
  title: "Service e Ingress: endereço fixo para pods que mudam",
  summary: "Do IP de um pod, que muda a cada recriação, até um Service estável e um Ingress que recebe o tráfego de fora.",
  shell: "kubectl",
  goals: [
    { text: "Entender por que não se usa o IP do pod", step: 2 },
    { text: "Usar um Service como nome fixo", step: 3 },
    { text: "Ver o Service desviar de pods doentes", step: 7 },
    { text: "Expor para fora com Ingress", step: 9 },
  ],
  steps: [
    // 1
    {
      kind: "contexto",
      nav: "O site chama a API",
      title: "O site chama a API",
      body: [
        "Dentro do cluster, o pod `web` precisa falar com a API. O jeito mais direto parece ser guardar o IP de um pod `api` e chamar esse endereço.",
        "Funciona: a linha do diagrama mostra o `web` chamando `10.244.1.7` e a taxa de erros está em zero. O problema aparece quando alguma coisa muda.",
      ],
      metrics: m(3, 0, 120, 0),
      terminal: { suggest: [PODS_CMD] },
      stage: stage([web(), api1Old(), api2(), api3()], [link("web", "api-1", { label: "10.244.1.7" })], [flow("web", "api-1", 2)]),
    },
    // 2
    {
      kind: "problema",
      nav: "O IP muda",
      title: "O pod morreu, o IP também",
      body: [
        "Pods são descartáveis. Quando o `api-x2k9p` é recriado, o Kubernetes sobe um pod novo, com outro IP (`10.244.1.19`). O antigo desaparece e leva o endereço junto.",
        "O `web` continua chamando o IP velho e as requisições se perdem. Atualizar o endereço na mão a cada recriação não escala: deploy, falha de node e autoscaling trocam pods o tempo todo.",
      ],
      callout: { kind: "atencao", text: "Nunca configure o IP de um pod em outro serviço. Ele só vale até o próximo restart." },
      metrics: m(3, 0, 120, 33),
      terminal: { suggest: [PODS_CMD, SVC_CMD] },
      stage: stage(
        [web(), api1Old("dead", { status: "Terminating", ready: "1/1" }), api1New("new"), api2(), api3()],
        [link("web", "api-1", { label: "10.244.1.7", tone: "rose" })],
        [flow("web", "api-1", 2, { kind: "bad" })],
      ),
    },
    // 3
    {
      kind: "solucao",
      nav: "Um nome fixo",
      title: "Service: um endereço que não muda",
      body: [
        "Um **Service** é um endereço virtual estável na frente dos pods. O `web` passa a chamar `api` (ClusterIP `10.96.0.20`) e o Kubernetes divide as chamadas entre os pods que existirem naquele momento.",
        "O pod antigo saiu de cena e ninguém precisou editar configuração. Os erros voltam a zero.",
      ],
      callout: { kind: "bom-saber", text: "O nome do Service também vira um registro DNS dentro do cluster: `api.default.svc.cluster.local`." },
      cmd: "kubectl expose deploy api --port=80 --target-port=8080",
      metrics: m(3, 3, 120, 0),
      terminal: { suggest: [SVC_CMD, "kubectl get endpoints api"], outputs: endpoints(EP3) },
      stage: stage(
        [web(), api1New(), api2(), api3(), svcApi("a", { status: "new" })],
        [link("web", "svc-api", { tone: "violet" }), ...toApis("solid")],
        viaSvc(["api-1b", "api-2", "api-3"]),
      ),
    },
    // 4
    {
      kind: "conceito",
      nav: "Labels",
      title: "Como o Service acha os pods",
      body: [
        "O Service não guarda uma lista de IPs escrita à mão. Ele tem um **selector** (`app=api`) e escolhe todo pod que carrega essa label.",
        "O Kubernetes mantém a lista de IPs desses pods num objeto chamado Endpoints. Pod novo com a label entra na lista; pod que some sai dela. Por isso o Service continua certo mesmo com os pods trocando.",
      ],
      changes: ["+ label app=api nos pods", "+ selector app=api no Service", "Links viram tracejados (seleção por label)"],
      callout: { kind: "chave", text: "A label é o contrato: quem tem `app=api` recebe tráfego do Service `api`." },
      metrics: m(3, 3, 120, 0),
      terminal: { suggest: ["kubectl describe svc api", "kubectl get endpoints api"], outputs: { ...describeSvc({ eps: EP3 }), ...endpoints(EP3) } },
      stage: stage(
        [web(), api1New(undefined, [info("app=api")]), api2({ badges: [info("app=api")] }), api3([info("app=api")]), svcApi("a", { badges: [CLUSTER_IP(), SELECTOR()] })],
        [link("web", "svc-api", { tone: "violet" }), ...toApis("dashed")],
        viaSvc(["api-1b", "api-2", "api-3"]),
      ),
    },
    // 5
    {
      kind: "conceito",
      nav: "Quem faz a mágica",
      title: "Não há um processo no meio",
      body: [
        "O ClusterIP não pertence a nenhuma máquina: é um IP virtual. Quem dá sentido a ele é o `kube-proxy`, que roda em cada node e acompanha o que o control plane publica sobre Services e Endpoints.",
        "Com essa informação ele programa regras no kernel (iptables ou IPVS). Quando o `web` envia um pacote para `10.96.0.20`, a regra reescreve o destino para o IP de um pod, ali mesmo no node de origem.",
      ],
      callout: { kind: "chave", text: "O Service não é um processo no caminho: é uma regra de reescrita de pacotes em cada node." },
      metrics: m(3, 3, 120, 0),
      terminal: { suggest: [PODS_CMD, SVC_CMD] },
      stage: stage(
        [web(), api1New(undefined, [info("app=api")]), api2({ badges: [info("app=api")] }), api3([info("app=api")]), svcApi("a", { badges: [CLUSTER_IP(), SELECTOR()] }), ...proxies("new")],
        [link("web", "svc-api", { tone: "violet" }), ...toApis("dashed")],
        viaSvc(["api-1b", "api-2", "api-3"]),
      ),
    },
    // 6
    {
      kind: "problema",
      nav: "Pod doente",
      title: "Um pod perde o banco",
      body: [
        "O `api-b8t2n` perdeu a conexão com o banco de dados. O processo continua de pé, mas toda requisição que chega a ele falha.",
        "O `kubelet` testa o pod com a readiness probe e enxerga a falha, mas leva alguns ciclos de teste até agir. Nesse intervalo o Service ainda manda parte do tráfego para ele, e os erros sobem para 4%.",
      ],
      metrics: m(3, 3, 120, 4),
      terminal: { suggest: ["kubectl get endpoints api", PODS_CMD], outputs: endpoints(EP3) },
      stage: stage(
        [
          web(),
          api1New(undefined, [info("app=api")]),
          api2({ status: "bad", badges: [info("app=api"), { text: "readiness falhou", tone: "bad" }], res: { ready: "0/1" } }),
          api3([info("app=api")]),
          svcApi("a", { badges: [CLUSTER_IP(), SELECTOR()] }),
          ...proxies(),
        ],
        [link("web", "svc-api", { tone: "violet" }), ...toApis("dashed")],
        [...viaSvc(["api-1b", "api-2", "api-3"], { "api-2": { kind: "bad" } }), flow("n2", "api-2", 1, { kind: "hc", label: "probe falhou" })],
      ),
    },
    // 7
    {
      kind: "solucao",
      nav: "Sai da lista",
      title: "O pod doente sai dos endpoints",
      body: [
        "Depois de algumas falhas seguidas, o pod é marcado como **NotReady** e removido dos Endpoints. O Service para de enviar tráfego para ele, sem ninguém precisar agir.",
        "O pod continua vivo e o kubelet segue testando. Quando a readiness voltar a passar, ele retorna para a lista sozinho.",
      ],
      callout: { kind: "atencao", text: "Sem readiness probe, o Kubernetes não sabe que o pod está doente: ele só vê que o processo está de pé e continua mandando tráfego." },
      metrics: m(3, 2, 120, 0),
      terminal: { suggest: ["kubectl get endpoints api", PODS_CMD], outputs: endpoints(EP2) },
      stage: stage(
        [
          web(),
          api1New(undefined, [info("app=api")]),
          api2({ status: "muted", badges: [{ text: "NotReady", tone: "warn" }], res: { ready: "0/1" } }),
          api3([info("app=api")]),
          svcApi("a", { badges: [CLUSTER_IP(), SELECTOR()] }),
          ...proxies(),
        ],
        [link("web", "svc-api", { tone: "violet" }), ...toApis("dashed", ["api-2"])],
        [...viaSvc(["api-1b", "api-3"]), flow("n2", "api-2", 1, { kind: "hc", label: "probe falhando" })],
      ),
    },
    // 8
    {
      kind: "conceito",
      nav: "De fora do cluster",
      title: "NodePort: uma porta em todo node",
      body: [
        "O `api-b8t2n` voltou a passar na readiness e entrou de novo nos Endpoints. Até aqui só pods do cluster alcançam o Service. Para receber usuários de fora, mudamos o tipo para **NodePort**: o Kubernetes abre a porta `30080` em todos os nodes.",
        "O usuário acessa `IP-do-node:30080`, o `kube-proxy` daquele node reescreve o destino e o pacote chega a um pod, mesmo que ele esteja em outro node.",
      ],
      callout: { kind: "bom-saber", text: "NodePort expõe uma porta alta em todo node. LoadBalancer vai além: pede um IP público ao provedor de nuvem e aponta para os nodes." },
      metrics: m(3, 3, 400, 0),
      terminal: { suggest: [SVC_CMD, "kubectl describe svc api"], outputs: describeSvc({ type: "NodePort", eps: EP3, nodePort: true }) },
      stage: stage(
        [
          web(),
          api1New(),
          api2(),
          api3(),
          svcApi("a", { type: "NodePort", ports: "80:30080/TCP", status: "hi", badges: [{ text: "NodePort 30080", tone: "info" }, CLUSTER_IP()] }),
          ...proxies(),
          users("users", USERS_POS[0], USERS_POS[1], 5, "usuários", { status: "new" }),
        ],
        [link("web", "svc-api", { tone: "violet" }), ...toApis("dashed")],
        [flow("users", "svc-api", 3, { via: ["n2"], kind: "heavy" }), ...fromSvc(["api-1b", "api-2", "api-3"])],
      ),
    },
    // 9
    {
      kind: "solucao",
      nav: "Ingress",
      title: "Ingress: roteamento por URL",
      body: [
        "Abrir uma porta por Service não escala. O **Ingress** é uma regra HTTP (host e caminho) e o *Ingress controller* é o proxy que executa essa regra na borda do cluster.",
        "Aqui, `loja.com.br/` vai para o Service `web` e `/api` para o Service `api`. Uma entrada só, vários destinos, e os Services voltam a ser `ClusterIP`.",
      ],
      changes: ["+ Ingress controller", "+ Service web", "Service api volta a ClusterIP"],
      callout: { kind: "chave", text: "Ingress sozinho não faz nada: precisa de um controller (NGINX, Traefik e outros) rodando no cluster." },
      metrics: m(3, 3, 400, 0),
      terminal: { suggest: ["kubectl get ingress", SVC_CMD], outputs: GET_INGRESS },
      stage: ingressStage("new"),
    },
    // 10
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "Pods mudam de IP o tempo todo. O **Service** dá um nome e um ClusterIP estáveis e usa labels para escolher os pods; o `kube-proxy` implementa a ideia com regras em cada node.",
        "A readiness probe decide quem fica nos Endpoints. Para receber tráfego de fora, NodePort e LoadBalancer abrem portas e IPs; o Ingress roteia HTTP por host e caminho.",
      ],
      changes: ["Tudo saudável", "O tráfego entra pelo Ingress e passa pelos Services"],
      metrics: m(3, 3, 400, 0),
      terminal: { suggest: ["kubectl get ingress", PODS_CMD], outputs: GET_INGRESS },
      stage: ingressStage(undefined),
    },
  ],
};

/** Passos 9 e 10: Ingress na borda, dois Services e os usuários entrando por ele. */
function ingressStage(freshStatus: Status | undefined): SceneStep["stage"] {
  const [ix, iy] = INGRESS_POS;
  const [wx, wy] = SVC_WEB_POS;
  return stage(
    [
      web(),
      api1New(undefined, [info("app=api")]),
      api2({ badges: [info("app=api")] }),
      api3([info("app=api")]),
      svcApi("b", { badges: [CLUSTER_IP(), SELECTOR()] }),
      service("svc-web", wx, wy, "web", { type: "ClusterIP", ip: "10.96.0.31", ports: "80/TCP", age: "1m" }, { badges: [{ text: "ClusterIP 10.96.0.31", tone: "info" }], status: freshStatus }),
      ...proxies(),
      users("users", USERS_POS[0], USERS_POS[1], 5, "usuários"),
      ingress("ingress", ix, iy, { badges: [info("loja.com.br/ → web"), info("/api → api")], status: freshStatus }),
    ],
    [link("users", "ingress"), link("ingress", "svc-web", { tone: "violet" }), link("ingress", "svc-api", { tone: "violet" }), link("svc-web", "web", { style: "dashed", tone: "violet" }), ...toApis("dashed")],
    [
      flow("users", "web", 2, { via: ["ingress", "svc-web"] }),
      ...["api-1b", "api-2", "api-3"].map((id) => flow("users", id, 1, { via: ["ingress", "svc-api"] })),
    ],
  );
}

