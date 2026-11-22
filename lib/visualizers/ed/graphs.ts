import { Trace, fmt } from "../core";
import type { GraphEdge, GraphNode, Panel, Tone, VisualizerDef } from "../types";

// Grafo de exemplo (posições no espaço 100 x 60)
const NODES: GraphNode[] = [
  { id: "A", x: 8, y: 30 },
  { id: "B", x: 30, y: 8 },
  { id: "C", x: 30, y: 52 },
  { id: "D", x: 55, y: 8 },
  { id: "E", x: 55, y: 52 },
  { id: "F", x: 78, y: 30 },
  { id: "G", x: 96, y: 52 },
];
const UND: [string, string, number][] = [["A", "B", 4], ["A", "C", 2], ["B", "C", 1], ["B", "D", 5], ["C", "E", 8], ["D", "E", 2], ["D", "F", 6], ["E", "F", 3], ["F", "G", 1], ["E", "G", 9]];

function adjacency(directed: boolean, edges = UND) {
  const adj: Record<string, { to: string; w: number }[]> = {};
  for (const n of NODES) adj[n.id] = [];
  for (const [a, b, w] of edges) {
    adj[a].push({ to: b, w });
    if (!directed) adj[b].push({ to: a, w });
  }
  for (const k of Object.keys(adj)) adj[k].sort((x, y) => x.to.localeCompare(y.to));
  return adj;
}

const key = (a: string, b: string) => [a, b].sort().join("");

// ---------------------------------------------------------------- BFS e DFS

function adjText(adj: Record<string, { to: string }[]>, focus?: string): Panel {
  return { kind: "text", label: "lista de adjacência", lines: Object.entries(adj).map(([k, vs]) => ({ text: `${k}: ${vs.map((v) => v.to).join(", ")}`, tone: k === focus ? ("active" as Tone) : undefined })) };
}

export const grafosBfsDfs: VisualizerDef = {
  title: "Representação, BFS e DFS",
  summary: "O mesmo grafo e a mesma lista de adjacência, percorridos de dois jeitos. BFS usa fila e avança em camadas; DFS usa pilha (ou recursão) e vai fundo antes de voltar.",
  code: ["BFS: fila = [s]; marca s", "  u = fila.poll(); para v vizinho não marcado:", "    marca v; fila.offer(v)", "DFS: pilha = [s]", "  u = pilha.pop(); se marcado, ignora", "  marca u; empilha vizinhos não marcados"],
  scenarios: (["BFS", "DFS"] as const).map((kind) => ({
    label: `${kind} a partir de A`,
    build() {
      const t = new Trace();
      const adj = adjacency(false);
      const seen = new Set<string>();
      const order: string[] = [];
      const struct: string[] = ["A"];
      const tree = new Set<string>();
      const view = (u?: string): Panel[] => [
        { kind: "graph", nodes: NODES.map((n) => ({ ...n, tone: n.id === u ? "active" : seen.has(n.id) ? "done" : struct.includes(n.id) ? "swap" : "default", badge: order.includes(n.id) ? `#${order.indexOf(n.id) + 1}` : undefined })), edges: UND.map(([a, b]): GraphEdge => ({ from: a, to: b, tone: tree.has(key(a, b)) ? "path" : "default" })) },
        { kind: "list", style: kind === "BFS" ? "queue" : "stack", label: kind === "BFS" ? "fila" : "pilha", items: struct.map((s) => ({ label: s })) },
        { kind: "array", label: "ordem de visita", values: order },
        adjText(adj, u),
      ];
      const parent: Record<string, string> = {};
      if (kind === "BFS") seen.add("A");
      t.step(`Começa em A. ${kind === "BFS" ? "Fila" : "Pilha"} = [A].`, view(), kind === "BFS" ? 0 : 3);
      while (struct.length) {
        const u = kind === "BFS" ? struct.shift()! : struct.pop()!;
        if (kind === "DFS") {
          if (seen.has(u)) {
            t.step(`${u} já foi visitado: descarta.`, view(), 4);
            continue;
          }
          seen.add(u);
          if (parent[u]) tree.add(key(parent[u], u));
        }
        order.push(u);
        const novos: string[] = [];
        const vizinhos = kind === "DFS" ? [...adj[u]].reverse() : adj[u];
        for (const { to } of vizinhos) {
          if (seen.has(to)) continue;
          if (kind === "BFS") {
            seen.add(to);
            tree.add(key(u, to));
          } else parent[to] = u;
          struct.push(to);
          novos.push(to);
        }
        t.step(`Visita ${u}${novos.length ? `; ${kind === "BFS" ? "enfileira" : "empilha"} ${novos.join(", ")}` : "; nenhum vizinho novo"}.`, view(u), kind === "BFS" ? 2 : 5);
      }
      t.step(`Ordem ${kind}: ${order.join(" → ")}. As duas são O(V + E) com lista de adjacência.`, view(), kind === "BFS" ? 1 : 4);
      return t.frames;
    },
  })),
};

