/**
 * Cenas do módulo "Imagens e containers" da trilha Docker.
 * imagemContainerRegistry: isométrico, shell docker (imagem-container-e-registry).
 * camadasEOverlayfs: modo camadas, shell docker (camadas-e-overlayfs; também registrada em cloud-devops até a remoção do módulo antigo).
 * cicloDeVida: isométrico, shell docker (ciclo-de-vida-do-container).
 * logsEmContainers: isométrico + tabela, shell docker (logs-em-containers).
 */
import type { IsoEntity, Layer, LayerFile, LayerStack, Metric, SceneDef, SceneStep, Status } from "../types";
import type { GridPanel } from "@/lib/visualizers/types";
import { box, flow, link, zone } from "../kit/common";
import { container } from "../kit/docker";

// ---------- camadas da imagem loja/app:1.0 ----------

const app = (o: Partial<Layer> = {}): Layer => ({ id: "app", label: "app.jar", sub: "12 MB", tone: "arcane", readonly: true, files: [{ name: "app.jar" }], ...o });
const deps = (o: Partial<Layer> = {}): Layer => ({ id: "deps", label: "dependências", sub: "48 MB", tone: "sky", readonly: true, files: [{ name: "lib/*.jar" }], ...o });
const jre = (o: Partial<Layer> = {}): Layer => ({ id: "jre", label: "JRE 21", sub: "140 MB", tone: "ember", readonly: true, files: [{ name: "/opt/java" }], ...o });
/** Chips da camada de base: os mesmos na imagem e no container; `hl` destaca o arquivo lido ou alterado. */
const baseFiles = (hl = false): LayerFile[] => [{ name: "/etc/app.conf", tone: hl ? "info" : undefined }, { name: "/bin" }, { name: "/usr" }];

const base = (o: Partial<Layer> = {}): Layer => ({
  id: "base",
  label: "debian-slim",
  sub: "75 MB",
  tone: "zinc",
  readonly: true,
  files: baseFiles(),
  ...o,
});

const imageStack = (hl = false): LayerStack => ({
  id: "img",
  label: "Imagem loja/app:1.0",
  orientation: "bands",
  layers: [app(), deps(), jre(), base({ files: baseFiles(hl) })],
});

/** Camadas de baixo vistas de dentro de um container: as mesmas ids e os mesmos chips da imagem, esmaecidas. */
const shared = (baseOverride: Partial<Layer> = {}): Layer[] => [
  app({ status: "muted" }),
  deps({ status: "muted" }),
  jre({ status: "muted" }),
  base({ status: "muted", ...baseOverride }),
];

const rw = (status: Status | undefined, files?: LayerFile[]): Layer => ({
  id: "rw",
  label: "camada gravável",
  sub: "só deste container",
  tone: "rune",
  status,
  files,
});

const MERGED_FILES = [
  { name: "/app/app.jar", from: "app" },
  { name: "lib/*.jar", from: "deps" },
  { name: "/opt/java", from: "jre" },
  { name: "/etc/app.conf", from: "base" },
  { name: "/usr/share/doc", from: "base" },
];

const containerStack = (id: string, label: string, layers: Layer[], merged?: LayerStack["merged"]): LayerStack => ({ id, label, orientation: "bands", layers, merged });

const webStack = (o: { rw?: Status; rwFiles?: LayerFile[]; baseOverride?: Partial<Layer>; merged?: LayerStack["merged"] | null }): LayerStack =>
  containerStack("web", "Container web", [rw(o.rw, o.rwFiles), ...shared(o.baseOverride)], o.merged === null ? undefined : o.merged ?? { label: "visão do container", files: MERGED_FILES });

const workerStack = (): LayerStack => containerStack("worker", "Container worker", [rw("new"), ...shared()]);

const stage = (stacks: LayerStack[]): SceneStep["stage"] => ({ mode: "layers", stacks });

const metrics = (layers: string, size: string, containers: number, tone?: "ok" | "bad") => [
  { id: "layers", label: "Camadas", value: layers },
  { id: "size", label: "Tamanho baixado", value: size, tone },
  { id: "cont", label: "Containers", value: containers },
];

// ---------- build: ordem do Dockerfile ----------

const ins = (id: string, label: string, sub: string, status: Status): Layer => ({ id, label, sub, tone: status === "bad" ? "rose" : status === "new" ? "rune" : "zinc", status });

const badBuild = (status: Status, first: boolean): LayerStack => ({
  id: first ? "b1" : "b2",
  label: first ? "Build 1 · Dockerfile ruim" : "Build 2 · mudou uma linha",
  orientation: "bands",
  layers: [
    ins("pkg", "RUN mvn package", "12 MB (app.jar)", status),
    ins("deps", "RUN mvn dependency:go-offline", "48 MB de dependências", status),
    ins("copy", "COPY . .", "todo o código-fonte", status),
    ins("from", "FROM maven:3-temurin-21", "imagem base", "ok"),
  ],
});

const goodBuild = (second: boolean): LayerStack => ({
  id: second ? "b2" : "b1",
  label: second ? "Build 2 · ordem certa" : "Build 1 · Dockerfile novo",
  orientation: "bands",
  layers: [
    ins("app", "COPY src + mvn package", "12 MB (app.jar)", second ? "new" : "ok"),
    ins("deps", "RUN mvn dependency:go-offline", "48 MB, do cache", "ok"),
    ins("pom", "COPY pom.xml .", "só o descritor", "ok"),
    ins("from", "FROM maven:3-temurin-21", "imagem base", "ok"),
  ],
});

// ---------- saídas do terminal ----------

const HISTORY = [
  "IMAGE          CREATED       CREATED BY                                       SIZE      COMMENT",
  'c41f9a07d3be   2 hours ago  ENTRYPOINT ["java" "-jar" "/app/app.jar"]        0B        buildkit.dockerfile.v0',
  "<missing>      2 hours ago  COPY target/app.jar /app/app.jar # buildkit      12.6MB    buildkit.dockerfile.v0",
  "<missing>      2 hours ago  COPY target/lib /app/lib # buildkit              48.2MB    buildkit.dockerfile.v0",
  "<missing>      3 weeks ago  RUN /bin/sh -c apt-get install -y temurin-21     140MB",
  "<missing>      3 weeks ago  ADD rootfs.tar.xz / # buildkit                   75.1MB    buildkit.dockerfile.v0",
].join("\n");

const INSPECT = '["sha256:5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef","sha256:1c2a8b1d7e3f4c06b9a0d8e5f4a27d3c6b8e0a91d2f5c7a4b3e6d9f0a1c2b3d4","sha256:9a0b3c7d1e5f2a4b6c8d0e2f4a6b8c0d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a0b","sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]';

