/**
 * Cenas do módulo "Containers por dentro" da trilha Docker.
 * containerVsVm: isométrico, shell docker (container-vs-vm).
 * namespacesCgroups: isométrico + tabela, shell bash (namespaces-cgroups-chroot).
 * arquiteturaDocker: sequência, shell bash (arquitetura-do-docker).
 */
import type { IsoEntity, Metric, SceneDef, SceneStep, SeqLane, SeqMessage, SeqNote, Status } from "../types";
import type { GridPanel } from "@/lib/visualizers/types";
import { box, flow, link, zone } from "../kit/common";
import { container } from "../kit/docker";

type Tone4 = "ok" | "warn" | "bad" | "info";

// =====================================================================================
// Cena 1: container vs VM (iso)
// =====================================================================================

/** (u, v) em colunas e linhas da TELA -> (x, y) da grade isométrica. u = x - y; v = x + y. */
const at = (u: number, v: number): [number, number] => [(v + u) / 2, (v - u) / 2];

const U3 = [-8, 0, 8];
const APPS = ["app A", "app B", "app C"];
const CT_NAMES = ["web", "api", "worker"];

const hardware = (label = "servidor físico"): IsoEntity => box("hw", ...at(0, 17.5), "server", label, { size: "md", tone: "zinc" });

const looseApps = (): IsoEntity[] => APPS.map((n, i) => box(`app${i}`, ...at(U3[i], 6), "box", n, { size: "sm", tone: "mana" }));

/** Cada VM tem o seu SO convidado (com kernel) e a sua aplicação; o hypervisor fica embaixo de todas. */
function vms(o: { osStatus?: Status; osBadge?: string } = {}): IsoEntity[] {
  const out: IsoEntity[] = [];
  for (let i = 0; i < 3; i++) {
    out.push(
      zone(`vm${i}`, ...at(U3[i], 0), 3.8, 3.8, { label: `VM ${i + 1}`, tone: "sky", dashed: true }),
      box(`os${i}`, ...at(-1.5, 3.3), "cog", "SO convidado", { parent: `vm${i}`, size: "sm", tone: "ember", status: o.osStatus, badges: o.osBadge ? [{ text: o.osBadge, tone: "warn" }] : undefined }),
      box(`app${i}`, ...at(1.5, 3.3), "box", APPS[i], { parent: `vm${i}`, size: "sm", tone: "mana" }),
    );
  }
  out.push(box("hyp", ...at(0, 11), "layers", "hypervisor", { size: "md", tone: "arcane" }), hardware());
  return out;
}

const vmLinks = [link("hyp", "os0", { style: "dashed" }), link("hyp", "os1", { style: "dashed" }), link("hyp", "os2", { style: "dashed" }), link("hw", "hyp")];

/** Containers: um único kernel do host, três processos isolados por cima. */
function containers(o: { kernelStatus?: Status; kernelBadge?: string } = {}): IsoEntity[] {
  return [
    ...CT_NAMES.map((n, i) => container(n, ...at(U3[i], 3), n, { image: `loja/${n}:1.0`, status: "Up 3 minutes", age: "3 minutes" })),
    box("kernel", ...at(0, 11), "cog", "kernel Linux do host", { size: "md", tone: "ember", status: o.kernelStatus, badges: o.kernelBadge ? [{ text: o.kernelBadge, tone: o.kernelStatus === "bad" ? "bad" : "info" }] : undefined }),
    hardware(),
  ];
}

const ctLinks = [link("web", "kernel", { style: "dashed" }), link("api", "kernel", { style: "dashed" }), link("worker", "kernel", { style: "dashed" }), link("hw", "kernel")];

const m1 = (kernels: number | string, boot: string, iso: string, tone?: Metric["tone"]): Metric[] => [
  { id: "kernels", label: "Kernels rodando", value: kernels, tone },
  { id: "boot", label: "Para ficar pronto", value: boot },
  { id: "iso", label: "Isolamento", value: iso },
];

const UNAME = "uname -r";
const UNAME_CT = "docker run --rm alpine uname -r";

