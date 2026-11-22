import { Trace, randInt, randomArray, range, tones } from "../core";
import type { GraphEdge, GraphNode, Panel, Scenario, Tone, VisualizerDef } from "../types";

// ------------------------------------------------------------- parênteses

function bracketsScenario(text: string): Scenario {
  return {
    label: text,
    build() {
      const t = new Trace();
      const chars = text.split("");
      const stack: { ch: string; at: number }[] = [];
      const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
      const view = (i: number, tone: Tone): Panel[] => [
        { kind: "array", label: "entrada", values: chars, tones: { ...tones([range(0, i - 1), "muted"]), [i]: tone }, pointers: i < chars.length ? [{ index: i, label: "i" }] : [] },
        { kind: "list", style: "stack", label: "pilha de abertos", items: stack.map((s) => ({ label: s.ch, sub: `pos ${s.at}` })) },
      ];
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if ("([{".includes(c)) {
          stack.push({ ch: c, at: i });
          t.step(`'${c}' abre: empilha e espera o fechamento correspondente.`, view(i, "active"), 2);
        } else {
          const top = stack[stack.length - 1];
          if (!top || top.ch !== pairs[c]) {
            t.step(top ? `'${c}' fecha, mas o topo é '${top.ch}': ordem errada. Inválido.` : `'${c}' fecha, mas a pilha está vazia: inválido.`, view(i, "bad"), 4);
            return t.frames;
          }
          stack.pop();
          t.step(`'${c}' fecha o '${top.ch}' do topo: desempilha.`, view(i, "done"), 5);
        }
      }
      t.step(stack.length ? `Fim da entrada com ${stack.length} aberto(s) na pilha: inválido.` : "Fim da entrada com a pilha vazia: válido.", [
        { kind: "array", label: "entrada", values: chars, tones: tones([range(0, chars.length - 1), stack.length ? "bad" : "done"]) },
        { kind: "list", style: "stack", label: "pilha de abertos", items: stack.map((s) => ({ label: s.ch, tone: "bad" as Tone })) },
      ], 6);
      return t.frames;
    },
  };
}

export const stackAplicacoes: VisualizerDef = {
  title: "Pilha: validar parênteses",
  summary: "Cada abertura é empilhada; cada fechamento precisa casar com o topo. A pilha guarda exatamente o que ainda falta fechar, na ordem certa (LIFO).",
  code: ["para cada c em s:", "  se c abre:", "    pilha.push(c)", "  senão:", "    se pilha vazia ou topo não casa: inválido", "    pilha.pop()", "válido se pilha vazia"],
  scenarios: [bracketsScenario("{[()()]}"), bracketsScenario("([)]"), bracketsScenario("(()")],
};

// ------------------------------------------------------------------ BFS

const BFS_NODES: GraphNode[] = [
  { id: "A", x: 10, y: 30 },
  { id: "B", x: 30, y: 10 },
  { id: "C", x: 30, y: 50 },
  { id: "D", x: 52, y: 10 },
  { id: "E", x: 52, y: 50 },
  { id: "F", x: 74, y: 30 },
  { id: "G", x: 92, y: 30 },
];
const BFS_EDGES: [string, string][] = [["A", "B"], ["A", "C"], ["B", "D"], ["C", "E"], ["D", "F"], ["E", "F"], ["B", "E"], ["F", "G"]];