const PS_WEB = '8f2a1c4d9b3e   loja/app:1.0   "java -jar /app/app.…"   4 minutes ago   Up 4 minutes   0.0.0.0:8080->8080/tcp   web';
const PS_WORKER = '3b9e7d51a0c2   loja/app:1.0   "java -jar /app/app.…"   2 minutes ago   Up 2 minutes   8081/tcp                 worker';
const PS_HEAD = "CONTAINER ID   IMAGE          COMMAND                  CREATED         STATUS         PORTS                    NAMES";

const ps = (...rows: string[]) => [PS_HEAD, ...rows].join("\n");

const DIFF_COPYUP = ["C /etc", "C /etc/app.conf"].join("\n");
const DIFF_WHITEOUT = ["C /etc", "C /etc/app.conf", "C /usr", "C /usr/share", "D /usr/share/doc"].join("\n");

const BUILD = [
  "[+] Building 6.4s (10/10) FINISHED                          docker:default",
  " => [internal] load build definition from Dockerfile                  0.0s",
  " => [internal] load metadata for docker.io/library/maven:3-temurin-21  0.9s",
  " => [1/5] FROM docker.io/library/maven:3-temurin-21                    0.0s",
  " => CACHED [2/5] COPY pom.xml .                                        0.0s",
  " => CACHED [3/5] RUN mvn dependency:go-offline                         0.0s",
  " => [4/5] COPY src ./src                                               0.1s",
  " => [5/5] RUN mvn -o package                                           5.2s",
  " => exporting to image                                                 0.4s",
  " => => naming to docker.io/loja/app:1.1                                0.0s",
].join("\n");

const HIST = "docker history loja/app:1.0";
const INSP = "docker image inspect loja/app:1.0 --format '{{json .RootFS.Layers}}'";
const PS = "docker ps";
const DIFF = "docker diff web";
const BUILD_CMD = "docker build -t loja/app:1.1 .";

// ---------- a cena ----------

export const camadasEOverlayfs: SceneDef = {
  title: "Camadas e OverlayFS: o que é uma imagem",
  summary: "Veja a imagem como uma pilha de camadas somente leitura, como o container escreve nela e por que a ordem do Dockerfile importa.",
  shell: "docker",
  goals: [
    { text: "Ver a imagem como pilha somente leitura", step: 1 },
    { text: "Entender o copy-on-write", step: 4 },
    { text: "Ordenar o Dockerfile para aproveitar o cache", step: 8 },
  ],
  steps: [
    // 1
    {
      kind: "contexto",
      nav: "Uma pilha",
      title: "Uma imagem é uma pilha de camadas",
      body: [
        "Uma imagem Docker não é um arquivo único: é uma pilha de camadas **somente leitura**. Cada linha do Dockerfile que altera arquivos (`FROM`, `COPY`, `RUN`) gera uma camada.",
        "A imagem `loja/app:1.0` tem quatro: o sistema base, o Java, as dependências e, por cima, o seu `app.jar`. Somadas, 275 MB.",
      ],
      metrics: metrics("4", "275 MB", 0),
      terminal: { suggest: [HIST, INSP], outputs: { [HIST]: HISTORY, [INSP]: INSPECT } },
      stage: stage([imageStack()]),
    },
    // 2
    {
      kind: "conceito",
      nav: "O container",
      title: "O container ganha uma camada gravável",
      body: [
        "Ao iniciar um container, o Docker não copia a imagem. Ele reutiliza as mesmas camadas e coloca uma camada **gravável** por cima, só daquele container.",
        "O processo enxerga a *visão unificada* que o OverlayFS monta juntando todas as camadas. Cada arquivo mostra de qual camada veio.",
      ],
      metrics: metrics("4 + 1", "275 MB", 1),
      terminal: { suggest: [PS, HIST], outputs: { [PS]: ps(PS_WEB), [HIST]: HISTORY, [DIFF]: "" } },
      stage: stage([imageStack(), webStack({ rw: "new" })]),
    },
    // 3
    {
      kind: "conceito",
      nav: "Leitura",
      title: "Como o arquivo é encontrado",
      body: [
        "Ao ler `/etc/app.conf`, o OverlayFS procura de cima para baixo e usa a primeira camada que tiver o arquivo. Aqui ele só existe na camada `debian-slim`, então é de lá que vem.",
        "Ler é barato: nada é copiado, só consultado.",
      ],
      metrics: metrics("4 + 1", "275 MB", 1),
      terminal: { suggest: [PS, DIFF], outputs: { [PS]: ps(PS_WEB), [DIFF]: "" } },
      stage: stage([
        imageStack(true),
        webStack({ rw: undefined, baseOverride: { status: "hi", files: baseFiles(true) } }),
      ]),
    },
    // 4
    {
      kind: "problema",
      nav: "Escrita",
      title: "Escrever no que é só leitura",
      body: [
        "Agora o app altera `/etc/app.conf`. As camadas da imagem não podem mudar, então o OverlayFS faz um **copy-up**: copia o arquivo inteiro para a camada gravável e altera a cópia.",
        "A imagem continua intacta e o container passa a ver a versão nova. Quem mexe no arquivo é só este container.",
      ],
      changes: ["app.conf copiado para a camada gravável", "A imagem não mudou"],
      callout: { kind: "atencao", text: "Arquivo grande alterado significa cópia grande. Banco de dados dentro do container é má ideia: use um volume." },
      metrics: metrics("4 + 1", "275 MB", 1),
      terminal: { suggest: [DIFF, PS], outputs: { [DIFF]: DIFF_COPYUP, [PS]: ps(PS_WEB) } },
      stage: stage([
        imageStack(true),
        webStack({
          rw: undefined,
          rwFiles: [{ name: "/etc/app.conf", tone: "warn" }],
          baseOverride: { files: baseFiles(true) },
          merged: { label: "visão do container", files: MERGED_FILES.map((f) => (f.name === "/etc/app.conf" ? { ...f, from: "rw" } : f)) },
        }),
      ]),
    },
    // 5
    {
      kind: "conceito",
      nav: "Apagar",
      title: "Apagar não remove de verdade",
      body: [
        "O app executa `rm -r /usr/share/doc`. Não dá para apagar de uma camada de baixo, então a camada gravável ganha um **whiteout**: um arquivo especial (dispositivo de caractere 0/0) com o nome `doc`, que esconde o original na visão unificada. No tar de uma camada, a mesma marca vira `.wh.doc`.",
        "O espaço da imagem não diminui, só some da vista do container. Por isso apagar em um `RUN` posterior do Dockerfile não encolhe a imagem.",
      ],
      changes: ["+ whiteout de doc na camada gravável", "/usr/share/doc some da visão do container"],
      metrics: metrics("4 + 1", "275 MB", 1),
      terminal: { suggest: [DIFF], outputs: { [DIFF]: DIFF_WHITEOUT, [PS]: ps(PS_WEB) } },
      stage: stage([
        imageStack(true),
        webStack({
          rw: undefined,
          rwFiles: [{ name: "/etc/app.conf", tone: "warn" }, { name: "doc", whiteout: true }],
          baseOverride: { files: baseFiles(true) },
          merged: { label: "visão do container", files: MERGED_FILES.filter((f) => f.name !== "/usr/share/doc").map((f) => (f.name === "/etc/app.conf" ? { ...f, from: "rw" } : f)) },
        }),
      ]),
    },
    // 6
    {
      kind: "conceito",
      nav: "Compartilhar",
      title: "Dois containers, uma cópia das camadas",
      body: [
        "Um segundo container, o `worker`, usa a mesma imagem. Ele ganha a própria camada gravável, mas as quatro camadas de baixo são **compartilhadas**.",
        "O tamanho baixado continua em 275 MB e, no disco, as camadas existem uma vez só. Por isso subir muitos containers da mesma imagem é rápido e barato.",
      ],
      metrics: metrics("4 + 2", "275 MB", 2),
      terminal: { suggest: [PS], outputs: { [PS]: ps(PS_WEB, PS_WORKER), [DIFF]: DIFF_WHITEOUT } },
      stage: stage([
        imageStack(),
        webStack({
          rw: undefined,
          rwFiles: [{ name: "/etc/app.conf", tone: "warn" }, { name: "doc", whiteout: true }],
          merged: null,
        }),
        workerStack(),
      ]),
    },
    // 7
    {
      kind: "problema",
      nav: "Uma linha muda",
      title: "Uma linha de código invalida o cache",
      body: [
        "No Dockerfile ruim, o `COPY . .` vem antes do `RUN mvn dependency:go-offline`. Mudar uma linha do código muda o conteúdo do `COPY`, e o cache da camada é invalidado.",
        "O cache é em cascata: invalidou uma camada, todas as de cima são refeitas. Resultado: as dependências são baixadas de novo, 60 MB a cada build.",
      ],
      metrics: metrics("4", "60 MB", 2, "bad"),
      terminal: { suggest: [HIST], outputs: { [HIST]: HISTORY, [PS]: ps(PS_WEB, PS_WORKER) } },
      stage: stage([badBuild("ok", true), badBuild("bad", false)]),
    },
    // 8
    {
      kind: "solucao",
      nav: "Ordem certa",
      title: "Copie primeiro o que muda menos",
      body: [
        "Copie só o `pom.xml`, resolva as dependências e só depois copie o código. O `pom.xml` quase nunca muda, então essas camadas ficam em cache.",
        "Agora, mudar uma linha do código refaz só a última camada, o `app.jar`: 12 MB em vez de 60 MB.",
      ],
      callout: { kind: "chave", text: "Ordene o Dockerfile do que muda menos para o que muda mais." },
      cmd: BUILD_CMD,
      metrics: metrics("4", "12 MB", 2, "ok"),
      terminal: { suggest: [BUILD_CMD, HIST], outputs: { [BUILD_CMD]: BUILD, [HIST]: HISTORY } },
      stage: stage([goodBuild(false), goodBuild(true)]),
    },
    // 9
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "Imagem é uma pilha de camadas de leitura. O container adiciona uma camada gravável e o OverlayFS junta tudo numa visão única, com copy-up para escrever e whiteout para apagar.",
        "Camadas são compartilhadas entre containers e entram no cache do build. Um bom Dockerfile ordena as instruções do que muda menos para o que muda mais.",
      ],
      metrics: metrics("4", "275 MB", 2),
      terminal: { suggest: [PS, HIST], outputs: { [PS]: ps(PS_WEB, PS_WORKER), [HIST]: HISTORY, [DIFF]: DIFF_WHITEOUT } },
      stage: stage([
        imageStack(),
        webStack({
          rw: undefined,
          rwFiles: [{ name: "/etc/app.conf", tone: "warn" }, { name: "doc", whiteout: true }],
          merged: { label: "visão do container", files: MERGED_FILES.filter((f) => f.name !== "/usr/share/doc").map((f) => (f.name === "/etc/app.conf" ? { ...f, from: "rw" } : f)) },
        }),
        containerStack("worker", "Container worker", [rw(undefined), ...shared()]),
      ]),
    },
  ],
};

