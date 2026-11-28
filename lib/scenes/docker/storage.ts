/**
 * Cenas do módulo "Volumes e dados" da trilha Docker.
 * volumesBindMountsTmpfs: isométrico, shell docker (volumes-bind-mounts-tmpfs).
 * persistenciaPermissoesBackup: isométrico, shell docker (persistencia-permissoes-e-backup).
 */
import type { IsoEntity, Metric, SceneDef, Status } from "../types";
import { box, flow, link, zone } from "../kit/common";
import { container, volume } from "../kit/docker";

/** (u, v) em colunas e linhas da TELA -> (x, y) da grade isométrica. u = x - y; v = x + y. */
const at = (u: number, v: number): [number, number] => [(v + u) / 2, (v - u) / 2];

const host = (label = "Host Linux") => zone("host", ...at(0, 0), 9, 9, { label, tone: "zinc" });

// =====================================================================================
// Cena 11: volumes, bind mounts e tmpfs (iso)
// =====================================================================================

type Q11 = {
  ct?: { status?: Status; res?: string; badges?: { text: string; tone?: "ok" | "warn" | "bad" | "info" }[]; name?: string };
  rw?: { status?: Status; badge?: string };
  vol?: { status?: Status; badge?: string; label?: string };
  pasta?: { status?: Status; badge?: string; label?: string };
  ram?: { status?: Status; badge?: string };
  img?: { status?: Status; badges?: { text: string; tone?: "ok" | "warn" | "bad" | "info" }[] };
};

function e11(q: Q11): IsoEntity[] {
  const out: IsoEntity[] = [host()];
  if (q.ct) {
    const res = q.ct.res ?? "Up 3 minutes";
    out.push(
      container("ct", ...at(0, 9.5), q.ct.name ?? "api", { image: "loja/api:1.0", status: res, age: "3 minutes" }, { parent: "host", status: q.ct.status, badges: q.ct.badges }),
    );
  }
  if (q.rw) out.push(box("rw", ...at(0, 2.5), "layers", "camada gravável", { parent: "host", size: "sm", tone: "zinc", status: q.rw.status, badges: q.rw.badge ? [{ text: q.rw.badge, tone: q.rw.status === "dead" ? "bad" : "warn" }] : undefined }));
  if (q.img) out.push(box("img", ...at(0, 2.5), "box", "loja/api:1.0", { parent: "host", size: "sm", tone: "arcane", status: q.img.status, badges: q.img.badges }));
  if (q.vol) out.push({ ...volume("vol", ...at(6.5, 9.5), q.vol.label ?? "dados", { parent: "host", status: q.vol.status }), badges: q.vol.badge ? [{ text: q.vol.badge, tone: "info" }] : undefined });
  if (q.pasta) out.push(box("pasta", ...at(-6.5, 9.5), "folder", q.pasta.label ?? "./config", { parent: "host", size: "sm", tone: "sky", status: q.pasta.status, badges: q.pasta.badge ? [{ text: q.pasta.badge, tone: "info" }] : undefined }));
  if (q.ram) out.push(box("ram", ...at(0, 16.5), "cpu", "tmpfs", { parent: "host", size: "sm", tone: "rose", status: q.ram.status, badges: q.ram.badge ? [{ text: q.ram.badge, tone: q.ram.status === "dead" ? "bad" : "info" }] : undefined }));
  return out;
}

const m11 = (a: string, b: string, tone?: Metric["tone"]): Metric[] => [
  { id: "a", label: "Dados do app", value: a, tone },
  { id: "b", label: "Sobrevivem ao docker rm", value: b },
];