export const containerVsVm: SceneDef = {
  title: "Container vs VM: onde fica o kernel",
  summary: "Compare o isolamento por hypervisor, com um SO por VM, com o isolamento por kernel compartilhado dos containers.",
  shell: "docker",
  goals: [
    { text: "Ver o que uma VM carrega a mais", step: 3 },
    { text: "Entender que containers compartilham o kernel", step: 5 },
    { text: "Saber o que roda de verdade em Mac e Windows", step: 6 },
    { text: "Pesar isolamento contra densidade", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um servidor",
      title: "Três aplicações, um servidor físico",
      body: [
        "Você tem um servidor e três aplicações que **não devem interferir** uma na outra: uma que trava não derruba as outras, e uma que vaza memória não consome a máquina inteira.",
        "Duas famílias de solução separam as aplicações: **máquinas virtuais** e **containers**. A diferença entre elas está em quantos kernels existem na máquina.",
      ],
      metrics: m1("?", "?", "?"),
      focus: ["app0", "app1", "app2", "hw"],
      stage: { mode: "iso", entities: [...looseApps(), hardware()], links: [link("app0", "hw", { style: "dashed" }), link("app1", "hw", { style: "dashed" }), link("app2", "hw", { style: "dashed" })] },
    },
    {
      kind: "conceito",
      nav: "Máquina virtual",
      title: "VM: o hypervisor finge hardware inteiro",
      body: [
        "O **hypervisor** reparte CPU, memória e disco e apresenta a cada VM um hardware virtual. Sobre ele, cada VM instala um **sistema operacional completo**, com o seu próprio kernel.",
        "O isolamento é forte: o que roda na VM 1 não enxerga a VM 2 nem toca no kernel dela. O preço aparece no passo seguinte.",
      ],
      changes: ["+ hypervisor", "+ 3 VMs, cada uma com SO e kernel"],
      metrics: m1(3, "segundos a minutos", "por hardware virtual"),
      focus: ["vm0", "vm1", "hyp"],
      stage: { mode: "iso", entities: vms(), links: vmLinks },
    },
    {
      kind: "problema",
      nav: "O custo do SO",
      title: "Cada VM paga um sistema operacional inteiro",
      body: [
        "Cada VM reserva memória para o seu kernel, os seus serviços de sistema e as suas atualizações, mesmo que a aplicação seja um processo pequeno. Para subir a VM, é preciso **dar boot** em um SO inteiro.",
        "Dez aplicações pequenas significam dez kernels, dez conjuntos de patches de segurança e dez discos de imagem para manter.",
      ],
      callout: { kind: "atencao", text: "A sobrecarga fixa de uma VM não depende do tamanho da aplicação: é o preço de ter um SO por aplicação." },
      changes: ["3 kernels para manter", "SO convidado: custo fixo por VM"],
      metrics: m1(3, "segundos a minutos", "por hardware virtual", "warn"),
      focus: ["os0", "os1", "os2", "hyp"],
      stage: { mode: "iso", entities: vms({ osStatus: "warn", osBadge: "kernel" }), links: vmLinks },
    },
    {
      kind: "solucao",
      nav: "Containers",
      title: "Container: um kernel, vários processos isolados",
      body: [
        "Um container **não leva um SO**. O kernel do host cria, para cada aplicação, uma visão própria de processos, rede e arquivos (namespaces) e um limite de recursos (cgroups). A aplicação é um processo comum do host.",
        "Sem boot de SO, o container fica pronto em uma fração de segundo, e a única cópia de kernel atende todos eles.",
      ],
      callout: { kind: "chave", text: "Container é um processo do host com visão restrita e limites. Não existe uma máquina emulada por trás." },
      changes: ["− hypervisor e SOs convidados", "+ um kernel compartilhado", "+ 3 containers"],
      metrics: m1(1, "fração de segundo", "pelo kernel"),
      cmd: "docker ps",
      terminal: {
        suggest: ["docker ps", "docker images"],
        outputs: { "docker images": ["REPOSITORY   TAG   IMAGE ID       CREATED       SIZE", "loja/web     1.0   9d1f0c3a77be   2 hours ago   190MB", "loja/api     1.0   4be6c0a1d9f2   2 hours ago   190MB", "loja/worker  1.0   c7a35e08b1d4   2 hours ago   190MB"].join("\n") },
      },
      focus: ["kernel", "web", "api", "worker"],
      stage: { mode: "iso", entities: containers(), links: ctLinks },
    },
    {
      kind: "conceito",
      nav: "Mesmo kernel",
      title: "As chamadas de sistema vão todas ao mesmo kernel",
      body: [
        "Quando o processo de um container abre um arquivo ou um socket, ele faz uma **chamada de sistema** ao kernel do host, igual a qualquer outro processo. Por isso o `uname -r` dentro do container mostra o kernel do host.",
        "Isso explica duas regras: um container Linux só roda sobre um kernel Linux, e a imagem não traz kernel, só os arquivos do userspace (bibliotecas, binários, configuração).",
      ],
      changes: ["+ syscalls dos containers ao kernel"],
      metrics: m1(1, "fração de segundo", "pelo kernel"),
      cmd: UNAME_CT,
      terminal: {
        suggest: [UNAME, UNAME_CT],
        outputs: { [UNAME]: "6.8.0-45-generic", [UNAME_CT]: "6.8.0-45-generic" },
      },
      focus: ["kernel", "web", "api"],
      stage: {
        mode: "iso",
        entities: containers(),
        links: ctLinks,
        flows: [flow("web", "kernel", 2, { kind: "data", label: "syscalls" }), flow("api", "kernel", 1, { kind: "data" }), flow("worker", "kernel", 1, { kind: "data" })],
      },
    },
    {
      kind: "conceito",
      nav: "Mac e Windows",
      title: "No Mac e no Windows, há uma VM escondida",
      body: [
        "Windows e macOS não têm o kernel Linux. O **Docker Desktop** cria uma **VM Linux leve** e roda o Docker dentro dela: os containers continuam sendo processos, só que de um kernel Linux que está dentro da VM.",
        "No seu notebook você usa containers com a ergonomia de um Linux nativo, mas o desempenho de disco e de rede passa pela VM. Em produção, em servidores Linux, a camada extra não existe.",
      ],
      callout: { kind: "bom-saber", text: "Não há container Linux \"nativo\" em Windows ou Mac sem uma VM no caminho." },
      changes: ["+ VM Linux do Docker Desktop", "containers agora vivem dentro da VM"],
      metrics: m1("2", "fração de segundo (depois da VM)", "pelo kernel da VM"),
      focus: ["vmdd", "so"],
      stage: {
        mode: "iso",
        entities: [
          zone("vmdd", ...at(0, 0), 8, 8, { label: "VM do Docker Desktop", tone: "sky", dashed: true, status: "new" }),
          box("kernel", ...at(0, 12), "cog", "kernel da VM", { parent: "vmdd", size: "md", tone: "ember" }),
          ...CT_NAMES.map((n, i) => container(n, ...at(-5 + i * 5, 4.5), n, { image: `loja/${n}:1.0`, status: "Up 3 minutes", age: "3 minutes" }, { parent: "vmdd" })),
          box("so", ...at(0, 21), "cog", "macOS ou Windows", { size: "md", tone: "zinc" }),
        ],
        links: [link("so", "kernel", { style: "dashed" })],
      },
    },
    {
      kind: "tradeoff",
      nav: "Isolamento",
      title: "O preço do kernel compartilhado",
      body: [
        "Como todos os containers falam com o mesmo kernel, uma **falha no kernel** (um bug de escape) pode comprometer todos eles e o host. Na VM, o atacante teria de atravessar também o hypervisor.",
        "Por isso quem roda código de terceiros (clientes diferentes na mesma máquina) costuma combinar os dois mundos: containers dentro de VMs, ou runtimes como gVisor e Kata, que põem uma camada a mais entre o container e o kernel.",
      ],
      callout: { kind: "atencao", text: "Densidade e velocidade vêm do kernel compartilhado. A fronteira de segurança, também." },
      changes: ["kernel: ponto único de falha de isolamento"],
      metrics: m1(1, "fração de segundo", "pelo kernel", "warn"),
      focus: ["kernel", "web", "api", "worker"],
      stage: {
        mode: "iso",
        entities: containers({ kernelStatus: "warn", kernelBadge: "superfície comum" }),
        links: ctLinks,
      },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "A VM virtualiza o hardware e leva um SO com kernel por aplicação: isolamento forte, custo fixo maior. O container virtualiza o sistema operacional: um kernel, vários processos com visão e limites próprios.",
        "Na próxima aula você abre o capô: os namespaces, os cgroups e o `chroot` que o Docker usa para montar um container.",
      ],
      metrics: m1(1, "fração de segundo", "pelo kernel", "ok"),
      focus: ["kernel", "web", "api", "worker"],
      stage: { mode: "iso", entities: containers(), links: ctLinks },
    },
  ],
};