/** (u, v) em colunas e linhas da TELA -> (x, y) da grade isométrica. u = x - y; v = x + y. */
const at = (u: number, v: number): [number, number] => [(v + u) / 2, (v - u) / 2];

// =====================================================================================
// Cena 4: imagem, container e registry (iso)
// =====================================================================================

type Q4 = {
  img?: "one" | "parts" | "none";
  index?: boolean;
  pulled?: boolean;
  cts?: { id: string; status?: Status; gone?: boolean }[];
  privateRegistry?: boolean;
};

const IMG_RES = { kind: "image" as const, name: "nginx:1.27", status: "190MB", age: "2 hours" };

function entidades4(q: Q4): IsoEntity[] {
  const out: IsoEntity[] = [];
  if (q.index) {
    out.push(
      zone("reg", ...at(-9, 0), 5, 5, { tone: "sky" }),
      box("idx", ...at(0, 2), "list", "índice no Docker Hub", { parent: "reg", size: "sm", tone: "sky" }),
      box("amd", ...at(-2.2, 7.4), "file-text", "amd64", { parent: "reg", size: "sm", tone: "ember" }),
      box("arm", ...at(2.2, 7.4), "file-text", "arm64", { parent: "reg", size: "sm", tone: "ember" }),
    );
  } else {
    out.push(box("reg", ...at(-9, 6), "cloud", "Docker Hub", { size: "md", tone: "sky", badges: [{ text: "nginx:1.27", tone: "info" }] }));
  }
  if (q.privateRegistry) out.push(box("reg2", ...at(-9, 15), "cloud", "registry da empresa", { size: "md", tone: "arcane", status: "new" }));
  out.push(zone("host", ...at(4, 0), 7, 7, { label: "seu host", tone: "zinc" }));
  if (q.img === "one") out.push(box("img", ...at(0, 10), "layers", "nginx:1.27", { parent: "host", size: "md", tone: "rune", status: q.pulled ? "new" : undefined, res: IMG_RES }));
  if (q.img === "parts") {
    out.push(
      box("man", ...at(-3.2, 7.5), "file-text", "manifesto", { parent: "host", size: "sm", tone: "rune", badges: [{ text: "sha256:9c1a…", tone: "info" }] }),
      box("cfg", ...at(0, 7.5), "cog", "config", { parent: "host", size: "sm", tone: "rune", badges: [{ text: "sha256:4be6…", tone: "info" }] }),
      box("lay", ...at(3.2, 7.5), "layers", "camadas", { parent: "host", size: "sm", tone: "rune", badges: [{ text: "tar + gzip", tone: "info" }] }),
    );
  }
  for (const [i, c] of (q.cts ?? []).entries()) {
    out.push(
      c.gone
        ? box(c.id, ...at(-3.2 + i * 3.2, 4), "container", c.id, { parent: "host", size: "sm", tone: "mana", status: "dead" })
        : container(c.id, ...at(-3.2 + i * 3.2, 4), c.id, { image: "nginx:1.27", status: "Up 2 minutes", age: "2 minutes" }, { parent: "host", status: c.status }),
    );
  }
  return out;
}

