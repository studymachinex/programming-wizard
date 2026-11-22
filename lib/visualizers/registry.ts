import type { VisualizerDef } from "./types";

type Loader = () => Promise<VisualizerDef>;

/**
 * Aula → visualizador. A chave é "<trilha>/<aula>". Cada módulo é carregado sob demanda,
 * então a página de uma aula só baixa o código do visualizador dela.
 */
const LOADERS: Record<string, Loader> = {
  // Estruturas de Dados & Algoritmos
  "estruturas-dados/por-que-dsa-decide": () => import("./ed/complexity").then((m) => m.porQueDsaDecide),
  "estruturas-dados/big-o-theta-omega": () => import("./ed/complexity").then((m) => m.bigOThetaOmega),
  "estruturas-dados/custo-amortizado-e-medicao": () => import("./ed/complexity").then((m) => m.custoAmortizado),
  "estruturas-dados/arrays-e-dynamic-array": () => import("./ed/arrays").then((m) => m.arraysDynamic),
  "estruturas-dados/linked-list-simples": () => import("./ed/arrays").then((m) => m.linkedListSimples),
  "estruturas-dados/doubly-e-circular": () => import("./ed/arrays").then((m) => m.doublyCircular),
  "estruturas-dados/two-pointers": () => import("./ed/arrays").then((m) => m.twoPointers),
  "estruturas-dados/sliding-window-e-prefix-sums": () => import("./ed/arrays").then((m) => m.slidingWindowPrefix),
  "estruturas-dados/stack-e-aplicacoes": () => import("./ed/stacks").then((m) => m.stackAplicacoes),
  "estruturas-dados/queue-deque-e-bfs": () => import("./ed/stacks").then((m) => m.queueDequeBfs),
  "estruturas-dados/monotonic-stack": () => import("./ed/stacks").then((m) => m.monotonicStack),
  "estruturas-dados/hashing-colisoes-load-factor": () => import("./ed/hashing").then((m) => m.hashingLoadFactor),
  "estruturas-dados/hashmap-com-chaining": () => import("./ed/hashing").then((m) => m.hashmapChaining),
  "estruturas-dados/frequency-maps-e-sets": () => import("./ed/hashing").then((m) => m.frequencyMaps),
  "estruturas-dados/lru-cache": () => import("./ed/hashing").then((m) => m.lruCache),
  "estruturas-dados/bst-operacoes": () => import("./ed/trees").then((m) => m.bstOperacoes),
  "estruturas-dados/traversals-e-recursao": () => import("./ed/trees").then((m) => m.traversals),
  "estruturas-dados/heaps-e-priority-queue": () => import("./ed/trees").then((m) => m.heapsPriorityQueue),
  "estruturas-dados/trie": () => import("./ed/trees").then((m) => m.trie),
  "estruturas-dados/balanceamento-avl-red-black": () => import("./ed/trees").then((m) => m.avlRedBlack),
  "estruturas-dados/ordenacao-quadratica-e-estabilidade": () => import("./ed/sorting").then((m) => m.ordenacaoQuadratica),
  "estruturas-dados/merge-sort-e-quick-sort": () => import("./ed/sorting").then((m) => m.mergeQuick),
  "estruturas-dados/counting-e-radix-sort": () => import("./ed/sorting").then((m) => m.countingRadix),
  "estruturas-dados/binary-search-e-variantes": () => import("./ed/sorting").then((m) => m.binarySearchVariantes),
  "estruturas-dados/grafos-representacoes-bfs-dfs": () => import("./ed/graphs").then((m) => m.grafosBfsDfs),
  "estruturas-dados/topological-sort": () => import("./ed/graphs").then((m) => m.topologicalSort),
  "estruturas-dados/dijkstra-e-pesos": () => import("./ed/graphs").then((m) => m.dijkstra),
  "estruturas-dados/union-find-e-mst": () => import("./ed/graphs").then((m) => m.unionFindMst),

};

export function hasVisualizer(track: string, lesson: string): boolean {
  return `${track}/${lesson}` in LOADERS;
}

export async function loadVisualizer(track: string, lesson: string): Promise<VisualizerDef | null> {
  const loader = LOADERS[`${track}/${lesson}`];
  return loader ? loader() : null;
}

export const VISUALIZER_KEYS = Object.keys(LOADERS);