// =====================================================================================
// Cena 2: namespaces, cgroups e chroot (iso + tabela)
// =====================================================================================

type Q2 = { inNs?: boolean; cpu?: boolean; mem?: boolean; javaStatus?: Status; javaBadges?: { text: string; tone?: Tone4 }[]; meter?: number; net?: boolean; mnt?: boolean };

function proc(q: Q2 = {}): IsoEntity[] {
  const out: IsoEntity[] = [
    zone("host", 0, 0, 15, 5, { label: "host Linux", tone: "zinc" }),
    box("systemd", ...at(-3, 5), "cog", "systemd", { parent: "host", size: "sm", tone: "zinc", badges: [{ text: "PID 1" }] }),
    box("sshd", ...at(0, 5), "terminal", "sshd", { parent: "host", size: "sm", tone: "zinc", badges: [{ text: "PID 812" }] }),
    box("dockerd", ...at(3, 5), "ship", "dockerd", { parent: "host", size: "sm", tone: "zinc", badges: [{ text: "PID 1190" }] }),
  ];
  if (q.inNs) {
    out.push(zone("ns", 10, 0.4, 4.5, 4.5, { z: 10, label: "container web", tone: "mana", dashed: true, status: "new" }));
    out.push(
      box("java", ...at(-1.8, 4.2), "cog", "java", {
        parent: "ns",
        size: "md",
        tone: "mana",
        status: q.javaStatus,
        meter: q.meter,
        badges: q.javaBadges ?? [{ text: "PID 1 aqui", tone: "ok" }, { text: "PID 4231 no host", tone: "info" }],
        res: { kind: "container", name: "web", image: "loja/web:1.0", status: "Up 3 minutes" },
      }),
    );
    if (q.net) {
      out.push(box("eth0", ...at(1.8, 4.2), "network", "eth0", { parent: "ns", size: "sm", tone: "sky", badges: [{ text: "172.17.0.2" }] }));
      out.push(box("docker0", ...at(0.5, 10), "network", "docker0", { parent: "host", size: "sm", tone: "sky" }));
    }
    if (q.mnt) out.push(box("rootfs", ...at(1.8, 4.2), "folder", "/ da imagem", { parent: "ns", size: "sm", tone: "ember" }), box("hostfs", ...at(0.5, 10), "folder", "/ do host", { parent: "host", size: "sm", tone: "zinc" }));
    if (q.cpu) out.push(box("cgroup", ...at(1.8, 4.2), "gauge", "cpu.max", { parent: "ns", size: "sm", tone: "ember", status: "hi", badges: [{ text: "50000 100000" }] }));
    if (q.mem) out.push(box("cgroup", ...at(1.8, 4.2), "gauge", "memory.max", { parent: "ns", size: "sm", tone: "ember", status: "hi", badges: [{ text: "512M" }] }));
  } else {
    out.push(box("java", ...at(8, 10), "cog", "java", { parent: "host", size: "md", tone: "mana", badges: [{ text: "PID 4231" }] }));
  }
  return out;
}

