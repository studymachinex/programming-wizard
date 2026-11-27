/**
 * Resolvedor de comandos do terminal simulado. As respostas vêm do diagrama do passo atual:
 * saídas declaradas em `step.terminal.outputs` e comandos derivados dos `res` das entidades.
 */
import type { IsoEntity, Resource, SceneDef, SceneStep } from "./types";

export type CommandResult = { output: string; known: boolean };

export function normalizeCommand(input: string): string {
  return input.trim().replace(/\s+/g, " ").replace(/^\$ /, "");
}

function unknown(cmd: string): CommandResult {
  return {
    output: `# Este terminal é simulado e não conhece "${cmd}". Digite help para ver o que dá para rodar aqui.`,
    known: false,
  };
}

/** Tabela com colunas alinhadas como a CLI real (separador de 3 espaços). */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i])))
      .join("   ")
      .trimEnd();
  return [fmt(headers), ...rows.map(fmt)].join("\n");
}

function resourcesOf(step: SceneStep): Resource[] {
  if (step.stage.mode !== "iso") return [];
  return step.stage.entities.flatMap((e: IsoEntity) => (e.type === "box" && e.res ? [e.res] : []));
}

function hash12(text: string): string {
  let h = 2166136261;
  let out = "";
  for (let round = 0; out.length < 12; round++) {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i) + round;
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 12);
}

// ---------- kubectl ----------

function kubectlGet(tokens: string[], resources: Resource[]): string | null {
  // tokens: depois de "kubectl get"
  const kindWord = tokens[0];
  const rest = tokens.slice(1);
  let wide = false;
  let all = false;
  let ns: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t === "-o" && rest[i + 1] === "wide") {
      wide = true;
      i++;
    } else if (t === "-owide" || t === "-o=wide" || t === "--output=wide") wide = true;
    else if (t === "-A" || t === "--all-namespaces") all = true;
    else if (t === "-n" || t === "--namespace") {
      ns = rest[i + 1];
      i++;
    } else if (t.startsWith("--namespace=")) ns = t.slice("--namespace=".length);
    else return null;
  }
  const inNs = (r: Resource) => all || (r.namespace ?? "default") === (ns ?? "default");
  const empty = () => (all ? "No resources found" : `No resources found in ${ns ?? "default"} namespace.`);
  const nsCol = (r: Resource) => (all ? [r.namespace ?? "default"] : []);
  const nsHead = all ? ["NAMESPACE"] : [];

  if (["pods", "pod", "po"].includes(kindWord)) {
    const list = resources.filter((r) => r.kind === "pod" && inNs(r));
    if (!list.length) return empty();
    const headers = [...nsHead, "NAME", "READY", "STATUS", "RESTARTS", "AGE", ...(wide ? ["IP", "NODE"] : [])];
    return table(
      headers,
      list.map((r) => [...nsCol(r), r.name, r.ready ?? "1/1", r.status ?? "Running", String(r.restarts ?? 0), r.age ?? "5m", ...(wide ? [r.ip ?? "<none>", r.node ?? "<none>"] : [])]),
    );
  }
  if (["nodes", "node", "no"].includes(kindWord)) {
    const list = resources.filter((r) => r.kind === "node");
    if (!list.length) return "No resources found";
    return table(
      ["NAME", "STATUS", "ROLES", "AGE", "VERSION"],
      list.map((r) => [r.name, r.status ?? "Ready", r.type ?? "<none>", r.age ?? "5d", r.image ?? "v1.31.2"]),
    );
  }
  if (["svc", "service", "services"].includes(kindWord)) {
    const list = resources.filter((r) => r.kind === "service" && inNs(r));
    if (!list.length) return empty();
    return table(
      [...nsHead, "NAME", "TYPE", "CLUSTER-IP", "EXTERNAL-IP", "PORT(S)", "AGE"],
      list.map((r) => [...nsCol(r), r.name, r.type ?? "ClusterIP", r.ip ?? "<none>", "<none>", r.ports ?? "80/TCP", r.age ?? "5m"]),
    );
  }
  if (["deploy", "deployment", "deployments"].includes(kindWord)) {
    const list = resources.filter((r) => r.kind === "deployment" && inNs(r));
    if (!list.length) return empty();
    return table(
      [...nsHead, "NAME", "READY", "UP-TO-DATE", "AVAILABLE", "AGE"],
      list.map((r) => {
        const ready = r.ready ?? "1/1";
        const [have, want] = ready.split("/");
        return [...nsCol(r), r.name, ready, want ?? have, have, r.age ?? "5m"];
      }),
    );
  }
  return null;
}