// ------------------------------------------------------------ topological sort

const DAG_NODES: GraphNode[] = [
  { id: "java", label: "java", x: 8, y: 14 },
  { id: "sql", label: "sql", x: 8, y: 46 },
  { id: "poo", label: "poo", x: 32, y: 14 },
  { id: "jpa", label: "jpa", x: 56, y: 30 },
  { id: "rest", label: "rest", x: 56, y: 6 },
  { id: "api", label: "api", x: 80, y: 20 },
  { id: "deploy", label: "deploy", x: 96, y: 46 },
];
const DAG_EDGES: [string, string][] = [["java", "poo"], ["poo", "rest"], ["poo", "jpa"], ["sql", "jpa"], ["rest", "api"], ["jpa", "api"], ["api", "deploy"], ["sql", "deploy"]];

export const topologicalSort: VisualizerDef = {
  title: "Ordenação topológica (Kahn)",
  summary: "Pré-requisitos de estudo como grafo dirigido. O algoritmo de Kahn processa quem tem grau de entrada 0 (nenhuma dependência pendente) e vai \"removendo\" arestas. Se sobrar alguém, há ciclo.",
  code: ["indeg[v] = nº de arestas que chegam em v", "fila = vértices com indeg 0", "u = fila.poll(); ordem.add(u)", "para cada u → v: indeg[v]--", "  se indeg[v] == 0: fila.offer(v)", "ordem.size < V → existe ciclo"],
  scenarios: [
    {
      label: "trilha de estudos",
      build() {
        const t = new Trace();
        const indeg: Record<string, number> = {};
        for (const n of DAG_NODES) indeg[n.id] = 0;
        for (const [, b] of DAG_EDGES) indeg[b]++;
        const queue = DAG_NODES.filter((n) => indeg[n.id] === 0).map((n) => n.id);
        const order: string[] = [];
        const used = new Set<string>();
        const view = (u?: string, v?: string): Panel[] => [
          { kind: "graph", nodes: DAG_NODES.map((n) => ({ ...n, tone: n.id === u ? "active" : n.id === v ? "compare" : order.includes(n.id) ? "done" : queue.includes(n.id) ? "swap" : "default", badge: `in=${indeg[n.id]}` })), edges: DAG_EDGES.map(([a, b]): GraphEdge => ({ from: a, to: b, directed: true, tone: used.has(a + b) ? "muted" : a === u ? "active" : "default" })) },
          { kind: "list", style: "queue", label: "fila (indeg = 0)", items: queue.map((q) => ({ label: q })) },
          { kind: "array", label: "ordem", values: order },
        ];
        t.step(`Grau de entrada calculado. Sem dependências: ${queue.join(", ")}.`, view(), 1);
        while (queue.length) {
          const u = queue.shift()!;
          order.push(u);
          t.step(`Tira ${u} da fila: pode ser estudado agora.`, view(u), 2);
          for (const [a, b] of DAG_EDGES) {
            if (a !== u) continue;
            indeg[b]--;
            used.add(a + b);
            if (indeg[b] === 0) queue.push(b);
            t.step(`${u} → ${b}: indeg[${b}] = ${indeg[b]}${indeg[b] === 0 ? ", entra na fila" : ""}.`, view(u, b), indeg[b] === 0 ? 4 : 3);
          }
        }
        t.step(`Todos os ${order.length} vértices saíram: não há ciclo. Uma ordem válida: ${order.join(" → ")}.`, view(), 5);
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------------------ Dijkstra

export const dijkstra: VisualizerDef = {
  title: "Dijkstra: menores distâncias com pesos",
  summary: "Sempre expande o vértice não finalizado com menor distância (via heap). Quando ele sai do heap, a distância dele é definitiva — por isso pesos negativos quebram o algoritmo.",
  code: ["dist[s] = 0; heap = [(0, s)]", "(d, u) = heap.poll()", "se d > dist[u]: entrada velha, ignora", "para (v, w) vizinho de u:", "  se dist[u] + w < dist[v]:", "    dist[v] = dist[u] + w; heap.offer"],
  scenarios: [
    {
      label: "a partir de A",
      build() {
        const t = new Trace();
        const adj = adjacency(false);
        const dist: Record<string, number> = {};
        const prev: Record<string, string> = {};
        for (const n of NODES) dist[n.id] = Infinity;
        dist.A = 0;
        let heap: [number, string][] = [[0, "A"]];
        const final = new Set<string>();
        const pathEdges = () => new Set(Object.entries(prev).map(([v, u]) => key(u, v)));
        const view = (u?: string, v?: string, relaxed?: boolean): Panel[] => [
          {
            kind: "graph",
            nodes: NODES.map((n) => ({ ...n, tone: n.id === u ? "active" : n.id === v ? (relaxed ? "swap" : "compare") : final.has(n.id) ? "done" : "default", badge: fmt(dist[n.id]) })),
            edges: UND.map(([a, b, w]): GraphEdge => ({ from: a, to: b, label: String(w), tone: (u && v && key(a, b) === key(u, v)) ? (relaxed ? "swap" : "compare") : pathEdges().has(key(a, b)) ? "path" : "default" })),
          },
          { kind: "list", style: "queue", label: "heap (menor primeiro)", items: [...heap].sort((x, y) => x[0] - y[0]).map(([d, id]) => ({ label: id, sub: `d=${d}` })) },
        ];
        t.step("dist[A] = 0; os demais começam em ∞.", view(), 0);
        while (heap.length) {
          heap.sort((x, y) => x[0] - y[0]);
          const [d, u] = heap.shift()!;
          if (d > dist[u] || final.has(u)) {
            t.step(`(${d}, ${u}) é uma entrada antiga — ${u} já foi finalizado com ${dist[u]}. Ignora.`, view(), 2);
            continue;
          }
          final.add(u);
          t.step(`Sai ${u} com distância ${d}: agora é definitiva.`, view(u), 1);
          for (const { to: v, w } of adj[u]) {
            if (final.has(v)) continue;
            const cand = dist[u] + w;
            const better = cand < dist[v];
            if (better) {
              dist[v] = cand;
              prev[v] = u;
              heap = [...heap, [cand, v]];
            }
            t.step(better ? `${u} → ${v}: ${dist[u]} + ${w} = ${cand} melhora a distância de ${v}.` : `${u} → ${v}: ${dist[u]} + ${w} = ${cand} não melhora ${fmt(dist[v])}.`, view(u, v, better), better ? 5 : 4);
          }
        }
        t.step("Heap vazio. As arestas azuis formam a árvore de caminhos mínimos. O((V + E) log V).", view(), 1);
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------ union-find e Kruskal

export const unionFindMst: VisualizerDef = {
  title: "Kruskal com union-find",
  summary: "Ordene as arestas pelo peso e aceite cada uma se ela liga dois componentes diferentes. O union-find responde \"estão no mesmo componente?\" em tempo quase constante.",
  code: ["ordena arestas por peso", "para (u, v, w):", "  se find(u) != find(v):", "    union(u, v); aceita a aresta", "  senão: rejeita (formaria ciclo)", "para com V - 1 arestas"],
  scenarios: [
    {
      label: "árvore geradora mínima",
      build() {
        const t = new Trace();
        const parent: Record<string, string> = {};
        for (const n of NODES) parent[n.id] = n.id;
        const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
        const edges = [...UND].sort((a, b) => a[2] - b[2]);
        const accepted = new Set<string>();
        const rejected = new Set<string>();
        let total = 0;
        const view = (cur?: string): Panel[] => [
          { kind: "graph", nodes: NODES.map((n) => ({ ...n, badge: `raiz ${find(n.id)}` })), edges: UND.map(([a, b, w]): GraphEdge => ({ from: a, to: b, label: String(w), tone: key(a, b) === cur ? "active" : accepted.has(key(a, b)) ? "done" : rejected.has(key(a, b)) ? "muted" : "default" })) },
          { kind: "array", label: "parent (union-find)", values: NODES.map((n) => parent[n.id]), showIndex: false },
          { kind: "vars", entries: [{ name: "arestas aceitas", value: accepted.size }, { name: "peso total", value: total, tone: "done" }] },
        ];
        t.step(`Arestas ordenadas por peso: ${edges.map(([a, b, w]) => `${a}${b}(${w})`).join(", ")}.`, view(), 0);
        for (const [a, b, w] of edges) {
          if (accepted.size === NODES.length - 1) break;
          const ra = find(a);
          const rb = find(b);
          if (ra !== rb) {
            parent[ra] = rb;
            accepted.add(key(a, b));
            total += w;
            t.step(`${a}–${b} (${w}): raízes ${ra} ≠ ${rb}, liga dois componentes. Aceita e faz union.`, view(key(a, b)), 3);
          } else {
            rejected.add(key(a, b));
            t.step(`${a}–${b} (${w}): mesma raiz ${ra} — fecharia um ciclo. Rejeita.`, view(key(a, b)), 4);
          }
        }
        t.step(`${accepted.size} arestas = V − 1: árvore geradora mínima com peso ${total}. O(E log E) pela ordenação.`, view(), 5);
        return t.frames;
      },
    },
  ],
};