const PS_HOST = "ps -eo pid,comm";
const PS_HOST_OUT = ["    PID COMMAND", "      1 systemd", "    812 sshd", "   1190 dockerd", "   4231 java"].join("\n");
const PS_CT = "docker exec web ps -o pid,comm";
const PS_CT_OUT = ["PID   COMMAND", "    1 java", "   37 ps"].join("\n");
const IP_CT = "docker exec web hostname -i";
const IP_CT_OUT = "172.17.0.2";
const IP_HOST = "ip -br addr";
const IP_HOST_OUT = [
  "lo               UNKNOWN        127.0.0.1/8",
  "eth0             UP             203.0.113.10/24",
  "docker0          UP             172.17.0.1/16",
  "veth3a1b2c@if11  UP",
].join("\n");
const LS_CT = "docker exec web ls /";
const LS_CT_OUT = "app  bin  dev  etc  lib  opt  proc  sys  tmp  usr  var";
const LS_HOST = "ls /";
const LS_HOST_OUT = "bin  boot  dev  etc  home  lib  media  mnt  opt  proc  root  run  srv  sys  tmp  usr  var";
const CPU_MAX = "docker exec web cat /sys/fs/cgroup/cpu.max";
const CPU_STAT = "docker exec web cat /sys/fs/cgroup/cpu.stat";
const CPU_STAT_OUT = ["usage_usec 38200000", "nr_periods 1200", "nr_throttled 740", "throttled_usec 31250000"].join("\n");
const MEM_MAX = "docker exec web cat /sys/fs/cgroup/memory.max";
const OOM = "docker inspect -f '{{.State.OOMKilled}} {{.State.ExitCode}}' web";
const RUN_CPU = "docker run -d --name web --cpus 0.5 -m 512m loja/web:1.0";

const NS_GRID: GridPanel = {
  kind: "grid",
  label: "Os 8 namespaces do Linux",
  colHeaders: ["Namespace", "O que isola", "Flag do clone()"],
  rows: [
    ["pid", "árvore de processos (PID 1 próprio)", "CLONE_NEWPID"],
    ["net", "interfaces, rotas, portas, iptables", "CLONE_NEWNET"],
    ["mnt", "pontos de montagem (a raiz do filesystem)", "CLONE_NEWNS"],
    ["uts", "hostname e domainname", "CLONE_NEWUTS"],
    ["ipc", "filas de mensagens e memória compartilhada", "CLONE_NEWIPC"],
    ["user", "UIDs e GIDs (root do container ≠ root do host)", "CLONE_NEWUSER"],
    ["cgroup", "a raiz da hierarquia de cgroups que o processo vê", "CLONE_NEWCGROUP"],
    ["time", "relógios monotônico e de boot", "CLONE_NEWTIME"],
  ],
};

const m2 = (a: string, b: string, tone?: Metric["tone"]): Metric[] => [{ id: "a", label: "Visto de dentro", value: a }, { id: "b", label: "Visto do host", value: b, tone }];

