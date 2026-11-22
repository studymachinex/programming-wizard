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

  // Algoritmos Avançados & Padrões de Entrevista
  "algoritmos-avancados/reconhecendo-o-padrao": () => import("./adv/framework").then((m) => m.reconhecendoPadrao),
  "algoritmos-avancados/comunicacao-e-tradeoffs": () => import("./adv/framework").then((m) => m.comunicacaoTradeoffs),
  "algoritmos-avancados/bordas-complexidade-e-testes": () => import("./adv/framework").then((m) => m.bordasComplexidadeTestes),
  "algoritmos-avancados/two-heaps-median-stream": () => import("./adv/patterns").then((m) => m.twoHeaps),
  "algoritmos-avancados/merge-intervals": () => import("./adv/patterns").then((m) => m.mergeIntervals),
  "algoritmos-avancados/backtracking-template": () => import("./adv/patterns").then((m) => m.backtracking),
  "algoritmos-avancados/greedy-e-prova": () => import("./adv/patterns").then((m) => m.greedyProva),
  "algoritmos-avancados/dp-1d": () => import("./adv/dp").then((m) => m.dp1d),
  "algoritmos-avancados/dp-2d-knapsack": () => import("./adv/dp").then((m) => m.dp2dKnapsack),
  "algoritmos-avancados/lis-intervalos-stocks": () => import("./adv/dp").then((m) => m.lisIntervalosStocks),
  "algoritmos-avancados/tree-dp-bitmask": () => import("./adv/dp").then((m) => m.treeDpBitmask),
  "algoritmos-avancados/bellman-ford-floyd-warshall": () => import("./adv/graphs").then((m) => m.bellmanFloyd),
  "algoritmos-avancados/scc-tarjan-kosaraju": () => import("./adv/graphs").then((m) => m.sccKosaraju),
  "algoritmos-avancados/max-flow-min-cut": () => import("./adv/graphs").then((m) => m.maxFlowMinCut),
  "algoritmos-avancados/lca-binary-lifting": () => import("./adv/graphs").then((m) => m.lcaBinaryLifting),
  "algoritmos-avancados/segment-tree-lazy": () => import("./adv/structures").then((m) => m.segmentTreeLazy),
  "algoritmos-avancados/fenwick-sparse-table": () => import("./adv/structures").then((m) => m.fenwickSparse),
  "algoritmos-avancados/lru-lfu-skiplist-bloom": () => import("./adv/structures").then((m) => m.lruLfuSkipBloom),
  "algoritmos-avancados/primos-mdc-crivo": () => import("./adv/math").then((m) => m.primosMdcCrivo),
  "algoritmos-avancados/aritmetica-modular": () => import("./adv/math").then((m) => m.aritmeticaModular),
  "algoritmos-avancados/combinatoria": () => import("./adv/math").then((m) => m.combinatoria),
  "algoritmos-avancados/manipulacao-de-bits": () => import("./adv/math").then((m) => m.manipulacaoBits),
  "algoritmos-avancados/mock-interview-45-minutos": () => import("./adv/framework").then((m) => m.mockInterview),
};

export function hasVisualizer(track: string, lesson: string): boolean {
  return `${track}/${lesson}` in LOADERS;
}

export async function loadVisualizer(track: string, lesson: string): Promise<VisualizerDef | null> {
  const loader = LOADERS[`${track}/${lesson}`];
  return loader ? loader() : null;
}

export const VISUALIZER_KEYS = Object.keys(LOADERS);