const PS11 = "docker ps";
const PS_A_VAZIO = "CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES";
const DIFF1 = "docker diff api";
const DIFF1_OUT = ["A /data", "A /data/pedidos.db"].join("\n");
const RM_API = "docker rm -f api";
const RUN_VOL = "docker run -d --name api --mount type=volume,src=dados,dst=/data loja/api:1.0";
const VOL_LS = "docker volume ls";
const VOL_LS_OUT = ["DRIVER    VOLUME NAME", "local     dados"].join("\n");
const VOL_INSP = "docker volume inspect dados --format '{{.Mountpoint}}'";
const VOL_INSP_OUT = "/var/lib/docker/volumes/dados/_data";
const LS_VOL = "docker run --rm -v dados:/data loja/api:1.0 ls /data";
const LS_BIND = 'docker run --rm -v "$PWD/vazia:/data" loja/api:1.0 ls /data';
const RUN_BIND = 'docker run -d --name api --mount type=bind,src="$PWD/config",dst=/config,readonly loja/api:1.0';
const BIND_RO = "docker exec api touch /config/app.yml";
const BIND_RO_OUT = "touch: /config/app.yml: Read-only file system";
const BIND_FAIL = 'docker run --rm --mount type=bind,src="$PWD/confg",dst=/config loja/api:1.0';
const BIND_FAIL_OUT = 'docker: Error response from daemon: invalid mount config for type "bind": bind source path does not exist: /srv/loja/confg';
const RUN_HIDE = 'docker run --rm -v "$PWD/vazia:/app" loja/api:1.0';
const RUN_HIDE_OUT = "Error: Unable to access jarfile /app/app.jar";
const MOUNT_TMPFS = "docker exec api mount | grep cache";
const MOUNT_TMPFS_OUT = "tmpfs on /cache type tmpfs (rw,nosuid,nodev,noexec,relatime,size=65536k)";
const DF_TMPFS = "docker exec api df -h /cache";
const DF_TMPFS_OUT = ["Filesystem                Size      Used Available Use% Mounted on", "tmpfs                    64.0M         0     64.0M   0% /cache"].join("\n");
const INSP_MOUNTS = "docker inspect api --format '{{json .Mounts}}'";
const INSP_MOUNTS_OUT =
  '[{"Type":"volume","Name":"dados","Source":"/var/lib/docker/volumes/dados/_data","Destination":"/data","Driver":"local","Mode":"z","RW":true,"Propagation":""},{"Type":"bind","Source":"/srv/loja/config","Destination":"/config","Mode":"ro","RW":false,"Propagation":"rprivate"}]';
const INSP_TMPFS = "docker inspect api --format '{{json .HostConfig.Tmpfs}}'";
const INSP_TMPFS_OUT = '{"/cache":"rw,size=64m"}';
const RUN_ALL = 'docker run -d --name api -v dados:/data -v "$PWD/config:/config:ro" --tmpfs /cache:rw,size=64m loja/api:1.0';