export const queueDequeBfs: VisualizerDef = {
  title: "Fila na BFS: camadas de distância",
  summary: "A BFS usa uma fila (FIFO): quem entrou primeiro sai primeiro, então os vértices são visitados em ordem de distância. A primeira vez que alcança um nó é pelo caminho mais curto (em arestas).",
  code: ["fila = [origem]; dist[origem] = 0", "enquanto fila não vazia:", "  u = fila.poll()", "  para v vizinho de u:", "    se v não visitado:", "      dist[v] = dist[u] + 1", "      fila.offer(v)"],
  scenarios: [
    {
      label: "BFS a partir de A",
      build() {
        const t = new Trace();
        const adj: Record<string, string[]> = {};
        for (const n of BFS_NODES) adj[n.id] = [];
        for (const [a, b] of BFS_EDGES) {
          adj[a].push(b);
          adj[b].push(a);
        }
        const dist: Record<string, number> = { A: 0 };
        const queue = ["A"];
        const done = new Set<string>();
        const tree = new Set<string>();
        const view = (current?: string, checking?: string): Panel[] => [
          {
            kind: "graph",
            nodes: BFS_NODES.map((n) => ({ ...n, tone: n.id === current ? "active" : n.id === checking ? "compare" : done.has(n.id) ? "done" : n.id in dist ? "swap" : "default", badge: n.id in dist ? `d=${dist[n.id]}` : undefined })),
            edges: BFS_EDGES.map(([a, b]): GraphEdge => ({ from: a, to: b, tone: tree.has(`${a}${b}`) || tree.has(`${b}${a}`) ? "path" : "default" })),
          },
          { kind: "list", style: "queue", label: "fila", items: queue.map((q) => ({ label: q, sub: `d=${dist[q]}` })) },
        ];
        t.step("A entra na fila com distância 0.", view(), 0);
        while (queue.length) {
          const u = queue.shift()!;
          t.step(`poll() → ${u}. Agora olhamos os vizinhos dele.`, view(u), 2);
          for (const v of adj[u]) {
            if (v in dist) {
              t.step(`${v} já foi descoberto (d=${dist[v]}): ignora.`, view(u, v), 4);
              continue;
            }
            dist[v] = dist[u] + 1;
            tree.add(`${u}${v}`);
            queue.push(v);
            t.step(`${v} é novo: d=${dist[v]} e entra no fim da fila.`, view(u, v), 6);
          }
          done.add(u);
        }
        t.step("Fila vazia. As arestas em azul formam a árvore de caminhos mínimos. O(V + E).", view(), 1);
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------------ monotonic stack

function nextGreater(nums: number[]): Scenario {
  return {
    label: nums.join(", "),
    build() {
      const t = new Trace();
      const ans: (number | null)[] = nums.map(() => null);
      const stack: number[] = [];
      const view = (i: number, tone: Tone, popped?: number): Panel[] => [
        { kind: "array", label: "nums", values: nums, tones: { ...tones([stack, "swap"]), ...(popped !== undefined ? { [popped]: "done" as Tone } : {}), [i]: tone }, pointers: i < nums.length ? [{ index: i, label: "i" }] : [] },
        { kind: "list", style: "stack", label: "pilha (índices, valores decrescentes)", items: stack.map((s) => ({ label: String(nums[s]), sub: `i=${s}` })) },
        { kind: "array", label: "próximo maior", values: ans.map((v) => (v === null ? "?" : v)), tones: popped !== undefined ? { [popped]: "done" } : {} },
      ];
      for (let i = 0; i < nums.length; i++) {
        t.step(`Chega ${nums[i]}. Ele é o "próximo maior" de todo topo menor que ele.`, view(i, "active"), 1);
        while (stack.length && nums[stack[stack.length - 1]] < nums[i]) {
          const j = stack.pop()!;
          ans[j] = nums[i];
          t.step(`${nums[j]} < ${nums[i]}: desempilha ${nums[j]} e grava a resposta dele.`, view(i, "active", j), 3);
        }
        stack.push(i);
        t.step(`Empilha ${nums[i]}. A pilha continua decrescente.`, view(i, "compare"), 4);
      }
      for (const j of stack) ans[j] = -1;
      t.step("Quem sobrou na pilha não tem próximo maior: -1. Cada índice entra e sai uma vez: O(n).", view(nums.length, "default"), 5);
      return t.frames;
    },
  };
}

export const monotonicStack: VisualizerDef = {
  title: "Monotonic stack: próximo elemento maior",
  summary: "A pilha guarda índices cujos próximos maiores ainda não apareceram, em ordem decrescente de valor. Um valor novo resolve de uma vez todos os topos menores que ele.",
  code: ["pilha = []", "para i de 0 a n-1:", "  enquanto pilha e a[topo] < a[i]:", "    resp[pop()] = a[i]", "  pilha.push(i)", "restantes: resp = -1"],
  scenarios: [nextGreater([2, 1, 5, 3, 4, 6, 1])],
  random: () => nextGreater(randomArray(randInt(6, 9), 1, 20)),
};