const m4 = (img: string, cts: number, reg: string): Metric[] => [
  { id: "img", label: "Imagens locais", value: img },
  { id: "ct", label: "Containers", value: cts },
  { id: "reg", label: "Origem", value: reg },
];

const PULL = "docker pull nginx:1.27";
const PULL_OUT = [
  "1.27: Pulling from library/nginx",
  "a2318d6c47ec: Pull complete",
  "e7d9a1b3c4f0: Pull complete",
  "9b0c2d4e6f81: Pull complete",
  "Digest: sha256:9c1a3f5b7d9e1c3a5b7d9f1e3c5a7b9d1f3e5c7a9b1d3f5e7c9a1b3d5f7e9c1a",
  "Status: Downloaded newer image for nginx:1.27",
  "docker.io/library/nginx:1.27",
].join("\n");
const MANIFEST = "docker manifest inspect nginx:1.27";
const MANIFEST_OUT = [
  "{",
  '  "schemaVersion": 2,',
  '  "mediaType": "application/vnd.oci.image.index.v1+json",',
  '  "manifests": [',
  '    { "platform": { "architecture": "amd64", "os": "linux" }, "digest": "sha256:5f70bf18a086..." },',
  '    { "platform": { "architecture": "arm64", "os": "linux" }, "digest": "sha256:1c2a8b1d7e3f..." }',
  "  ]",
  "}",
].join("\n");
const INSPECT_CFG = "docker image inspect nginx:1.27 --format '{{.Id}} {{.Architecture}}'";
const INSPECT_CFG_OUT = "sha256:4be6c0a1d9f24e8a7b3c5d1f9e0a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a amd64";
const TAG = "docker tag nginx:1.27 registry.exemplo.com/loja/nginx:1.27";
const PUSH = "docker push registry.exemplo.com/loja/nginx:1.27";
const PUSH_OUT = [
  "The push refers to repository [registry.exemplo.com/loja/nginx]",
  "a2318d6c47ec: Layer already exists",
  "e7d9a1b3c4f0: Pushed",
  "1.27: digest: sha256:9c1a3f5b7d9e1c3a5b7d9f1e3c5a7b9d1f3e5c7a9b1d3f5e7c9a1b3d5f7e9c1a size: 1570",
].join("\n");
const RM = "docker rm -f web1";