// ---------- docker ----------

function dockerPs(rest: string[], resources: Resource[]): string | null {
  const all = rest.includes("-a") || rest.includes("--all");
  if (rest.some((t) => t !== "-a" && t !== "--all")) return null;
  const list = resources.filter((r) => r.kind === "container" && (all || (r.status ?? "Up").startsWith("Up")));
  return table(
    ["CONTAINER ID", "IMAGE", "COMMAND", "CREATED", "STATUS", "PORTS", "NAMES"],
    list.map((r) => [hash12(r.name), r.image ?? "app:latest", '"/entrypoint.sh"', r.age ? `${r.age} ago` : "5 minutes ago", r.status ?? "Up 5 minutes", r.ports ?? "", r.name]),
  );
}

/** Para recursos `image`, o campo `status` carrega o tamanho (ex.: "275MB"). */
function dockerImages(resources: Resource[]): string {
  const list = resources.filter((r) => r.kind === "image");
  return table(
    ["REPOSITORY", "TAG", "IMAGE ID", "CREATED", "SIZE"],
    list.map((r) => {
      const [repo, tag] = r.name.includes(":") ? r.name.split(/:(?=[^:/]*$)/) : [r.name, "latest"];
      return [repo, tag, hash12(r.name), r.age ? `${r.age} ago` : "2 hours ago", r.status ?? "100MB"];
    }),
  );
}

function derived(cmd: string, step: SceneStep, def: SceneDef): string | null {
  const resources = resourcesOf(step);
  const tokens = cmd.split(" ");
  if (def.shell === "kubectl" && tokens[0] === "kubectl" && tokens[1] === "get" && tokens.length >= 3) {
    return kubectlGet(tokens.slice(2), resources);
  }
  if (def.shell === "docker" && tokens[0] === "docker") {
    if (tokens[1] === "ps") return dockerPs(tokens.slice(2), resources);
    if (tokens[1] === "images" && tokens.length === 2) return dockerImages(resources);
    if (tokens[1] === "network" && tokens[2] === "ls" && tokens.length === 3) {
      const list = resources.filter((r) => r.kind === "network");
      return table(["NETWORK ID", "NAME", "DRIVER", "SCOPE"], list.map((r) => [hash12(r.name), r.name, r.type ?? "bridge", "local"]));
    }
    if (tokens[1] === "volume" && tokens[2] === "ls" && tokens.length === 3) {
      const list = resources.filter((r) => r.kind === "volume");
      return table(["DRIVER", "VOLUME NAME"], list.map((r) => ["local", r.name]));
    }
  }
  return null;
}

/** Comandos derivados disponíveis no passo (para o `help`). */
function derivedList(step: SceneStep, def: SceneDef): string[] {
  const kinds = new Set(resourcesOf(step).map((r) => r.kind));
  const out: string[] = [];
  if (def.shell === "kubectl") {
    if (kinds.has("pod")) out.push("kubectl get pods", "kubectl get pods -o wide", "kubectl get pods -A");
    if (kinds.has("node")) out.push("kubectl get nodes");
    if (kinds.has("service")) out.push("kubectl get svc");
    if (kinds.has("deployment")) out.push("kubectl get deploy");
  }
  if (def.shell === "docker") {
    if (kinds.has("container")) out.push("docker ps", "docker ps -a");
    if (kinds.has("image")) out.push("docker images");
    if (kinds.has("network")) out.push("docker network ls");
    if (kinds.has("volume")) out.push("docker volume ls");
  }
  return out;
}

export function resolveCommand(input: string, step: SceneStep, def: SceneDef): CommandResult {
  const cmd = normalizeCommand(input);
  if (cmd === "help") {
    const suggested = step.terminal?.suggest ?? [];
    const extra = derivedList(step, def).filter((c) => !suggested.includes(c));
    const lines = ["Comandos que dá para rodar neste passo:", ...suggested.map((c) => `  ${c}`)];
    if (extra.length) lines.push("", "Também disponíveis:", ...extra.map((c) => `  ${c}`));
    lines.push("", "  help     mostra esta lista", "  clear    limpa o terminal");
    return { output: lines.join("\n"), known: true };
  }
  if (cmd === "clear") return { output: "", known: true };

  const outputs = step.terminal?.outputs;
  if (outputs) {
    for (const [key, value] of Object.entries(outputs)) {
      if (normalizeCommand(key) === cmd) return { output: value, known: true };
    }
  }
  const out = derived(cmd, step, def);
  if (out !== null) return { output: out, known: true };
  return unknown(cmd);
}