export const volumesBindMountsTmpfs: SceneDef = {
  title: "Volumes, bind mounts e tmpfs",
  summary: "Veja o que acontece com os dados de um container no docker rm e como cada tipo de montagem muda isso.",
  shell: "docker",
  goals: [
    { text: "Ver por que a camada gravável não serve para dados", step: 2 },
    { text: "Entender o volume nomeado e quando ele é populado", step: 5 },
    { text: "Distinguir bind mount de volume (e a armadilha de esconder a imagem)", step: 7 },
    { text: "Saber o que cada montagem preserva", step: 9 },
  ],
  steps: [
    // 1
    {
      kind: "contexto",
      nav: "Camada gravável",
      title: "Os dados do app vão para a camada gravável",
      body: [
        "A `api` guarda os pedidos em `/data/pedidos.db`. Como nenhuma montagem foi configurada, o arquivo nasce na **camada gravável** do container, a mesma que você viu no OverlayFS (aula 5).",
        "Enquanto o container existe, tudo funciona: o `docker diff` lista o que foi criado. O problema aparece quando o container deixa de existir.",
      ],
      metrics: m11("na camada gravável", "nada"),
      terminal: { suggest: [PS11, DIFF1], outputs: { [DIFF1]: DIFF1_OUT } },
      focus: ["ct", "rw"],
      stage: {
        mode: "iso",
        entities: e11({ ct: {}, rw: { badge: "/data/pedidos.db" } }),
        links: [link("ct", "rw")],
      },
    },
    // 2
    {
      kind: "problema",
      nav: "docker rm",
      title: "O docker rm leva os dados junto",
      body: [
        "Hora de atualizar a imagem: `docker rm -f api` e um `docker run` com a versão nova. O `rm` apaga o container **e** a camada gravável. O `pedidos.db` não existe mais, e o novo container começa do zero.",
        "Não é um bug do Docker: a camada gravável é do container, e o container é descartável por desenho.",
      ],
      callout: { kind: "atencao", text: "Dado que precisa sobreviver não pode morar na camada gravável." },
      changes: ["api removido", "camada gravável apagada: pedidos.db perdido"],
      cmd: RM_API,
      metrics: m11("perdidos", "nada", "bad"),
      terminal: { suggest: [RM_API, "docker ps -a"], outputs: { [RM_API]: "api", "docker ps -a": PS_A_VAZIO } },
      focus: ["ct", "rw"],
      stage: {
        mode: "iso",
        entities: e11({ ct: { status: "dead", res: "Removed" }, rw: { status: "dead", badge: "apagada" } }),
      },
    },
    // 3
    {
      kind: "solucao",
      nav: "Volume nomeado",
      title: "O volume é um diretório gerenciado pelo Docker",
      body: [
        "Um **volume nomeado** vive em `/var/lib/docker/volumes/dados/_data`, fora da camada gravável. O container o monta em `/data` e o app continua gravando como se fosse um diretório qualquer.",
        "O Docker cria o volume na primeira vez que o nome aparece. Com `--mount`, o tipo da montagem (`type=volume`) fica explícito no comando.",
      ],
      changes: ["+ volume dados", "api monta dados em /data"],
      cmd: RUN_VOL,
      metrics: m11("no volume dados", "o volume"),
      terminal: { suggest: [RUN_VOL, VOL_LS, VOL_INSP], outputs: { [RUN_VOL]: "2c9d61e0a7f4b83d5c1e9a0b7d4f2e68a1c3b5d79e0f2a4c6b8d1e3f5a7c9b0d", [VOL_LS]: VOL_LS_OUT, [VOL_INSP]: VOL_INSP_OUT } },
      focus: ["ct", "vol"],
      stage: {
        mode: "iso",
        entities: e11({ ct: { status: "new" }, vol: { status: "new", badge: "pedidos.db" } }),
        links: [link("ct", "vol", { label: "/data" })],
      },
    },
    // 4
    {
      kind: "conceito",
      nav: "O rm preserva",
      title: "Remover o container não remove o volume",
      body: [
        "Volume e container têm ciclos de vida **independentes**. Depois do `docker rm -f api`, o volume `dados` segue em `docker volume ls`, com o `pedidos.db` dentro.",
        "O próximo `docker run` com o mesmo `src=dados` encontra tudo ali. Para apagar o volume é preciso pedir (`docker volume rm`), e isso falha enquanto algum container, mesmo parado, ainda o referencia.",
      ],
      callout: { kind: "bom-saber", text: "Volumes anônimos (sem nome) também sobrevivem ao rm, a menos que você use `docker rm -v` ou `--rm`." },
      changes: ["api removido", "volume dados continua com os dados"],
      cmd: RM_API,
      metrics: m11("intactos no volume", "o volume", "ok"),
      terminal: { suggest: [RM_API, VOL_LS], outputs: { [RM_API]: "api", [VOL_LS]: VOL_LS_OUT } },
      focus: ["vol", "ct"],
      stage: {
        mode: "iso",
        entities: e11({ ct: { status: "dead", res: "Removed" }, vol: { status: "hi", badge: "pedidos.db" } }),
      },
    },
    // 5
    {
      kind: "conceito",
      nav: "Populado",
      title: "Volume vazio recebe o conteúdo da imagem",
      body: [
        "Se a imagem já tem arquivos no caminho da montagem (aqui, `/data/schema.sql`), o Docker **copia** esses arquivos para o volume na **primeira** montagem, desde que ele esteja vazio. Dono e permissões vêm junto (aula 12).",
        "Nas montagens seguintes o volume já tem dono do próprio conteúdo, e a imagem não é mais consultada naquele caminho.",
      ],
      changes: ["imagem copia /data para o volume vazio"],
      cmd: LS_VOL,
      metrics: m11("schema.sql copiado", "o volume"),
      terminal: { suggest: [LS_VOL], outputs: { [LS_VOL]: "schema.sql" } },
      focus: ["img", "vol"],
      stage: {
        mode: "iso",
        entities: e11({ ct: { status: "ok" }, img: { badges: [{ text: "/data/schema.sql", tone: "info" }] }, vol: { status: "new", badge: "vazio" } }),
        links: [link("ct", "vol", { label: "/data" })],
        flows: [flow("img", "vol", 2, { kind: "data", label: "1ª montagem" })],
      },
    },
    // 6
    {
      kind: "conceito",
      nav: "Bind mount",
      title: "Bind mount: um caminho do host dentro do container",
      body: [
        "O **bind mount** expõe um diretório ou arquivo que **já existe no host**, aqui `./config`. Quem edita no host vê a mudança no container na hora, sem refazer a imagem. Com `readonly` (`:ro`), o container só lê.",
        "Nada é copiado da imagem, e o caminho precisa existir. Com `--mount`, um caminho errado falha; com `-v`, o Docker criaria um diretório vazio de dono root.",
      ],
      callout: { kind: "bom-saber", text: "Em hosts com SELinux, adicione `:z` (compartilhado) ou `:Z` (privado) ao -v para reetiquetar o caminho." },
      changes: ["+ bind mount ./config em /config (somente leitura)"],
      cmd: RUN_BIND,
      metrics: m11("no disco do host", "o arquivo do host"),
      terminal: { suggest: [BIND_RO, BIND_FAIL], outputs: { [BIND_RO]: BIND_RO_OUT, [BIND_FAIL]: BIND_FAIL_OUT } },
      focus: ["ct", "pasta"],
      stage: {
        mode: "iso",
        entities: e11({ ct: { status: "new" }, pasta: { status: "new", badge: "app.yml" } }),
        links: [link("ct", "pasta", { label: "/config :ro" })],
        flows: [flow("pasta", "ct", 1, { kind: "data" })],
      },
    },
    // 7
    {
      kind: "problema",
      nav: "Bind esconde",
      title: "O bind mount cobre o que a imagem tinha ali",
      body: [
        "Montar uma pasta vazia do host em `/app` **esconde** o `app.jar` da imagem: o kernel mostra o conteúdo da montagem, e não o do diretório que estava por baixo. O container nem inicia: `Unable to access jarfile`.",
        "Com um volume vazio isso não aconteceria, porque ele seria populado com o conteúdo da imagem. Monte em outro caminho (`/config`, `/data`) ou use um volume.",
      ],
      callout: { kind: "atencao", text: "Montar no mesmo caminho do código da imagem é o jeito mais comum de \"sumir\" com a aplicação." },
      changes: ["pasta vazia cobre /app", "app.jar escondido"],
      cmd: RUN_HIDE,
      metrics: m11("-", "-", "bad"),
      terminal: { suggest: [RUN_HIDE, LS_BIND], outputs: { [RUN_HIDE]: RUN_HIDE_OUT, [LS_BIND]: "" } },
      focus: ["ct", "pasta", "img"],
      stage: {
        mode: "iso",
        entities: e11({
          ct: { status: "bad", res: "Exited (1) 2 seconds ago", badges: [{ text: "no jarfile", tone: "bad" }] },
          pasta: { label: "./vazia", status: "warn", badge: "vazia" },
          img: { status: "muted", badges: [{ text: "/app/app.jar", tone: "warn" }] },
        }),
        links: [link("ct", "pasta", { label: "/app" }), link("img", "ct", { style: "dashed" })],
      },
    },
    // 8
    {
      kind: "tradeoff",
      nav: "tmpfs",
      title: "tmpfs: rápido, volátil e só na memória",
      body: [
        "O **tmpfs** é um sistema de arquivos na RAM do host (só Linux). Nada vai ao disco, e tudo some quando o container para. Serve para cache e arquivos temporários, e para segredos que não podem ser gravados em disco.",
        "O espaço conta contra a memória: sem `size=`, um cache que cresce sem limite acaba em `OOMKilled` (exit 137). Por padrão a montagem também sai com `noexec`.",
      ],
      changes: ["+ tmpfs em /cache (64 MB)"],
      metrics: m11("só na RAM", "nada"),
      terminal: { suggest: [MOUNT_TMPFS, DF_TMPFS], outputs: { [MOUNT_TMPFS]: MOUNT_TMPFS_OUT, [DF_TMPFS]: DF_TMPFS_OUT } },
      focus: ["ct", "ram"],
      stage: {
        mode: "iso",
        entities: e11({ ct: { status: "ok" }, ram: { status: "new", badge: "/cache 64 MB" } }),
        links: [link("ct", "ram")],
      },
    },
    // 9
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Três montagens, três destinos depois do rm",
      body: [
        "Com `-v dados:/data`, `-v ./config:/config:ro` e `--tmpfs /cache`, o mesmo container usa as três. Depois do `docker rm -f api`: o **volume** e o **arquivo do host** continuam; o **tmpfs** e a **camada gravável** se foram.",
        "Regra de bolso: dado de aplicação em **volume**, arquivo que você edita no host em **bind mount**, o que é descartável em **tmpfs**.",
      ],
      changes: ["api removido", "volume e pasta ficam", "tmpfs e camada gravável somem"],
      cmd: RUN_ALL,
      metrics: m11("no volume", "volume e bind mount", "ok"),
      terminal: { suggest: [INSP_MOUNTS, INSP_TMPFS], outputs: { [INSP_MOUNTS]: INSP_MOUNTS_OUT, [INSP_TMPFS]: INSP_TMPFS_OUT } },
      focus: ["vol", "pasta", "ram", "ct"],
      stage: {
        mode: "iso",
        entities: e11({
          ct: { status: "dead", res: "Removed" },
          vol: { status: "ok", badge: "sobrevive" },
          pasta: { status: "ok", badge: "sobrevive" },
          ram: { status: "dead", badge: "perdido" },
        }),
      },
    },
  ],
};