export const imagemContainerRegistry: SceneDef = {
  title: "Imagem, container e registry",
  summary: "Do pull no registry à imagem local e aos containers: o que viaja pela rede, o que é imutável e o que cada container acrescenta.",
  shell: "docker",
  goals: [
    { text: "Distinguir imagem, container e registry", step: 2 },
    { text: "Ler a anatomia de uma imagem (manifesto, config, camadas)", step: 4 },
    { text: "Entender por que um container não altera a imagem", step: 6 },
    { text: "Saber o que tag e push realmente copiam", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Registry",
      title: "A imagem mora num registry, o container mora no host",
      body: [
        "Um **registry** (Docker Hub, GHCR, ECR, um Harbor da empresa) é um servidor HTTP que guarda imagens. O seu host ainda não tem nenhuma: `docker images` volta vazio.",
        "Em Docker, três coisas diferentes têm nomes parecidos: a **imagem** (um molde imutável), o **container** (uma execução dela) e o **registry** (o depósito de imagens).",
      ],
      metrics: m4("0", 0, "-"),
      terminal: { suggest: ["docker images", "docker ps -a"] },
      focus: ["reg", "host"],
      stage: { mode: "iso", entities: entidades4({ img: "none" }) },
    },
    {
      kind: "conceito",
      nav: "docker pull",
      title: "docker pull baixa a imagem para o host",
      body: [
        "`docker pull nginx:1.27` pede ao registry o manifesto da imagem e baixa as camadas que o host ainda não tem. Agora existe uma **imagem local**, um objeto somente leitura.",
        "A imagem não executa nada: é como uma classe, e o container é a instância. O nome completo é `docker.io/library/nginx:1.27`: registry, repositório e tag.",
      ],
      changes: ["+ imagem nginx:1.27 no host"],
      cmd: PULL,
      metrics: m4("1", 0, "Docker Hub"),
      terminal: { suggest: [PULL, "docker images"], outputs: { [PULL]: PULL_OUT } },
      focus: ["reg", "img"],
      stage: { mode: "iso", entities: entidades4({ img: "one", pulled: true }), flows: [flow("reg", "img", 3, { kind: "data", label: "pull" })] },
    },
    {
      kind: "conceito",
      nav: "Multi-arquitetura",
      title: "O mesmo nome serve a várias plataformas",
      body: [
        "`nginx:1.27` aponta para um **índice** (*image index*), que lista uma imagem por plataforma: `linux/amd64`, `linux/arm64` e outras. O Docker escolhe a entrada que combina com a máquina.",
        "É por isso que o mesmo `docker pull` funciona num servidor x86 e num Mac com chip Apple. Quem constrói imagens para as duas plataformas publica um índice (com `docker buildx`).",
      ],
      callout: { kind: "bom-saber", text: "Imagem de arquitetura errada falha com `exec format error`. Verifique a plataforma quando CI e produção forem diferentes." },
      changes: ["Docker Hub mostra o índice", "+ amd64 escolhido para este host"],
      metrics: m4("1", 0, "índice → amd64"),
      terminal: { suggest: [MANIFEST], outputs: { [MANIFEST]: MANIFEST_OUT } },
      focus: ["reg", "idx", "amd", "img"],
      stage: {
        mode: "iso",
        entities: entidades4({ img: "one", index: true }),
        links: [link("idx", "amd", { style: "dashed" }), link("idx", "arm", { style: "dashed" })],
        flows: [flow("amd", "img", 2, { kind: "data" })],
      },
    },
    {
      kind: "conceito",
      nav: "Anatomia",
      title: "Uma imagem é manifesto, config e camadas",
      body: [
        "O **manifesto** lista os componentes por **digest** (`sha256:`, o hash do conteúdo). A **config** descreve o ambiente: `ENTRYPOINT`, `CMD`, variáveis e a lista de camadas. As **camadas** são arquivos tar comprimidos, cada um com o seu digest.",
        "Como tudo é endereçado pelo conteúdo, um digest nunca muda: se um byte mudar, o hash muda. A tag, ao contrário, é um apontador que o autor pode mover (aula 18).",
      ],
      callout: { kind: "chave", text: "Digest identifica conteúdo e é imutável. Tag é só um nome que aponta para um digest." },
      changes: ["imagem aberta: manifesto, config e camadas"],
      metrics: m4("1", 0, "Docker Hub"),
      terminal: { suggest: [INSPECT_CFG], outputs: { [INSPECT_CFG]: INSPECT_CFG_OUT } },
      focus: ["man", "cfg", "lay"],
      stage: { mode: "iso", entities: entidades4({ img: "parts" }), links: [link("man", "cfg", { style: "dashed" }), link("man", "lay", { style: "dashed" })] },
    },
    {
      kind: "conceito",
      nav: "Containers",
      title: "Muitos containers, uma imagem",
      body: [
        "`docker run` cria um container a partir da imagem: **a imagem mais uma camada gravável** só dele (aula seguinte). Dois containers da mesma imagem não duplicam as camadas de baixo, que são compartilhadas.",
        "A imagem continua sendo um objeto de leitura. O que o container escreve fica na camada dele e some junto com ele.",
      ],
      changes: ["+ container web1", "+ container web2"],
      cmd: "docker run -d --name web1 nginx:1.27",
      metrics: m4("1", 2, "local"),
      terminal: { suggest: ["docker ps", "docker images"] },
      focus: ["img", "web1", "web2"],
      stage: {
        mode: "iso",
        entities: entidades4({ img: "one", cts: [{ id: "web1", status: "new" }, { id: "web2", status: "new" }] }),
        links: [link("img", "web1", { style: "dashed" }), link("img", "web2", { style: "dashed" })],
      },
    },
    {
      kind: "conceito",
      nav: "Remover",
      title: "Remover o container não remove a imagem",
      body: [
        "`docker rm` descarta o container e a camada gravável dele. A imagem continua no host: o próximo `docker run` sobe um container novo em instantes, sem baixar nada.",
        "Remover a imagem é outra operação (`docker rmi`). Ela só funciona quando nenhum container, parado ou não, a usa.",
      ],
      changes: ["web1: removido", "imagem intacta"],
      cmd: RM,
      metrics: m4("1", 1, "local"),
      terminal: { suggest: [RM, "docker images"], outputs: { [RM]: "web1" } },
      focus: ["img", "web1", "web2"],
      stage: {
        mode: "iso",
        entities: entidades4({ img: "one", cts: [{ id: "web1", gone: true }, { id: "web2" }] }),
        links: [link("img", "web2", { style: "dashed" })],
      },
    },
    {
      kind: "solucao",
      nav: "tag e push",
      title: "Publicar: tag e push copiam só o que falta",
      body: [
        "`docker tag` cria um **segundo nome** para a mesma imagem, sem copiar nada. `docker push` envia ao registry da empresa só as camadas que ele ainda não tem (as outras aparecem como `Layer already exists`).",
        "O registry devolve o **digest** do manifesto. É ele que você grava no deploy quando precisa de uma versão que ninguém consiga mover.",
      ],
      changes: ["+ registry da empresa", "imagem enviada com o mesmo digest"],
      cmd: PUSH,
      metrics: m4("1", 1, "registry da empresa"),
      terminal: { suggest: [TAG, PUSH], outputs: { [TAG]: "", [PUSH]: PUSH_OUT } },
      focus: ["img", "reg2"],
      stage: { mode: "iso", entities: entidades4({ img: "one", cts: [{ id: "web2" }], privateRegistry: true }), flows: [flow("img", "reg2", 2, { kind: "data", label: "push" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "**Registry** guarda imagens; **imagem** é manifesto, config e camadas, endereçadas por digest e imutáveis; **container** é uma execução da imagem mais uma camada gravável.",
        "Tag é um nome que se move, digest é o conteúdo. O índice multi-arquitetura escolhe a plataforma no pull.",
      ],
      metrics: m4("1", 1, "-"),
      focus: ["img", "web2"],
      stage: { mode: "iso", entities: entidades4({ img: "one", cts: [{ id: "web2" }], privateRegistry: true }), links: [link("img", "web2", { style: "dashed" })] },
    },
  ],
};

// =====================================================================================
// Cena 6: ciclo de vida do container (iso, estados como estações)
// =====================================================================================

type Estado = "criado" | "rodando" | "pausado" | "parado" | "removido";

const ESTACAO: Record<Estado, { u: number; v: number; label: string; tone: "zinc" | "rune" | "ember" | "rose" | "sky" }> = {
  criado: { u: -8, v: 0, label: "created", tone: "zinc" },
  rodando: { u: 0, v: 0, label: "running", tone: "rune" },
  pausado: { u: 8, v: 0, label: "paused", tone: "ember" },
  parado: { u: -4, v: 10, label: "exited", tone: "rose" },
  removido: { u: 4, v: 10, label: "removido", tone: "sky" },
};

type Badge6 = { text: string; tone?: "ok" | "warn" | "bad" | "info" };

function ciclo(estado: Estado, o: { status?: Status; badges?: Badge6[]; res?: string; resAge?: string } = {}): IsoEntity[] {
  const out: IsoEntity[] = (Object.keys(ESTACAO) as Estado[]).map((k) => {
    const e = ESTACAO[k];
    return zone(`z-${k}`, ...at(e.u, e.v), 3, 3, { label: e.label, tone: e.tone, status: k === estado ? "hi" : "muted" });
  });
  const e = ESTACAO[estado];
  const [x, y] = at(e.u, e.v + 3);
  out.push(
    box("api", x, y, "container", "api", {
      z: 10,
      size: "sm",
      tone: "mana",
      status: o.status,
      badges: o.badges,
      res: o.res ? { kind: "container", name: "api", image: "loja/api:1.0", status: o.res, age: o.resAge } : undefined,
    }),
  );
  return out;
}

const m6 = (estado: string, extra: string, tone?: Metric["tone"]): Metric[] => [
  { id: "estado", label: "Estado", value: estado, tone },
  { id: "info", label: "Detalhe", value: extra },
];

const CREATE = "docker create --name api loja/api:1.0";
const START = "docker start api";
const PAUSE = "docker pause api";
const UNPAUSE = "docker unpause api";
const STOP = "docker stop api";
const KILL = "docker kill api";
const RMAPI = "docker rm api";
const INSPECT_ST = "docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' api";

export const cicloDeVida: SceneDef = {
  title: "O ciclo de vida de um container",
  summary: "Acompanhe um container por created, running, paused, exited e removed, e o que cada comando manda para o processo.",
  shell: "docker",
  goals: [
    { text: "Percorrer os estados de um container", step: 3 },
    { text: "Distinguir stop (SIGTERM) de kill (SIGKILL)", step: 5 },
    { text: "Saber o que sobrevive a um stop", step: 6 },
    { text: "Entender quando o container desaparece de verdade", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "created",
      title: "docker create: o container existe, mas não roda",
      body: [
        "`docker create` monta o container (camada gravável, configuração de rede e volumes) **sem iniciar** o processo. O estado é `created`: ainda não há processo, namespace ou cgroup.",
        "Quase ninguém usa `create` sozinho: o `docker run` é um `create` seguido de `start`. Mas o estado explica por que um `run` que falha na criação deixa um container `Created` para trás.",
      ],
      cmd: CREATE,
      metrics: m6("created", "sem processo"),
      terminal: {
        suggest: ["docker ps -a", CREATE, INSPECT_ST],
        outputs: { [CREATE]: "b7e14d0a93c2f5816a3d9e7c4b2a0f1d8e6c5b3a9f7d1e0c2b4a6d8f0e1c3a5b", [INSPECT_ST]: "created 0" },
      },
      focus: ["z-criado", "api"],
      stage: { mode: "iso", entities: ciclo("criado", { res: "Created", resAge: "10 seconds" }) },
    },
    {
      kind: "conceito",
      nav: "running",
      title: "docker start: o runc cria o processo",
      body: [
        "`docker start` leva o container ao estado `running`: o runtime cria o processo com os namespaces e os cgroups, e o PID 1 do container começa a executar o `ENTRYPOINT`.",
        "O estado `running` só diz que o processo existe, não que a aplicação está pronta para receber tráfego. Para isso existe o `HEALTHCHECK` (módulo de Dockerfile).",
      ],
      changes: ["api: created → running"],
      cmd: START,
      metrics: m6("running", "Up 3 minutes", "ok"),
      terminal: { suggest: ["docker ps", START, INSPECT_ST], outputs: { [START]: "api", [INSPECT_ST]: "running 0" } },
      focus: ["z-rodando", "api"],
      stage: { mode: "iso", entities: ciclo("rodando", { status: "ok", res: "Up 3 minutes", resAge: "3 minutes" }) },
    },
    {
      kind: "conceito",
      nav: "paused",
      title: "docker pause: congela sem avisar o processo",
      body: [
        "`docker pause` usa o **freezer do cgroup**: os processos do container param de ser escalonados. Diferente de um sinal, o processo **não é notificado** e não pode reagir. A memória permanece ocupada.",
        "`docker unpause` descongela e o processo continua do ponto exato. É útil para um snapshot consistente e para depuração, e tem pouco uso fora disso.",
      ],
      changes: ["api: running → paused"],
      cmd: PAUSE,
      metrics: m6("paused", "Up 3 minutes (Paused)", "warn"),
      terminal: { suggest: ["docker ps", PAUSE, UNPAUSE], outputs: { [PAUSE]: "api", [UNPAUSE]: "api", [INSPECT_ST]: "paused 0" } },
      focus: ["z-pausado", "api"],
      stage: { mode: "iso", entities: ciclo("pausado", { status: "warn", res: "Up 3 minutes (Paused)", resAge: "3 minutes", badges: [{ text: "freezer", tone: "warn" }] }) },
    },
    {
      kind: "solucao",
      nav: "stop",
      title: "docker stop: SIGTERM, espera e só então SIGKILL",
      body: [
        "`docker stop` envia **SIGTERM** ao PID 1 e espera até **10 segundos** (`-t` muda o prazo). Se o processo encerra antes, o container passa a `exited` com o código de saída dele. Uma JVM sai com **143** (128 + 15) depois de rodar os shutdown hooks.",
        "É a chance de a aplicação fechar conexões e terminar requisições em andamento. O código de saída fica registrado no `docker ps -a`.",
      ],
      callout: { kind: "chave", text: "stop é pedido educado; kill é ordem. O app só aproveita o pedido se tratar o SIGTERM (aula 15)." },
      changes: ["api: paused → exited (143)"],
      cmd: STOP,
      metrics: m6("exited", "código 143", "ok"),
      terminal: { suggest: ["docker ps -a", STOP, INSPECT_ST], outputs: { [STOP]: "api", [INSPECT_ST]: "exited 143" } },
      focus: ["z-parado", "api"],
      stage: { mode: "iso", entities: ciclo("parado", { res: "Exited (143) 2 seconds ago", resAge: "5 minutes", badges: [{ text: "SIGTERM · 143", tone: "ok" }] }) },
    },
    {
      kind: "problema",
      nav: "stop sem efeito",
      title: "Se o app ignora o SIGTERM, o stop demora 10 s",
      body: [
        "Quando o PID 1 não trata o SIGTERM (comum quando o shell é o PID 1, como num `CMD` em *shell form*), o `docker stop` espera os **10 segundos** inteiros e então envia **SIGKILL**. O container sai com **137** (128 + 9), e nenhum shutdown hook rodou.",
        "`docker kill` pula a espera e manda SIGKILL direto (ou o sinal de `-s`). Use-o para o que travou, não para o desligamento normal.",
      ],
      callout: { kind: "atencao", text: "Deploy que leva 10 s por container e termina com 137 é sinal de PID 1 que não repassa SIGTERM." },
      changes: ["api: exited (137) depois de 10 s"],
      metrics: m6("exited", "código 137 após 10 s", "bad"),
      terminal: { suggest: [KILL, "docker ps -a", INSPECT_ST], outputs: { [KILL]: "api", [INSPECT_ST]: "exited 137" } },
      focus: ["z-parado", "api"],
      stage: { mode: "iso", entities: ciclo("parado", { status: "warn", res: "Exited (137) 2 seconds ago", resAge: "5 minutes", badges: [{ text: "SIGKILL · 137", tone: "bad" }] }) },
    },
    {
      kind: "conceito",
      nav: "start de novo",
      title: "Parado não é perdido: a camada gravável fica",
      body: [
        "Um container `exited` guarda a camada gravável e a configuração. `docker start` o reinicia **no mesmo estado de arquivos** em que parou; `docker restart` é um stop seguido de start.",
        "Por isso `docker ps -a` acumula containers parados e ocupa disco. E por isso o que o app grava fora de volume sobrevive a um `restart`, mas não a um `rm`.",
      ],
      changes: ["api: exited → running"],
      cmd: START,
      metrics: m6("running", "mesma camada gravável", "ok"),
      terminal: { suggest: ["docker ps", START], outputs: { [START]: "api" } },
      focus: ["z-rodando", "api"],
      stage: { mode: "iso", entities: ciclo("rodando", { status: "ok", res: "Up 4 seconds", resAge: "5 minutes" }) },
    },
    {
      kind: "problema",
      nav: "rm",
      title: "docker rm: o container e os dados dele somem",
      body: [
        "`docker rm` apaga o container e a **camada gravável**. O que não estava em um volume desaparece. Um container em execução só sai com `-f`, que faz um kill antes.",
        "Para tarefas descartáveis, `docker run --rm` remove o container assim que o processo termina. Na prática, containers de produção são tratados como **descartáveis**: o que importa vive em volume ou fora.",
      ],
      changes: ["api: removido (camada gravável apagada)"],
      cmd: RMAPI,
      metrics: m6("removido", "nada a recuperar", "bad"),
      terminal: { suggest: ["docker ps -a", RMAPI], outputs: { [RMAPI]: "api" } },
      focus: ["z-removido", "api"],
      stage: { mode: "iso", entities: ciclo("removido", { status: "dead" }) },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Os estados em uma tabela",
      body: [
        "`created → running → paused / exited → removed`. Além desses, o Docker usa `restarting` (a política de restart está reiniciando), `removing` (em remoção) e `dead` (remoção que falhou e deixou resíduos).",
        "O que mais cai em prova e em incidente: `stop` envia SIGTERM e depois de 10 s SIGKILL, `kill` envia SIGKILL, `pause` congela sem avisar, e `rm` apaga a camada gravável.",
      ],
      metrics: m6("removido", "fim do ciclo"),
      extra: [
        {
          kind: "grid",
          label: "Estados do container",
          colHeaders: ["Estado", "Como chega", "O que existe"],
          rows: [
            ["created", "docker create", "configuração e camada gravável, sem processo"],
            ["running", "docker start / run", "processo, namespaces e cgroup"],
            ["paused", "docker pause", "processo congelado pelo freezer"],
            ["restarting", "restart policy", "o Docker está recriando o processo"],
            ["exited", "stop, kill ou fim do processo", "camada gravável e código de saída"],
            ["removing / dead", "docker rm (e falha)", "sendo apagado; ou com resíduos"],
          ],
        } satisfies GridPanel,
      ],
      focus: ["z-removido", "api"],
      stage: { mode: "iso", entities: ciclo("removido", { status: "dead" }) },
    },
  ],
};

// =====================================================================================
// Cena 7: logs (iso)
// =====================================================================================

type Q7 = { arquivo?: "ok" | "perdido"; stdout?: boolean; disco?: number; rot?: boolean; coletor?: boolean; dead?: boolean };

function entidades7(q: Q7): IsoEntity[] {
  const out: IsoEntity[] = [
    q.dead
      ? box("app", ...at(-10, 7), "container", "api", { size: "sm", tone: "mana", status: "dead" })
      : box("app", ...at(-10, 7), "container", "api", { size: "sm", tone: "mana", res: { kind: "container", name: "api", image: "loja/api:1.0", status: "Up 2 hours", age: "2 hours" } }),
  ];
  if (q.arquivo) {
    out.push(box("arq", ...at(-3.5, 7), "file-text", "/var/log/app.log", { size: "sm", tone: "ember", status: q.arquivo === "perdido" ? "dead" : "ok", badges: [{ text: "camada gravável", tone: q.arquivo === "perdido" ? "bad" : "info" }] }));
  }
  if (q.stdout) {
    out.push(box("shim", ...at(-3.5, 7), "layers", "shim", { size: "sm", tone: "ember", badges: [{ text: "captura stdout", tone: "info" }] }));
    out.push(box("jlog", ...at(3, 7), "file-text", q.rot ? "json.log (3 × 10m)" : "…-json.log", { size: "sm", tone: "rune", status: q.disco && q.disco > 90 ? "warn" : undefined }));
  }
  if (q.disco !== undefined) {
    out.push(box("disco", ...at(3, 16.5), "hard-drive", "disco do host", { size: "md", tone: "zinc", meter: q.disco, status: q.disco > 90 ? "bad" : undefined, badges: q.disco > 90 ? [{ text: "cheio", tone: "bad" }] : undefined }));
  }
  if (q.coletor) {
    out.push(box("agente", ...at(9.5, 7), "search", "agente", { size: "sm", tone: "violet", badges: [{ text: "Fluent Bit ou Vector", tone: "info" }] }));
    out.push(box("backend", ...at(9.5, 14), "database", "Loki ou Elastic", { size: "md", tone: "arcane" }));
  }
  return out;
}

const m7 = (a: string, b: string, tone?: Metric["tone"]): Metric[] => [
  { id: "a", label: "Onde o log está", value: a },
  { id: "b", label: "Sobrevive ao rm?", value: b, tone },
];

const LOGS = "docker logs --tail 2 api";
const LOGS_OUT = [
  '{"ts":"2026-11-27T14:02:11Z","level":"INFO","msg":"pedido criado","pedido":"A-1042","ms":38}',
  '{"ts":"2026-11-27T14:02:12Z","level":"WARN","msg":"estoque baixo","sku":"CAM-77","ms":12}',
].join("\n");
const LOGCFG = "docker inspect -f '{{.HostConfig.LogConfig}}' api";
const DAEMON_JSON = "cat /etc/docker/daemon.json";
const DAEMON_JSON_OUT = ["{", '  "log-driver": "json-file",', '  "log-opts": { "max-size": "10m", "max-file": "3" }', "}"].join("\n");
const DU = "sudo du -sh /var/lib/docker/containers/*/*-json.log";
const DRIVERS_GRID: GridPanel = {
  kind: "grid",
  label: "Drivers de log do Docker",
  colHeaders: ["Driver", "docker logs", "Rotação"],
  rows: [
    ["json-file (padrão)", "funciona", "só com max-size e max-file"],
    ["local", "funciona", "padrão: 20 MB × 5 arquivos, comprimido"],
    ["journald", "funciona", "controlada pelo journald"],
    ["syslog, fluentd, gelf, awslogs", "dual logging a partir do Docker 20.10", "do lado do destino"],
  ],
};

export const logsEmContainers: SceneDef = {
  title: "Logs em containers: stdout, drivers e rotação",
  summary: "Veja por que o log em arquivo some com o container, como o stdout vira log do Docker e como evitar o disco cheio.",
  shell: "docker",
  goals: [
    { text: "Entender por que log em arquivo se perde", step: 2 },
    { text: "Ver o caminho do stdout até o docker logs", step: 3 },
    { text: "Configurar a rotação de logs", step: 5 },
    { text: "Saber onde entra o coletor de logs", step: 7 },
  ],
  steps: [
    {
      kind: "contexto",
      nav: "Log em arquivo",
      title: "O app escreve o log em um arquivo",
      body: [
        "A aplicação grava em `/var/log/app.log`, como numa VM. Dentro do container, esse arquivo vive na **camada gravável**, a mesma que some quando o container é removido.",
        "Funciona bem enquanto o container existe. O problema aparece quando você mais precisa do log: depois de um crash e de uma recriação.",
      ],
      metrics: m7("dentro do container", "?"),
      focus: ["app", "arq"],
      stage: { mode: "iso", entities: entidades7({ arquivo: "ok" }), links: [link("app", "arq")] },
    },
    {
      kind: "problema",
      nav: "Perdido",
      title: "Container recriado, histórico perdido",
      body: [
        "O deploy recria o container (`docker rm` seguido de `docker run`), ou o orquestrador o reinicia em outro host. O log em arquivo foi junto com a camada gravável. Para investigar o incidente, não sobrou nada.",
        "Mesmo vivo, ler o log exige entrar no container e saber onde o arquivo está, e cada app o grava num lugar diferente.",
      ],
      callout: { kind: "atencao", text: "Log em arquivo dentro do container é descartável como o resto da camada gravável." },
      changes: ["container removido", "app.log perdido"],
      metrics: m7("destruído com o container", "não", "bad"),
      focus: ["app", "arq"],
      stage: { mode: "iso", entities: entidades7({ arquivo: "perdido", dead: true }), links: [link("app", "arq")] },
    },
    {
      kind: "solucao",
      nav: "stdout",
      title: "Escreva em stdout e stderr",
      body: [
        "A convenção de containers é o app **escrever o log em stdout e stderr** (12-factor). O shim captura esses dois fluxos e entrega ao **logging driver**; o padrão, `json-file`, grava uma linha JSON por registro em `/var/lib/docker/containers/<id>/<id>-json.log`.",
        "`docker logs` lê esse arquivo. O formato é uniforme para qualquer aplicação, e o log sobrevive a um `stop`. Só desaparece com o `rm` do container.",
      ],
      changes: ["+ shim captura stdout/stderr", "+ arquivo json.log no host"],
      cmd: LOGS,
      metrics: m7("stdout → json.log no host", "somente até o rm"),
      terminal: { suggest: [LOGS, LOGCFG], outputs: { [LOGS]: LOGS_OUT, [LOGCFG]: "{json-file map[]}" } },
      focus: ["app", "shim", "jlog"],
      stage: { mode: "iso", entities: entidades7({ stdout: true }), links: [link("shim", "jlog")], flows: [flow("app", "jlog", 2, { via: ["shim"], kind: "data" })] },
    },
    {
      kind: "problema",
      nav: "Disco cheio",
      title: "O json-file não gira por padrão",
      body: [
        "Com o `json-file` sem opções, **não há rotação**: o arquivo cresce sem limite enquanto o container existir. Um app falante enche o disco do host, e então o Docker, o banco de outros containers e o sistema inteiro falham.",
        "É um incidente clássico de produção: o diagnóstico é `du` nos arquivos `-json.log`, e a causa é uma configuração que ninguém fez.",
      ],
      callout: { kind: "atencao", text: "Sem max-size e max-file, o log de um container pode consumir o disco inteiro do host." },
      changes: ["json.log cresce sem limite", "disco do host: 98%"],
      metrics: m7("json.log", "até o rm", "bad"),
      terminal: { suggest: [DU], outputs: { [DU]: "41G\t/var/lib/docker/containers/8f2a1c4d9b3e.../8f2a1c4d9b3e...-json.log" } },
      focus: ["jlog", "disco"],
      stage: { mode: "iso", entities: entidades7({ stdout: true, disco: 98 }), links: [link("shim", "jlog"), link("jlog", "disco", { style: "dashed" })], flows: [flow("app", "jlog", 4, { via: ["shim"], kind: "heavy" })] },
    },
    {
      kind: "solucao",
      nav: "Rotação",
      title: "Configure max-size e max-file",
      body: [
        "No `daemon.json`, `max-size` limita o tamanho de cada arquivo e `max-file` quantos são mantidos. Com `10m` e `3`, o Docker guarda no máximo cerca de 30 MB por container, descartando o mais antigo.",
        "A configuração vale para **containers criados depois** dela: os existentes precisam ser recriados. Também dá para definir por container, com `--log-opt max-size=10m`.",
      ],
      cmd: "docker run -d --log-opt max-size=10m --log-opt max-file=3 loja/api:1.0",
      changes: ["json.log limitado a 3 arquivos de 10 MB", "disco do host: 22%"],
      metrics: m7("até 3 × 10 MB", "somente até o rm", "ok"),
      terminal: { suggest: [DAEMON_JSON, LOGCFG], outputs: { [DAEMON_JSON]: DAEMON_JSON_OUT, [LOGCFG]: "{json-file map[max-file:3 max-size:10m]}" } },
      focus: ["jlog", "disco"],
      stage: { mode: "iso", entities: entidades7({ stdout: true, disco: 22, rot: true }), links: [link("shim", "jlog"), link("jlog", "disco", { style: "dashed" })], flows: [flow("app", "jlog", 2, { via: ["shim"], kind: "data" })] },
    },
    {
      kind: "conceito",
      nav: "Drivers",
      title: "Drivers: onde o Docker entrega o log",
      body: [
        "O driver `local` já rotaciona por padrão e usa um formato interno mais compacto. `journald` entrega ao systemd. Drivers remotos (`fluentd`, `gelf`, `awslogs`, `syslog`) enviam direto ao destino.",
        "O `docker logs` precisa de uma cópia local do log. Os drivers que guardam em disco, como `json-file`, `local` e `journald`, funcionam. Para os remotos, a partir do Docker 20.10 o **dual logging** mantém um cache local e o `docker logs` volta a funcionar.",
      ],
      changes: ["Tabela dos drivers"],
      metrics: m7("conforme o driver", "depende do destino"),
      extra: [DRIVERS_GRID],
      focus: ["jlog", "disco"],
      stage: { mode: "iso", entities: entidades7({ stdout: true, disco: 22, rot: true }), links: [link("shim", "jlog"), link("jlog", "disco", { style: "dashed" })] },
    },
    {
      kind: "solucao",
      nav: "Coletor",
      title: "Em produção, um coletor leva o log para fora do host",
      body: [
        "Um agente (Fluent Bit, Vector, Promtail) lê os arquivos de log e envia para um backend de busca (Loki, Elasticsearch, CloudWatch). O log passa a sobreviver ao container **e** ao host, e fica pesquisável.",
        "Para o backend filtrar, escreva logs **estruturados** (JSON com `level`, `trace_id`, `pedido`). É o formato do código Java desta aula.",
      ],
      changes: ["+ agente coletor", "+ backend de logs"],
      metrics: m7("backend de logs", "sim", "ok"),
      terminal: { suggest: [LOGS], outputs: { [LOGS]: LOGS_OUT } },
      focus: ["jlog", "agente", "backend"],
      stage: { mode: "iso", entities: entidades7({ stdout: true, disco: 22, rot: true, coletor: true }), links: [link("jlog", "agente"), link("agente", "backend")], flows: [flow("jlog", "backend", 2, { via: ["agente"], kind: "data" })] },
    },
    {
      kind: "resumo",
      nav: "Resumo",
      title: "O que você viu",
      body: [
        "Log em arquivo dentro do container se perde com ele. A convenção é escrever em **stdout e stderr** e deixar o Docker e o coletor cuidarem do resto.",
        "Configure **rotação** (`max-size` e `max-file`, ou o driver `local`) em todo host, e envie os logs a um backend. Logs estruturados em JSON facilitam a busca.",
      ],
      metrics: m7("stdout → coletor", "sim", "ok"),
      focus: ["jlog", "agente", "backend"],
      stage: { mode: "iso", entities: entidades7({ stdout: true, disco: 22, rot: true, coletor: true }), links: [link("jlog", "agente"), link("agente", "backend")] },
    },
  ],
};
