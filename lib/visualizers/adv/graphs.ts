import { Trace, fmt } from "../core";
import type { GraphEdge, GraphNode, Panel, Tone, TreeNode, VisualizerDef } from "../types";

// ------------------------------------------------------ Bellman-Ford e Floyd

const BF_NODES: GraphNode[] = [
  { id: "S", x: 8, y: 30 },
  { id: "A", x: 36, y: 8 },
  { id: "B", x: 36, y: 52 },
  { id: "C", x: 66, y: 8 },
  { id: "D", x: 66, y: 52 },
  { id: "T", x: 94, y: 30 },
];
const BF_EDGES: [string, string, number][] = [["S", "A", 4], ["S", "B", 5], ["A", "C", 3], ["B", "A", -3], ["C", "T", 2], ["B", "D", 4], ["D", "T", 1], ["C", "D", -2]];

export const bellmanFloyd: VisualizerDef = {
  title: "Bellman-Ford (pesos negativos) e Floyd-Warshall",
  summary: "Bellman-Ford relaxa todas as arestas V − 1 vezes e aceita pesos negativos. Floyd-Warshall calcula todos os pares deixando cada vértice k servir de intermediário.",
  code: ["dist[S] = 0", "repete V-1 vezes:", "  para (u, v, w): se dist[u] + w < dist[v]: relaxa", "passada extra relaxou? → ciclo negativo", "", "floyd: para k: para i: para j:", "  d[i][j] = min(d[i][j], d[i][k] + d[k][j])"],
  scenarios: [
    {
      label: "Bellman-Ford a partir de S",
      build() {
        const t = new Trace();
        const dist: Record<string, number> = {};
        for (const n of BF_NODES) dist[n.id] = Infinity;
        dist.S = 0;
        const view = (cur?: string, ok?: boolean, round?: number): Panel[] => [
          { kind: "graph", nodes: BF_NODES.map((n) => ({ ...n, badge: fmt(dist[n.id]), tone: cur?.endsWith(n.id) && ok ? "swap" : undefined })), edges: BF_EDGES.map(([a, b, w]): GraphEdge => ({ from: a, to: b, label: String(w), directed: true, tone: `${a}${b}` === cur ? (ok ? "swap" : "compare") : w < 0 ? "bad" : "default" })) },
          { kind: "vars", entries: [{ name: "rodada", value: round ?? 0 }, { name: "V − 1", value: BF_NODES.length - 1 }] },
        ];
        t.step("dist[S] = 0. Arestas vermelhas têm peso negativo: Dijkstra erraria aqui.", view(), 0);
        for (let round = 1; round < BF_NODES.length; round++) {
          let changed = false;
          for (const [a, b, w] of BF_EDGES) {
            if (dist[a] === Infinity) continue;
            const cand = dist[a] + w;
            if (cand < dist[b]) {
              dist[b] = cand;
              changed = true;
              t.step(`Rodada ${round}: ${a} → ${b}: ${dist[a]} + (${w}) = ${cand} melhora ${b}.`, view(`${a}${b}`, true, round), 2);
            }
          }
          if (!changed) {
            t.step(`Rodada ${round} sem mudanças: as distâncias convergiram (dá para parar cedo).`, view(undefined, false, round), 1);
            break;
          }
        }
        t.step("Uma passada extra não relaxaria nada: não há ciclo negativo. O(V·E).", view(), 3);
        return t.frames;
      },
    },
    {
      label: "Floyd-Warshall",
      build() {
        const t = new Trace();
        const ids = ["A", "B", "C", "D"];
        const edges: [string, string, number][] = [["A", "B", 3], ["B", "C", 1], ["A", "D", 7], ["C", "D", 2], ["D", "A", 2], ["C", "A", 8]];
        const d = ids.map((i) => ids.map((j) => (i === j ? 0 : Infinity)));
        for (const [a, b, w] of edges) d[ids.indexOf(a)][ids.indexOf(b)] = w;
        const grid = (k: number, i?: number, j?: number, improved?: boolean): Panel => ({
          kind: "grid",
          label: k < 0 ? "d[i][j] inicial (só arestas diretas)" : `d[i][j] usando intermediários até ${ids[k]}`,
          colHeaders: ids,
          rowHeaders: ids,
          rows: d.map((r) => r.map(fmt)),
          tones: [
            ...(k >= 0 ? ids.flatMap((_, x) => [{ r: k, c: x, tone: "compare" as Tone }, { r: x, c: k, tone: "compare" as Tone }]) : []),
            ...(i !== undefined && j !== undefined ? [{ r: i, c: j, tone: (improved ? "swap" : "active") as Tone }] : []),
          ],
        });
        t.step("Matriz inicial com as arestas diretas.", [grid(-1)], 5);
        for (let k = 0; k < ids.length; k++) {
          for (let i = 0; i < ids.length; i++) {
            for (let j = 0; j < ids.length; j++) {
              if (d[i][k] + d[k][j] < d[i][j]) {
                d[i][j] = d[i][k] + d[k][j];
                t.step(`k = ${ids[k]}: ${ids[i]} → ${ids[k]} → ${ids[j]} custa ${d[i][j]}, melhor que antes.`, [grid(k, i, j, true)], 6);
              }
            }
          }
        }
        t.step("Todos os pares em O(V³). A linha e a coluna de k (em azul) são as únicas lidas em cada fase.", [grid(-1)], 6);
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------------------ SCC

const SCC_NODES: GraphNode[] = [
  { id: "1", x: 10, y: 15 },
  { id: "2", x: 30, y: 45 },
  { id: "3", x: 10, y: 45 },
  { id: "4", x: 50, y: 15 },
  { id: "5", x: 70, y: 45 },
  { id: "6", x: 70, y: 15 },
  { id: "7", x: 92, y: 30 },
];
const SCC_EDGES: [string, string][] = [["1", "2"], ["2", "3"], ["3", "1"], ["2", "4"], ["4", "5"], ["5", "6"], ["6", "4"], ["6", "7"]];
const COMP_TONES: Tone[] = ["active", "compare", "swap", "path", "done"];

export const sccKosaraju: VisualizerDef = {
  title: "Componentes fortemente conexas (Kosaraju)",
  summary: "Primeira DFS registra a ordem de término. Depois, no grafo com as arestas invertidas, cada DFS iniciada na ordem inversa de término pinta exatamente uma componente.",
  code: ["DFS 1: empilha vértice ao terminar", "inverte todas as arestas", "pega vértices na ordem inversa de término:", "  DFS 2 no grafo invertido = uma componente"],
  scenarios: [
    {
      label: "7 vértices, 3 componentes",
      build() {
        const t = new Trace();
        const adj: Record<string, string[]> = {};
        const radj: Record<string, string[]> = {};
        for (const n of SCC_NODES) {
          adj[n.id] = [];
          radj[n.id] = [];
        }
        for (const [a, b] of SCC_EDGES) {
          adj[a].push(b);
          radj[b].push(a);
        }
        const finish: string[] = [];
        const seen = new Set<string>();
        const comp: Record<string, number> = {};
        const view = (reversed: boolean, cur?: string): Panel[] => [
          {
            kind: "graph",
            label: reversed ? "grafo com arestas invertidas" : "grafo original",
            nodes: SCC_NODES.map((n) => ({ ...n, tone: n.id in comp ? COMP_TONES[comp[n.id] % COMP_TONES.length] : n.id === cur ? "active" : seen.has(n.id) && !reversed ? "muted" : "default", badge: n.id in comp ? `C${comp[n.id] + 1}` : finish.includes(n.id) ? `fim #${finish.indexOf(n.id) + 1}` : undefined })),
            edges: SCC_EDGES.map(([a, b]): GraphEdge => (reversed ? { from: b, to: a, directed: true } : { from: a, to: b, directed: true })),
          },
          { kind: "list", style: "stack", label: "ordem de término", items: finish.map((f) => ({ label: f })) },
        ];
        const dfs1 = (u: string) => {
          seen.add(u);
          t.step(`DFS 1 entra em ${u}.`, view(false, u), 0);
          for (const v of adj[u]) if (!seen.has(v)) dfs1(v);
          finish.push(u);
          t.step(`${u} termina: vai para a pilha.`, view(false, u), 0);
        };
        for (const n of SCC_NODES) if (!seen.has(n.id)) dfs1(n.id);
        t.step("Invertemos as arestas. Agora uma DFS não consegue \"vazar\" de uma componente para outra na ordem certa.", view(true), 1);
        let c = 0;
        for (const start of [...finish].reverse()) {
          if (start in comp) continue;
          const stack = [start];
          comp[start] = c;
          while (stack.length) {
            const u = stack.pop()!;
            for (const v of radj[u]) if (!(v in comp)) {
              comp[v] = c;
              stack.push(v);
            }
          }
          t.step(`DFS 2 a partir de ${start} (o próximo da pilha) alcança uma componente inteira: C${c + 1}.`, view(true, start), 3);
          c++;
        }
        t.step(`${c} componentes fortemente conexas. Duas DFS: O(V + E).`, view(false), 3);
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------------- max flow

const MF_NODES: GraphNode[] = [
  { id: "s", x: 6, y: 30 },
  { id: "a", x: 34, y: 8 },
  { id: "b", x: 34, y: 52 },
  { id: "c", x: 66, y: 8 },
  { id: "d", x: 66, y: 52 },
  { id: "t", x: 94, y: 30 },
];
const MF_EDGES: [string, string, number][] = [["s", "a", 10], ["s", "b", 8], ["a", "b", 2], ["a", "c", 6], ["b", "d", 9], ["d", "c", 4], ["c", "t", 9], ["d", "t", 6]];

export const maxFlowMinCut: VisualizerDef = {
  title: "Fluxo máximo (Edmonds-Karp) e corte mínimo",
  summary: "Cada BFS no grafo residual encontra um caminho de aumento; o gargalo dele é empurrado. Quando não há mais caminho, os vértices alcançáveis a partir de s definem o corte mínimo.",
  code: ["enquanto BFS acha caminho s → t no residual:", "  gargalo = menor capacidade residual do caminho", "  empurra gargalo (ida −, volta +)", "fluxo máximo = soma dos gargalos", "corte = arestas de alcançáveis para não alcançáveis"],
  scenarios: [
    {
      label: "rede s → t",
      build() {
        const t = new Trace();
        const cap = new Map<string, number>();
        const flow = new Map<string, number>();
        for (const [a, b, c] of MF_EDGES) {
          cap.set(a + b, c);
          flow.set(a + b, 0);
        }
        const residual = (a: string, b: string) => (cap.get(a + b) ?? 0) - (flow.get(a + b) ?? 0) + (flow.get(b + a) ?? 0);
        let total = 0;
        const view = (path: string[] = [], reach?: Set<string>): Panel[] => {
          const onPath = new Set(path.slice(1).map((v, i) => path[i] + v));
          return [
            {
              kind: "graph",
              nodes: MF_NODES.map((n) => ({ ...n, tone: reach ? (reach.has(n.id) ? "active" : "compare") : path.includes(n.id) ? "path" : "default" })),
              edges: MF_EDGES.map(([a, b, c]): GraphEdge => ({ from: a, to: b, directed: true, label: `${flow.get(a + b)}/${c}`, tone: onPath.has(a + b) || onPath.has(b + a) ? "path" : reach && reach.has(a) && !reach.has(b) ? "bad" : flow.get(a + b) === c ? "done" : "default" })),
            },
            { kind: "vars", entries: [{ name: "fluxo total", value: total, tone: "done" }] },
          ];
        };
        t.step("Rótulos são fluxo/capacidade. Começa tudo em 0.", view(), 0);
        for (;;) {
          const prev: Record<string, string> = {};
          const queue = ["s"];
          const seen = new Set(["s"]);
          while (queue.length && !seen.has("t")) {
            const u = queue.shift()!;
            for (const n of MF_NODES) {
              if (!seen.has(n.id) && residual(u, n.id) > 0) {
                seen.add(n.id);
                prev[n.id] = u;
                queue.push(n.id);
              }
            }
          }
          if (!seen.has("t")) {
            t.step(`Nenhum caminho de aumento. Fluxo máximo = ${total}. Alcançáveis de s (roxo) × resto (azul): as arestas vermelhas formam o corte mínimo, com capacidade ${total}.`, view([], seen), 4);
            break;
          }
          const path = ["t"];
          while (path[0] !== "s") path.unshift(prev[path[0]]);
          let bottleneck = Infinity;
          for (let i = 0; i + 1 < path.length; i++) bottleneck = Math.min(bottleneck, residual(path[i], path[i + 1]));
          t.step(`BFS achou ${path.join(" → ")}; gargalo = ${bottleneck}.`, view(path), 1);
          for (let i = 0; i + 1 < path.length; i++) {
            const [a, b] = [path[i], path[i + 1]];
            const back = flow.get(b + a) ?? 0;
            const cancel = Math.min(back, bottleneck);
            if (cancel) flow.set(b + a, back - cancel);
            if (bottleneck - cancel) flow.set(a + b, (flow.get(a + b) ?? 0) + bottleneck - cancel);
          }
          total += bottleneck;
          t.step(`Empurra ${bottleneck} pelo caminho. Fluxo total = ${total}.`, view(path), 2);
        }
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------------------ LCA

const PARENTS = [-1, 0, 0, 1, 1, 2, 4, 4, 6, 3];

export const lcaBinaryLifting: VisualizerDef = {
  title: "LCA com binary lifting",
  summary: "A tabela up[k][v] guarda o ancestral 2ᵏ níveis acima. Para o LCA: iguale as profundidades decompondo a diferença em potências de 2 e depois suba os dois juntos enquanto os ancestrais forem diferentes.",
  code: ["up[0][v] = pai(v)", "up[k][v] = up[k-1][ up[k-1][v] ]", "lca(u, v): sobe u até a profundidade de v", "  se u == v: return u", "  para k do maior ao menor:", "    se up[k][u] != up[k][v]: sobe os dois", "  return up[0][u]"],
  scenarios: [
    {
      label: "lca(8, 9) e lca(7, 5)",
      build() {
        const t = new Trace();
        const n = PARENTS.length;
        const LOG = 4;
        const depth = PARENTS.map(() => 0);
        for (let v = 1; v < n; v++) depth[v] = depth[PARENTS[v]] + 1;
        const up: (number | string)[][] = Array.from({ length: LOG }, () => Array(n).fill("—"));
        const tree = (marks: Record<number, Tone>): TreeNode => {
          const conv = (v: number): TreeNode => ({ id: `v${v}`, label: String(v), tone: marks[v], badge: `d${depth[v]}`, children: PARENTS.map((p, c) => (p === v ? c : -1)).filter((c) => c >= 0).map(conv) });
          return conv(0);
        };
        const grid = (marks: { r: number; c: number; tone: Tone }[] = []): Panel => ({ kind: "grid", label: "up[k][v] (−1 = não existe)", colHeaders: PARENTS.map((_, v) => String(v)), rowHeaders: range4(LOG), rows: up, tones: marks });
        for (let v = 0; v < n; v++) up[0][v] = PARENTS[v];
        t.step("Linha k = 0: o pai de cada nó.", [{ kind: "tree", binary: false, root: tree({}) }, grid(PARENTS.map((_, c) => ({ r: 0, c, tone: "active" as Tone })))], 0);
        for (let k = 1; k < LOG; k++) {
          for (let v = 0; v < n; v++) {
            const mid = up[k - 1][v] as number;
            up[k][v] = mid === -1 ? -1 : (up[k - 1][mid] as number);
          }
          t.step(`Linha k = ${k}: subir 2^${k} = subir 2^${k - 1} duas vezes.`, [{ kind: "tree", binary: false, root: tree({}) }, grid(PARENTS.map((_, c) => ({ r: k, c, tone: "active" as Tone })))], 1);
        }
        const lca = (a: number, b: number) => {
          let u = a;
          let v = b;
          if (depth[u] < depth[v]) [u, v] = [v, u];
          t.step(`lca(${a}, ${b}): profundidades ${depth[a]} e ${depth[b]}.`, [{ kind: "tree", binary: false, root: tree({ [a]: "active", [b]: "compare" }) }, grid()], 2);
          let diff = depth[u] - depth[v];
          for (let k = 0; diff > 0; k++, diff >>= 1) {
            if (diff & 1) {
              const from = u;
              u = up[k][u] as number;
              t.step(`Iguala: sobe ${from} em 2^${k} → ${u}.`, [{ kind: "tree", binary: false, root: tree({ [u]: "active", [v]: "compare" }) }, grid([{ r: k, c: from, tone: "swap" }])], 2);
            }
          }
          if (u === v) {
            t.step(`Os dois chegaram em ${u}: um era ancestral do outro. LCA = ${u}.`, [{ kind: "tree", binary: false, root: tree({ [u]: "done" }) }, grid()], 3);
            return;
          }
          for (let k = LOG - 1; k >= 0; k--) {
            const uu = up[k][u] as number;
            const vv = up[k][v] as number;
            if (uu !== vv) {
              t.step(`k = ${k}: up[${k}][${u}] = ${uu} ≠ up[${k}][${v}] = ${vv}. Sobe os dois.`, [{ kind: "tree", binary: false, root: tree({ [uu]: "active", [vv]: "compare" }) }, grid([{ r: k, c: u, tone: "swap" }, { r: k, c: v, tone: "swap" }])], 5);
              u = uu;
              v = vv;
            } else {
              t.step(`k = ${k}: ancestrais iguais (${uu}) — poderia passar do LCA, não sobe.`, [{ kind: "tree", binary: false, root: tree({ [u]: "active", [v]: "compare" }) }, grid([{ r: k, c: u, tone: "muted" }, { r: k, c: v, tone: "muted" }])], 4);
            }
          }
          const answer = up[0][u] as number;
          t.step(`${u} e ${v} são filhos distintos do LCA: lca(${a}, ${b}) = ${answer}. O(log n) por consulta.`, [{ kind: "tree", binary: false, root: tree({ [answer]: "done", [a]: "path", [b]: "path" }) }, grid()], 6);
        };
        lca(8, 9);
        lca(7, 5);
        return t.frames;
      },
    },
  ],
};

function range4(n: number) {
  return Array.from({ length: n }, (_, k) => `k=${k}`);
}