// =====================================================================================
// Cena 12: persistência, permissões e backup (iso)
// =====================================================================================

type B = { text: string; tone?: "ok" | "warn" | "bad" | "info" };
type Q12 = {
  ct?: { name?: string; status?: Status; res?: string; badges?: B[] };
  dir?: { label?: string; status?: Status; badges?: B[]; icon?: "folder" | "hard-drive" };
  img?: { status?: Status; badges?: B[] };
  bkp?: { status?: Status; badges?: B[]; name?: string };
  tgz?: { status?: Status; badges?: B[] };
  vol2?: { status?: Status; badges?: B[] };
};

function e12(q: Q12): IsoEntity[] {
  const out: IsoEntity[] = [host()];
  if (q.ct) out.push(container("ct", ...at(0, 9.5), q.ct.name ?? "api", { image: "loja/api:1.0", status: q.ct.res ?? "Up 3 minutes", age: "3 minutes" }, { parent: "host", status: q.ct.status, badges: q.ct.badges }));
  if (q.dir) out.push(box("dir", ...at(-6.5, 9.5), q.dir.icon ?? "folder", q.dir.label ?? "./dados", { parent: "host", size: "sm", tone: q.dir.icon === "hard-drive" ? "ember" : "sky", status: q.dir.status, badges: q.dir.badges }));
  if (q.img) out.push(box("img", ...at(0, 2.5), "box", "loja/api:1.0", { parent: "host", size: "sm", tone: "arcane", status: q.img.status, badges: q.img.badges }));
  if (q.bkp) out.push(container("bkp", ...at(0, 2.5), q.bkp.name ?? "backup", { image: "busybox", status: "Up 1 second", age: "1 second" }, { parent: "host", status: q.bkp.status, badges: q.bkp.badges }));
  if (q.tgz) out.push(box("tgz", ...at(6.5, 9.5), "file", "dados.tgz", { parent: "host", size: "sm", tone: "ember", status: q.tgz.status, badges: q.tgz.badges }));
  if (q.vol2) out.push(box("vol2", ...at(0, 9.5), "hard-drive", "dados_novo", { parent: "host", size: "sm", tone: "ember", status: q.vol2.status, badges: q.vol2.badges }));
  return out;
}

