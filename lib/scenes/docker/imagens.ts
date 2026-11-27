/**
 * Cenas do módulo de imagens Docker.
 * camadasEOverlayfs: modo camadas, shell docker.
 * Chave de registro na Fase 0: cloud-devops/imagens-layers-dockerfile; definitiva: docker/camadas-e-overlayfs.
 */
import type { Layer, LayerFile, LayerStack, SceneDef, SceneStep, Status } from "../types";

// ---------- camadas da imagem loja/app:1.0 ----------

const app = (o: Partial<Layer> = {}): Layer => ({ id: "app", label: "app.jar", sub: "12 MB", tone: "arcane", readonly: true, files: [{ name: "app.jar" }], ...o });
const deps = (o: Partial<Layer> = {}): Layer => ({ id: "deps", label: "dependências", sub: "48 MB", tone: "sky", readonly: true, files: [{ name: "lib/*.jar" }], ...o });
const jre = (o: Partial<Layer> = {}): Layer => ({ id: "jre", label: "JRE 21", sub: "140 MB", tone: "ember", readonly: true, files: [{ name: "/opt/java" }], ...o });
const base = (o: Partial<Layer> = {}): Layer => ({
  id: "base",
  label: "debian-slim",
  sub: "75 MB",
  tone: "zinc",
  readonly: true,
  files: [{ name: "/etc" }, { name: "/bin" }, { name: "/usr" }],
  ...o,
});

const imageStack = (): LayerStack => ({
  id: "img",
  label: "Imagem loja/app:1.0",
  orientation: "bands",
  layers: [app(), deps(), jre(), base()],
});

/** Camadas de baixo vistas de dentro de um container: as mesmas ids, esmaecidas e sem chips. */
const shared = (baseOverride: Partial<Layer> = {}): Layer[] => [
  app({ status: "muted", files: undefined }),
  deps({ status: "muted", files: undefined }),
  jre({ status: "muted", files: undefined }),
  base({ status: "muted", files: undefined, ...baseOverride }),
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
        imageStack(),
        webStack({ rw: undefined, baseOverride: { status: "hi", files: [{ name: "app.conf", tone: "info" }, { name: "/bin" }, { name: "/usr" }] } }),
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
        imageStack(),
        webStack({
          rw: undefined,
          rwFiles: [{ name: "app.conf", tone: "warn" }],
          baseOverride: { files: [{ name: "app.conf", tone: "info" }, { name: "/bin" }, { name: "/usr" }] },
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
        "O app executa `rm -r /usr/share/doc`. Não dá para apagar de uma camada de baixo, então a camada gravável ganha um **whiteout** (`.wh.doc`): uma marca que esconde o arquivo na visão unificada.",
        "O espaço da imagem não diminui, só some da vista do container. Por isso apagar em um `RUN` posterior do Dockerfile não encolhe a imagem.",
      ],
      changes: ["+ .wh.doc na camada gravável", "/usr/share/doc some da visão do container"],
      metrics: metrics("4 + 1", "275 MB", 1),
      terminal: { suggest: [DIFF], outputs: { [DIFF]: DIFF_WHITEOUT, [PS]: ps(PS_WEB) } },
      stage: stage([
        imageStack(),
        webStack({
          rw: undefined,
          rwFiles: [{ name: "app.conf", tone: "warn" }, { name: "doc", whiteout: true }],
          baseOverride: { files: [{ name: "app.conf", tone: "info" }, { name: "/bin" }, { name: "/usr" }] },
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
          rwFiles: [{ name: "app.conf", tone: "warn" }, { name: "doc", whiteout: true }],
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
          rwFiles: [{ name: "app.conf", tone: "warn" }, { name: "doc", whiteout: true }],
          merged: { label: "visão do container", files: MERGED_FILES.filter((f) => f.name !== "/usr/share/doc").map((f) => (f.name === "/etc/app.conf" ? { ...f, from: "rw" } : f)) },
        }),
        containerStack("worker", "Container worker", [rw(undefined), ...shared()]),
      ]),
    },
  ],
};