export const namespacesCgroups: SceneDef = {
  title: "Namespaces, cgroups e chroot: o container desmontado",
  summary: "Veja o mesmo processo Java por dentro e por fora, e como o kernel limita o que ele enxerga e quanto ele consome.",
  shell: "bash",
  goals: [
    { text: "Ver que o PID 1 do container é outro número no host", step: 2 },
    { text: "Entender as visões de rede e de arquivos", step: 4 },
    { text: "Limitar CPU com cgroups e ver o throttling", step: 6 },
    { text: "Ver o que acontece quando a memória estoura", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Um processo",
      title: "Antes de tudo, é só um processo do host",
      body: [
        "Neste host, o `ps` lista `systemd`, `sshd`, `dockerd` e um `java` com **PID 4231**. O processo Java ainda não foi isolado de nada: enxerga todos os outros processos, a rede e os arquivos do host.",
        "Um container é esse mesmo processo, depois que o kernel lhe dá uma visão restrita (namespaces) e um teto de recursos (cgroups).",
      ],
      metrics: m2("-", "PID 4231"),
      terminal: { suggest: [PS_HOST], outputs: { [PS_HOST]: PS_HOST_OUT } },
      focus: ["java", "dockerd"],
      stage: { mode: "iso", entities: proc() },
    },
    {
      kind: "conceito",
      nav: "PID namespace",
      title: "PID namespace: o PID 4231 vira PID 1",
      body: [
        "Com `CLONE_NEWPID`, o kernel cria uma árvore de processos nova. O primeiro processo dela é o **PID 1** daquele namespace, mesmo sendo o `4231` no host. Dentro do container ele não enxerga `sshd` nem `dockerd`.",
        "O host enxerga tudo e pode sinalizar o processo pelo PID real: `kill 4231` mata o container. Já o PID 1 tem papel especial: ele recebe os sinais do `docker stop` e precisa saber tratá-los (aula 15).",
      ],
      callout: { kind: "chave", text: "O mesmo processo tem dois PIDs: um por namespace em que ele aparece." },
      changes: ["+ container web (namespace pid)", "java: PID 1 dentro, PID 4231 fora"],
      metrics: m2("PID 1", "PID 4231"),
      terminal: { suggest: [PS_CT, PS_HOST], outputs: { [PS_CT]: PS_CT_OUT, [PS_HOST]: PS_HOST_OUT } },
      focus: ["ns", "java"],
      stage: { mode: "iso", entities: proc({ inNs: true }) },
    },
    {
      kind: "conceito",
      nav: "Net namespace",
      title: "Net namespace: uma pilha de rede só do container",
      body: [
        "Com `CLONE_NEWNET`, o container ganha interfaces, tabela de rotas e portas próprias: uma `lo` e uma `eth0` com o IP `172.17.0.2`. Duas aplicações podem escutar na porta 8080 sem conflito, cada uma no seu namespace.",
        "A `eth0` do container é uma ponta de um par virtual (veth) cuja outra ponta está no host, ligada à bridge `docker0`. O desenho completo é o assunto da aula 8.",
      ],
      changes: ["+ eth0 do container (172.17.0.2)", "+ docker0 no host"],
      metrics: m2("eth0 172.17.0.2", "docker0 172.17.0.1"),
      terminal: { suggest: [IP_CT, IP_HOST], outputs: { [IP_CT]: IP_CT_OUT, [IP_HOST]: IP_HOST_OUT } },
      focus: ["ns", "java", "eth0", "docker0"],
      stage: { mode: "iso", entities: proc({ inNs: true, net: true }), links: [link("eth0", "docker0", { style: "dashed" })] },
    },
    {
      kind: "conceito",
      nav: "Mount e chroot",
      title: "Mount namespace: o container acha que a raiz é a imagem",
      body: [
        "Com `CLONE_NEWNS`, o container tem a sua **tabela de montagens**. O runtime monta o filesystem da imagem em um diretório e troca a raiz do namespace para ele com `pivot_root`. Lá dentro, `/` é a imagem (aula 5), e o `/` do host sumiu.",
        "O velho `chroot` só muda o ponto que o processo considera raiz, sem trocar a tabela de montagens; um processo com privilégio pode escapar dele. O `runc` usa o `pivot_root` por isso.",
      ],
      callout: { kind: "atencao", text: "chroot não é isolamento. Ele só muda o caminho de resolução; o resto do host continua visível por outros caminhos." },
      changes: ["+ / da imagem dentro do container", "/ do host fora do alcance"],
      metrics: m2("/ = imagem", "/ = host"),
      terminal: { suggest: [LS_CT, LS_HOST], outputs: { [LS_CT]: LS_CT_OUT, [LS_HOST]: LS_HOST_OUT } },
      focus: ["ns", "java", "rootfs", "hostfs"],
      stage: { mode: "iso", entities: proc({ inNs: true, mnt: true }) },
    },
    {
      kind: "conceito",
      nav: "Os 8 tipos",
      title: "São oito namespaces, cada um isola uma coisa",
      body: [
        "Além de `pid`, `net` e `mnt`, existem `uts` (hostname), `ipc` (memória compartilhada e filas), `user` (mapeamento de UIDs), `cgroup` e `time`. O Docker usa um conjunto deles por container; a tabela mostra o que cada um separa.",
        "Tudo isso é uma única chamada de sistema com flags: `clone()` ou `unshare()`. Não há nenhum \"módulo de container\" no kernel, só estes recursos combinados.",
      ],
      changes: ["Tabela dos 8 namespaces"],
      metrics: m2("visão própria", "visão completa"),
      extra: [NS_GRID],
      focus: ["ns", "java"],
      stage: { mode: "iso", entities: proc({ inNs: true }) },
    },
    {
      kind: "conceito",
      nav: "cgroup de CPU",
      title: "cgroups: quanto o processo pode consumir",
      body: [
        "Namespaces mudam o que o processo **vê**. Os **cgroups** (v2) mudam quanto ele **usa**. Em `cpu.max` o formato é `quota período` em microssegundos: `50000 100000` dá 50 ms de CPU a cada 100 ms, ou **meia CPU**.",
        "Ao gastar a quota, o grupo é **estrangulado** (*throttled*) até o próximo período. O processo não morre: fica parado, e a latência sobe. O `cpu.stat` conta quantos períodos foram estrangulados.",
      ],
      callout: { kind: "bom-saber", text: "`docker run --cpus 0.5` escreve exatamente `50000 100000` em `cpu.max`." },
      changes: ["+ cpu.max 50000 100000", "java: estrangulado (throttled)"],
      metrics: [{ id: "q", label: "CPU permitida", value: "0,5" }, { id: "t", label: "Períodos estrangulados", value: "740 de 1200", tone: "warn" }],
      cmd: RUN_CPU,
      terminal: {
        suggest: [CPU_MAX, CPU_STAT],
        outputs: { [CPU_MAX]: "50000 100000", [CPU_STAT]: CPU_STAT_OUT, [RUN_CPU]: "8f2a1c4d9b3e5a7c1d0f4e6b8a2c9d1e3f5a7b9c0d2e4f6a8b1c3d5e7f9a0b2c" },
      },
      focus: ["ns", "java", "cgroup"],
      stage: { mode: "iso", entities: proc({ inNs: true, cpu: true, javaStatus: "warn", meter: 100, javaBadges: [{ text: "throttled", tone: "warn" }] }), links: [link("java", "cgroup", { style: "dashed" })] },
    },
    {
      kind: "problema",
      nav: "Estouro de memória",
      title: "Memória: ao passar do teto, o kernel mata",
      body: [
        "`memory.max` é um teto rígido. Quando o processo passa de 512 MiB e o kernel não consegue recuperar páginas, o **OOM killer** encerra um processo do grupo com `SIGKILL`. O container sai com **exit code 137** (128 + 9).",
        "Não há exceção Java nem stack trace: o processo some. A JVM moderna lê o `memory.max` e dimensiona o heap por ele, mas o heap é só parte do consumo.",
      ],
      callout: { kind: "atencao", text: "137 sem log de erro é quase sempre OOM kill. Confira `OOMKilled` no `docker inspect`." },
      changes: ["memory.max 512M estourado", "java: encerrado com 137"],
      metrics: [{ id: "m", label: "Uso / teto", value: "512 / 512 MiB", tone: "bad" }, { id: "x", label: "Exit code", value: 137, tone: "bad" }],
      terminal: { suggest: [MEM_MAX, OOM], outputs: { [MEM_MAX]: "536870912", [OOM]: "true 137" } },
      focus: ["ns", "java", "cgroup"],
      stage: { mode: "iso", entities: proc({ inNs: true, mem: true, javaStatus: "bad", meter: 100, javaBadges: [{ text: "OOM kill · 137", tone: "bad" }] }), links: [link("java", "cgroup", { style: "dashed" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "Um container é um processo do host. **Namespaces** dão a ele uma visão própria de processos, rede, arquivos e mais. **cgroups** limitam CPU, memória e outros recursos. Nenhum dos dois virtualiza o kernel.",
        "Entre os dois, \"não vejo\" e \"não posso usar mais\" explicam quase todo comportamento estranho: PID 1, limites de CPU que viram latência e o 137 do OOM.",
      ],
      metrics: m2("PID 1", "PID 4231", "ok"),
      focus: ["ns", "java"],
      stage: { mode: "iso", entities: proc({ inNs: true, cpu: true }), links: [link("java", "cgroup", { style: "dashed" })] },
    },
  ],
};

// =====================================================================================
// Cena 3: a arquitetura do Docker (sequência)
// =====================================================================================

const LANES3: SeqLane[] = [
  { id: "cli", label: "docker CLI", icon: "terminal", tone: "mana" },
  { id: "dkd", label: "dockerd", icon: "ship", tone: "arcane" },
  { id: "ctd", label: "containerd", icon: "cog", tone: "sky" },
  { id: "shim", label: "containerd-shim", icon: "layers", tone: "ember" },
  { id: "runc", label: "runc", icon: "zap", tone: "rune" },
  { id: "proc", label: "processo", icon: "container", tone: "violet" },
];

const msg3 = (id: string, from: string, to: string, at: number, label: string, o: Partial<SeqMessage> = {}): SeqMessage => ({ id, from, to, at, label, ...o });
const note3 = (lane: string, at: number, text: string, tone: Tone4 = "info"): SeqNote => ({ lane, at, text, tone });
const seq3 = (messages: SeqMessage[], o: Partial<Extract<SceneStep["stage"], { mode: "sequence" }>> = {}): SceneStep["stage"] => ({ mode: "sequence", lanes: LANES3, messages, ...o });

const A1 = msg3("a1", "cli", "dkd", 0, "POST /containers/create e /start", { span: 1, detail: "REST em /var/run/docker.sock", tone: "ctrl" });
const A2 = msg3("a2", "dkd", "dkd", 3, "imagem, rede, volumes", { tone: "ctrl" });
const A3 = msg3("a3", "dkd", "ctd", 5, "criar container e tarefa (gRPC)", { span: 1, detail: "namespace moby", tone: "ctrl" });
const A4 = msg3("a4", "ctd", "shim", 8, "inicia o shim", { span: 1, detail: "um shim por container", tone: "ctrl" });
const A5 = msg3("a5", "shim", "runc", 11, "runc create + start", { span: 1, detail: "config.json (OCI runtime spec)", tone: "ctrl" });
const A6 = msg3("a6", "runc", "proc", 14, "clone, cgroups, pivot_root, exec", { span: 1, detail: "nasce o PID 4231", tone: "data" });
const A7 = msg3("a7", "shim", "ctd", 17, "tarefa iniciada (PID 4231)", { tone: "ok" });
const A8 = msg3("a8", "ctd", "dkd", 19, "evento: task start", { tone: "ok" });
const A9 = msg3("a9", "dkd", "cli", 21, "ID do container", { tone: "ok" });

const m3 = (a: string, b: string): Metric[] => [{ id: "a", label: "Camada atual", value: a }, { id: "b", label: "Quem cria o processo", value: b }];

const RUN3 = "docker run -d --name web -p 8080:80 nginx:1.27";
const PSEF = "ps -ef --forest | grep -E 'dockerd|containerd|nginx'";
const PSEF_OUT = [
  "root        902      1  /usr/bin/containerd",
  "root       1190      1  /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock",
  "root       4198      1  /usr/bin/containerd-shim-runc-v2 -namespace moby -id 8f2a1c4d9b3e",
  "root       4231   4198   \\_ nginx: master process nginx -g daemon off;",
].join("\n");
const SOCK = "curl --unix-socket /var/run/docker.sock http://localhost/containers/json";
const SOCK_OUT = '[{"Id":"8f2a1c4d9b3e...","Names":["/web"],"Image":"nginx:1.27","State":"running","Status":"Up 2 minutes","Ports":[{"IP":"0.0.0.0","PrivatePort":80,"PublicPort":8080,"Type":"tcp"}]}]';

const OCI_GRID: GridPanel = {
  kind: "grid",
  label: "As três especificações da OCI",
  colHeaders: ["Especificação", "Define", "Quem implementa"],
  rows: [
    ["runtime-spec", "como rodar um bundle: config.json, namespaces, cgroups", "runc, crun, youki"],
    ["image-spec", "o formato da imagem: manifesto, config e camadas", "BuildKit, Buildah, Kaniko"],
    ["distribution-spec", "a API HTTP de push e pull de um registry", "Docker Hub, Harbor, ghcr.io"],
  ],
};

export const arquiteturaDocker: SceneDef = {
  title: "Arquitetura do Docker: do CLI ao processo",
  summary: "Siga um `docker run` por cada componente, do cliente ao runc, e veja quem fica vivo depois de o container subir.",
  shell: "bash",
  goals: [
    { text: "Nomear os componentes entre o CLI e o processo", step: 5 },
    { text: "Entender por que o runc sai e o shim fica", step: 7 },
    { text: "Saber o que a OCI padroniza", step: 8 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "docker run",
      title: "Um comando, cinco programas",
      body: [
        "Você digita `docker run -d --name web -p 8080:80 nginx:1.27`. O `docker` que você executou **não cria o container**: ele é só um cliente. Entre o seu terminal e o processo existem quatro camadas de software, cada uma com um papel.",
        "A cena segue a chamada da esquerda para a direita. Neste passo, só o comando.",
      ],
      metrics: m3("docker CLI", "-"),
      cmd: RUN3,
      terminal: { suggest: [RUN3], outputs: { [RUN3]: "8f2a1c4d9b3e5a7c1d0f4e6b8a2c9d1e3f5a7b9c0d2e4f6a8b1c3d5e7f9a0b2c" } },
      stage: seq3([], { notes: [note3("cli", 0, "docker run -d --name web ...", "info")], laneState: { cli: { text: "cliente", tone: "info" } } }),
    },
    {
      kind: "conceito",
      nav: "CLI → dockerd",
      title: "O CLI fala REST com o dockerd",
      body: [
        "O CLI traduz o comando em chamadas à **Engine API**, uma API REST sobre o socket Unix `/var/run/docker.sock`. Quem tem acesso a esse socket manda no Docker do host: é equivalente a root.",
        "Qualquer cliente HTTP serve: o `curl --unix-socket` conversa direto com a API, e é isso que o cliente Java da aula 20 faz.",
      ],
      callout: { kind: "atencao", text: "Montar o docker.sock dentro de um container entrega a ele o controle do host." },
      changes: ["+ chamada REST ao dockerd"],
      metrics: m3("dockerd", "-"),
      terminal: { suggest: [SOCK], outputs: { [SOCK]: SOCK_OUT } },
      stage: seq3([A1], { laneState: { cli: { text: "cliente", tone: "info" }, dkd: { text: "daemon", tone: "ok" } } }),
    },
    {
      kind: "conceito",
      nav: "O dockerd faz",
      title: "O dockerd cuida de tudo que não é o container",
      body: [
        "O **dockerd** é o daemon: expõe a API, gerencia imagens, redes, volumes, o build (via BuildKit) e o `docker logs`. Antes de pedir o container, ele resolve a imagem `nginx:1.27`, cria a rede e a montagem dos volumes.",
        "Para criar e supervisionar o processo, ele delega a outro daemon, mais enxuto e usado também pelo Kubernetes.",
      ],
      changes: ["dockerd prepara imagem, rede e volumes"],
      metrics: m3("dockerd", "-"),
      stage: seq3([A1, A2], { notes: [note3("dkd", 4, "pull se faltar", "info")], laneState: { cli: { text: "cliente", tone: "info" }, dkd: { text: "daemon", tone: "ok" } } }),
    },
    {
      kind: "conceito",
      nav: "→ containerd",
      title: "O containerd gerencia o ciclo de vida",
      body: [
        "O dockerd chama o **containerd** por **gRPC**. O containerd guarda as imagens em disco e controla o ciclo de vida do container (criar, iniciar, parar), sem saber de redes de usuário nem do build.",
        "O Kubernetes também fala com o containerd diretamente, sem o dockerd. É por isso que existe uma camada separada: o container runtime é reutilizável.",
      ],
      changes: ["+ chamada gRPC ao containerd"],
      metrics: m3("containerd", "-"),
      stage: seq3([A1, A2, A3], { laneState: { dkd: { text: "daemon", tone: "ok" }, ctd: { text: "runtime", tone: "ok" } } }),
    },
    {
      kind: "conceito",
      nav: "shim e runc",
      title: "O containerd inicia um shim, que chama o runc",
      body: [
        "Para cada container, o containerd cria um **containerd-shim** (v2, `containerd-shim-runc-v2`). O shim chama o **runc** com um bundle: o `config.json` da **OCI runtime spec** (namespaces, cgroups, montagens, capacidades) e o rootfs da imagem.",
        "O shim existe para que o container não dependa do containerd continuar vivo, e para guardar o stdout e stderr do processo.",
      ],
      changes: ["+ containerd-shim", "+ runc create e start"],
      metrics: m3("runc", "-"),
      terminal: { suggest: [PSEF], outputs: { [PSEF]: PSEF_OUT } },
      stage: seq3([A1, A2, A3, A4, A5], { laneState: { ctd: { text: "runtime", tone: "ok" }, shim: { text: "pai do processo", tone: "info" } } }),
    },
    {
      kind: "solucao",
      nav: "Nasce o processo",
      title: "O runc cria o processo e sai",
      body: [
        "O **runc** é quem faz o trabalho do kernel: `clone()` com as flags de namespace, aplica os cgroups, troca a raiz com `pivot_root`, descarta capacidades e faz o `exec` do `nginx`. Nasce o PID 4231.",
        "Cumprida a tarefa, o **runc termina**. Ele não fica residente: o processo do container passa a ser filho do shim.",
      ],
      callout: { kind: "chave", text: "Quem monta o container (runc) não é quem o supervisiona (shim). O runc é efêmero." },
      changes: ["+ processo PID 4231", "runc encerra"],
      metrics: m3("processo", "runc"),
      terminal: { suggest: [PSEF], outputs: { [PSEF]: PSEF_OUT } },
      stage: seq3([A1, A2, A3, A4, A5, A6], { laneState: { runc: { text: "sai depois do exec", tone: "warn" }, proc: { text: "PID 4231", tone: "ok" } } }),
    },
    {
      kind: "conceito",
      nav: "A volta",
      title: "O shim fica; a resposta sobe pela cadeia",
      body: [
        "O shim avisa o containerd, que gera o evento `task start`, e o dockerd responde ao CLI com o **ID do container**. O que continua vivo em segundo plano: o dockerd, o containerd, o shim e o processo.",
        "O shim segura o stdout e o stderr (o `docker logs` lê dali) e o código de saída. Com a opção `live-restore`, os containers continuam rodando mesmo se o dockerd for reiniciado.",
      ],
      changes: ["+ evento de início", "+ ID devolvido ao CLI"],
      metrics: m3("docker CLI", "runc (já saiu)"),
      terminal: { suggest: [PSEF, SOCK], outputs: { [PSEF]: PSEF_OUT, [SOCK]: SOCK_OUT } },
      stage: seq3([A1, A2, A3, A4, A5, A6, A7, A8, A9], { laneState: { cli: { text: "terminou", tone: "ok" }, shim: { text: "supervisiona", tone: "ok" }, proc: { text: "PID 4231", tone: "ok" } } }),
    },
    {
      kind: "conceito",
      nav: "OCI",
      title: "A OCI padroniza as pontas, não os daemons",
      body: [
        "A **Open Container Initiative** define três especificações. Graças a elas, uma imagem construída no Docker roda no containerd, no Podman ou no Kubernetes, e o `runc` pode ser trocado por outro runtime sem mudar a imagem.",
        "O dockerd e o containerd são implementações; as especificações é que formam o contrato.",
      ],
      changes: ["Tabela das 3 specs da OCI"],
      metrics: m3("OCI", "runc ou crun"),
      extra: [OCI_GRID],
      stage: seq3([A1, A2, A3, A4, A5, A6, A7, A8, A9], { laneState: { cli: { text: "terminou", tone: "ok" }, shim: { text: "supervisiona", tone: "ok" }, proc: { text: "PID 4231", tone: "ok" } } }),
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O caminho completo",
      body: [
        "**docker CLI** → REST no `docker.sock` → **dockerd** → gRPC → **containerd** → **containerd-shim** → **runc** → processo. O runc cria o container e sai; o shim fica como pai do processo.",
        "Saber quem faz o quê ajuda a depurar: um erro de rede é do dockerd; um processo que não inicia, do runc; um container que some quando o daemon cai, de uma configuração do shim e do `live-restore`.",
      ],
      metrics: m3("todas", "runc"),
      stage: seq3([A1, A2, A3, A4, A5, A6, A7, A8, A9], { laneState: { cli: { text: "terminou", tone: "ok" }, shim: { text: "supervisiona", tone: "ok" }, proc: { text: "PID 4231", tone: "ok" } } }),
    },
  ],
};