const m12 = (a: string, b: string, tone?: Metric["tone"]): Metric[] => [
  { id: "a", label: "Processo", value: a },
  { id: "b", label: "Gravação em /data", value: b, tone },
];

const LOGS_DENIED = "docker logs api";
const LOGS_DENIED_OUT = "java.nio.file.AccessDeniedException: /data/relatorio.csv\n\tat java.base/sun.nio.fs.UnixException.translateToIOException(UnixException.java:90)";
const LS_N = "ls -ln dados";
const LS_N_OUT = ["total 0", "drwxr-xr-x 2 1000 1000 40 nov 27 21:30 ."].join("\n");
const ID_APP = "docker exec api id";
const ID_APP_OUT = "uid=10001(app) gid=10001(app) groups=10001(app)";
const LS_N_FIXED = "ls -ldn dados";
const LS_N_FIXED_OUT = "drwxr-xr-x 2 10001 10001 4096 nov 27 21:31 dados";
const CHOWN = "sudo chown 10001:10001 dados";
const DIAG = 'docker run --rm -v dados:/data -v "$PWD:/app:ro" loja/api:1.0 java /app/Diagnostico.java /data';
const DIAG_ROOT_OUT = ["processo uid=10001 gid=10001", "/data dono uid=0 modo=rwxr-xr-x", "SEM permissão de escrita"].join("\n");
const DIAG_OK_OUT = ["processo uid=10001 gid=10001", "/data dono uid=10001 modo=rwxr-xr-x", "gravável"].join("\n");
const BKP = 'docker run --rm --volumes-from db -v "$PWD:/backup" busybox tar czf /backup/dados.tgz -C /data .';
const BKP_LS = "ls -l dados.tgz";
const BKP_LS_OUT = "-rw-r--r-- 1 dev dev 130 nov 27 21:35 dados.tgz";
const TAR_T = "tar tzf dados.tgz";
const TAR_T_OUT = ["./", "./a.txt"].join("\n");
const RESTORE = 'docker run --rm -v dados_novo:/data -v "$PWD:/backup" busybox tar xzf /backup/dados.tgz -C /data';
const VOL_LS2 = "docker volume ls";
const VOL_LS2_OUT = ["DRIVER    VOLUME NAME", "local     dados", "local     dados_novo"].join("\n");
const PG_DUMP = "docker exec db pg_dump -U postgres loja > loja.sql";
const STOP_DB = "docker stop db";

export const persistenciaPermissoesBackup: SceneDef = {
  title: "Permissões de volumes e backup",
  summary: "Entenda por que o UID do container precisa bater com o dono do diretório e como fazer backup de um volume com um container auxiliar.",
  shell: "docker",
  goals: [
    { text: "Diagnosticar um Permission denied em volume", step: 3 },
    { text: "Garantir o dono certo em volume e em bind mount", step: 5 },
    { text: "Fazer backup e restaurar com um container auxiliar", step: 7 },
    { text: "Saber quando o backup do arquivo é consistente", step: 8 },
  ],
  steps: [
    // 1
    {
      kind: "contexto",
      nav: "Sem root",
      title: "A API agora roda como um usuário sem privilégios",
      body: [
        "A `api` passou a rodar como o usuário `app`, UID **10001**, em vez de root (aula 14). Os relatórios vão para `/data`, ligado a `./dados` do host por um bind mount.",
        "No host, quem criou `./dados` foi o seu usuário de desenvolvimento, UID **1000**. Os dois lados têm donos diferentes, e ninguém reparou ainda.",
      ],
      metrics: m12("uid 10001", "ainda não testada"),
      terminal: { suggest: [ID_APP, LS_N], outputs: { [ID_APP]: ID_APP_OUT, [LS_N]: LS_N_OUT } },
      focus: ["ct", "dir"],
      stage: {
        mode: "iso",
        entities: e12({ ct: { badges: [{ text: "uid 10001", tone: "info" }] }, dir: { badges: [{ text: "dono 1000", tone: "info" }] } }),
        links: [link("ct", "dir", { label: "/data" })],
      },
    },
    // 2
    {
      kind: "problema",
      nav: "Permission denied",
      title: "A primeira gravação falha com AccessDenied",
      body: [
        "O endpoint de relatório tenta criar `/data/relatorio.csv` e recebe `AccessDeniedException`. O diretório existe e está montado, mas o **dono é 1000** e o processo é **10001**: sem a permissão de escrita para \"outros\" (`drwxr-xr-x`), o kernel nega.",
        "Em Docker Desktop, o compartilhamento com o host traduz os donos e esconde o problema. Ele aparece quando o mesmo setup roda em um servidor Linux.",
      ],
      callout: { kind: "atencao", text: "Testar só como root é o jeito de descobrir o problema em produção." },
      changes: ["api não consegue gravar em /data"],
      metrics: m12("uid 10001", "negada", "bad"),
      terminal: { suggest: [LOGS_DENIED], outputs: { [LOGS_DENIED]: LOGS_DENIED_OUT } },
      focus: ["ct", "dir"],
      stage: {
        mode: "iso",
        entities: e12({ ct: { status: "bad", badges: [{ text: "uid 10001", tone: "bad" }] }, dir: { status: "warn", badges: [{ text: "dono 1000", tone: "warn" }] } }),
        links: [link("ct", "dir", { label: "/data" })],
        flows: [flow("ct", "dir", 2, { kind: "bad" })],
      },
    },
    // 3
    {
      kind: "conceito",
      nav: "O número vale",
      title: "O kernel só conhece números, não nomes",
      body: [
        "Cada arquivo guarda **UID e GID inteiros**. O nome vem de `/etc/passwd`, e cada imagem tem o seu: `app` na imagem, `dev` no host, e o mesmo número pode ter nomes diferentes ou nenhum.",
        "Por isso `chown app ./dados` no host não adianta (o host nem tem o usuário `app`). O acerto é sempre por número: `10001:10001`.",
      ],
      changes: ["uid 10001 ≠ dono 1000: nomes não atravessam"],
      metrics: m12("uid 10001", "negada", "bad"),
      terminal: { suggest: [ID_APP, LS_N], outputs: { [ID_APP]: ID_APP_OUT, [LS_N]: LS_N_OUT } },
      focus: ["ct", "dir"],
      stage: {
        mode: "iso",
        entities: e12({ ct: { status: "bad", badges: [{ text: "app = 10001", tone: "info" }] }, dir: { status: "warn", badges: [{ text: "dev = 1000", tone: "info" }] } }),
        links: [link("ct", "dir", { label: "10001 ≠ 1000", style: "dashed" })],
      },
    },
    // 4
    {
      kind: "solucao",
      nav: "Acertar o dono",
      title: "Ajuste o dono no host, ou o usuário do container",
      body: [
        "Com bind mount, o dono é o do host. Acerte-o por número (`sudo chown 10001:10001 dados`) ou rode o container com o seu usuário (`--user \"$(id -u):$(id -g)\"`), que é a escolha comum em desenvolvimento.",
        "Em produção existe ainda o `entrypoint` que começa como root, corrige o dono e troca de usuário (padrão das imagens oficiais de banco), e o *user namespace remap* ou o modo rootless, que deslocam os UIDs.",
      ],
      changes: ["dono de ./dados: 1000 → 10001", "api volta a gravar"],
      cmd: CHOWN,
      metrics: m12("uid 10001", "permitida", "ok"),
      terminal: { suggest: [CHOWN, LS_N_FIXED], outputs: { [CHOWN]: "", [LS_N_FIXED]: LS_N_FIXED_OUT } },
      focus: ["ct", "dir"],
      stage: {
        mode: "iso",
        entities: e12({ ct: { status: "ok", badges: [{ text: "uid 10001", tone: "ok" }] }, dir: { status: "ok", badges: [{ text: "dono 10001", tone: "ok" }] } }),
        links: [link("ct", "dir", { label: "/data" })],
        flows: [flow("ct", "dir", 2, { kind: "data" })],
      },
    },
    // 5
    {
      kind: "conceito",
      nav: "Volume herda",
      title: "Volume novo herda o dono da imagem",
      body: [
        "Com um **volume nomeado**, a imagem manda: se o Dockerfile faz `mkdir /data && chown app:app /data` antes da montagem, o volume nasce com dono `10001`. Se o diretório não existe na imagem, ele nasce `root`, e o usuário comum não grava.",
        "No builder legado, alterações em `/data` **depois** de uma instrução `VOLUME` eram descartadas (o BuildKit as mantém): faça o `chown` antes e não dependa do builder.",
      ],
      cmd: DIAG,
      changes: ["imagem com /data de dono 10001", "volume herda o dono"],
      metrics: m12("uid 10001", "permitida", "ok"),
      terminal: { suggest: [DIAG], outputs: { [DIAG]: DIAG_OK_OUT } },
      focus: ["img", "dir", "ct"],
      stage: {
        mode: "iso",
        entities: e12({
          ct: { status: "ok", badges: [{ text: "uid 10001", tone: "ok" }] },
          img: { badges: [{ text: "/data dono 10001", tone: "info" }] },
          dir: { icon: "hard-drive", label: "dados", status: "new", badges: [{ text: "dono 10001", tone: "ok" }] },
        }),
        links: [link("ct", "dir", { label: "/data" })],
        flows: [flow("img", "dir", 2, { kind: "data", label: "copia dono" })],
      },
    },
    // 6
    {
      kind: "problema",
      nav: "Backup",
      title: "Como copiar o que está dentro de um volume?",
      body: [
        "O volume é só um diretório, mas o caminho (`/var/lib/docker/volumes/...`) pertence ao daemon e, em Docker Desktop, fica dentro de uma VM. Copiar à mão é frágil.",
        "O jeito portátil é usar **outro container**: ele monta o mesmo volume e um diretório do host, e roda `tar`. O container auxiliar nasce, empacota e some (`--rm`).",
      ],
      callout: { kind: "chave", text: "`--volumes-from db` monta no auxiliar os mesmos volumes do container db, nos mesmos caminhos." },
      changes: ["+ container busybox auxiliar", "+ dados.tgz no host"],
      cmd: BKP,
      metrics: m12("busybox", "somente leitura do dado", "ok"),
      terminal: { suggest: [BKP, BKP_LS, TAR_T], outputs: { [BKP]: "", [BKP_LS]: BKP_LS_OUT, [TAR_T]: TAR_T_OUT } },
      focus: ["bkp", "ct", "tgz"],
      stage: {
        mode: "iso",
        entities: e12({
          ct: { name: "db", status: "ok" },
          bkp: { status: "new" },
          tgz: { status: "new", badges: [{ text: "130 B", tone: "info" }] },
          dir: { icon: "hard-drive", label: "dados" },
        }),
        links: [link("ct", "dir", { label: "/data" }), link("bkp", "dir", { label: "mesmo /data", style: "dashed" }), link("bkp", "tgz")],
        flows: [flow("dir", "bkp", 2, { kind: "data" }), flow("bkp", "tgz", 2, { kind: "data" })],
      },
    },
    // 7
    {
      kind: "conceito",
      nav: "Restaurar",
      title: "Restaurar é o mesmo tar ao contrário",
      body: [
        "Para restaurar, crie um volume novo e rode um auxiliar que o monta junto com o diretório do backup e **extrai** o `tar`. O volume `dados_novo` passa a ter exatamente o conteúdo do original.",
        "O mesmo desenho clona dados de produção para um ambiente de teste. E só é backup depois de **restaurado uma vez**: teste a restauração, não só a geração do arquivo.",
      ],
      changes: ["+ volume dados_novo", "dados.tgz extraído em dados_novo"],
      cmd: RESTORE,
      metrics: m12("busybox", "volume novo populado", "ok"),
      terminal: { suggest: [RESTORE, VOL_LS2], outputs: { [RESTORE]: "", [VOL_LS2]: VOL_LS2_OUT } },
      focus: ["bkp", "tgz", "vol2"],
      stage: {
        mode: "iso",
        entities: e12({
          bkp: { name: "restaura", status: "new" },
          tgz: { status: "ok", badges: [{ text: "130 B", tone: "info" }] },
          vol2: { status: "new", badges: [{ text: "restaurado", tone: "ok" }] },
        }),
        links: [link("bkp", "tgz"), link("bkp", "vol2")],
        flows: [flow("tgz", "bkp", 2, { kind: "data" }), flow("bkp", "vol2", 2, { kind: "data" })],
      },
    },
    // 8
    {
      kind: "tradeoff",
      nav: "Consistência",
      title: "Copiar arquivos de um banco em uso é arriscado",
      body: [
        "Se o container `db` é um Postgres gravando no volume enquanto o `tar` lê, o backup é no máximo *crash-consistent*: equivale ao disco depois de uma queda de energia. Em geral o banco recupera pelo WAL, mas não há garantia.",
        "Para garantir: **pare o container** antes do `tar`, use a ferramenta do banco (`pg_dump`, `pg_basebackup`) ou um *snapshot* do volume. E mande o arquivo para **outro disco**, senão o backup morre com o volume.",
      ],
      callout: { kind: "atencao", text: "Um backup que nunca foi restaurado é uma hipótese." },
      changes: ["db gravando durante o tar", "backup pode não abrir"],
      cmd: PG_DUMP,
      metrics: m12("db em uso", "backup inconsistente", "warn"),
      terminal: { suggest: [STOP_DB, PG_DUMP], outputs: { [STOP_DB]: "db", [PG_DUMP]: "" } },
      focus: ["ct", "bkp", "tgz"],
      stage: {
        mode: "iso",
        entities: e12({
          ct: { name: "db", status: "warn", badges: [{ text: "gravando", tone: "warn" }] },
          bkp: { status: "warn" },
          tgz: { status: "warn", badges: [{ text: "pode falhar", tone: "warn" }] },
          dir: { icon: "hard-drive", label: "dados" },
        }),
        links: [link("ct", "dir", { label: "/data" }), link("bkp", "dir", { label: "lê", style: "dashed" }), link("bkp", "tgz")],
        flows: [flow("ct", "dir", 3, { kind: "heavy" }), flow("dir", "bkp", 2, { kind: "data" })],
      },
    },
    // 9
    {
      kind: "resumo",
      nav: "Resumo",
      title: "Acerte o número e passe por um container",
      body: [
        "**Permissão:** o UID numérico do processo precisa bater com o dono do diretório. Em volume, o `chown` vai na imagem antes da montagem; em bind mount, no host (ou `--user`).",
        "**Backup:** um container auxiliar com `--volumes-from` e `tar`; para bancos, a ferramenta do banco ou o container parado. Guarde fora do disco do volume e teste a restauração.",
      ],
      metrics: m12("uid = dono", "permitida", "ok"),
      terminal: { suggest: [BKP, RESTORE], outputs: { [BKP]: "", [RESTORE]: "" } },
      focus: ["ct", "dir", "bkp", "tgz"],
      stage: {
        mode: "iso",
        entities: e12({
          ct: { name: "db", status: "ok", badges: [{ text: "uid 10001", tone: "ok" }] },
          dir: { icon: "hard-drive", label: "dados", badges: [{ text: "dono 10001", tone: "ok" }] },
          bkp: { status: "ok" },
          tgz: { status: "ok", badges: [{ text: "130 B", tone: "info" }] },
        }),
        links: [link("ct", "dir", { label: "/data" }), link("bkp", "dir", { label: "mesmo /data", style: "dashed" }), link("bkp", "tgz")],
      },
    },
  ],
};
