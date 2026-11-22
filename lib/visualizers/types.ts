/**
 * Modelo dos visualizadores de algoritmos.
 *
 * Um visualizador é uma lista de cenários; cada cenário gera uma sequência de quadros (frames).
 * Um quadro tem a legenda do passo, a linha do pseudocódigo em destaque e os painéis a desenhar.
 * Os geradores são funções puras em TypeScript (sem React), então dá para testá-los com `tsx`.
 */

export type Tone = "default" | "active" | "compare" | "done" | "swap" | "bad" | "muted" | "path";

export type Pointer = { index: number; label: string; tone?: Tone };

export type ArrayPanel = {
  kind: "array";
  label?: string;
  values: (number | string | null)[];
  tones?: Record<number, Tone>;
  pointers?: Pointer[];
  ranges?: { from: number; to: number; tone?: Tone; label?: string }[];
  showIndex?: boolean;
  /** Primeiro índice exibido (para arrays 1-based, como Fenwick). */
  indexBase?: number;
};

export type BarsPanel = {
  kind: "bars";
  label?: string;
  values: number[];
  tones?: Record<number, Tone>;
  pointers?: Pointer[];
};

export type GraphNode = { id: string; label?: string; x: number; y: number; tone?: Tone; badge?: string };
export type GraphEdge = { from: string; to: string; label?: string; tone?: Tone; directed?: boolean };
export type GraphPanel = {
  kind: "graph";
  label?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Coordenadas dos nós estão nesse espaço (padrão 100 x 60). */
  width?: number;
  height?: number;
};

export type TreeNode = {
  id: string;
  label: string;
  tone?: Tone;
  badge?: string;
  /** Em árvores binárias use exatamente dois filhos, com null onde não houver. */
  children?: (TreeNode | null)[];
};
export type TreePanel = { kind: "tree"; label?: string; root: TreeNode | null; binary?: boolean };

export type GridPanel = {
  kind: "grid";
  label?: string;
  rows: (number | string | null)[][];
  rowHeaders?: string[];
  colHeaders?: string[];
  tones?: { r: number; c: number; tone: Tone }[];
};

export type ListItem = { label: string; tone?: Tone; sub?: string };
export type ListPanel = {
  kind: "list";
  label?: string;
  style: "linked" | "doubly" | "circular" | "stack" | "queue";
  items: ListItem[];
  pointers?: Pointer[];
};

export type BucketsPanel = {
  kind: "buckets";
  label?: string;
  buckets: { label: string; items: ListItem[]; tone?: Tone }[];
};

export type VarsPanel = { kind: "vars"; label?: string; entries: { name: string; value: string | number; tone?: Tone }[] };

export type ChartPanel = {
  kind: "chart";
  label?: string;
  xLabel?: string;
  yLabel?: string;
  logY?: boolean;
  series: { label: string; points: [number, number][]; tone?: Tone }[];
  markerX?: number;
};

export type TextPanel = { kind: "text"; label?: string; lines: { text: string; tone?: Tone }[] };

export type Panel =
  | ArrayPanel
  | BarsPanel
  | GraphPanel
  | TreePanel
  | GridPanel
  | ListPanel
  | BucketsPanel
  | VarsPanel
  | ChartPanel
  | TextPanel;

export type Frame = {
  caption: string;
  /** Índice (0-based) da linha do pseudocódigo em destaque. */
  line?: number;
  panels: Panel[];
};

export type Scenario = { label: string; build: () => Frame[] };

export type VisualizerDef = {
  title: string;
  summary: string;
  /** Pseudocódigo exibido ao lado; os quadros apontam para estas linhas. */
  code?: string[];
  scenarios: Scenario[];
  /** Gera um cenário novo com entrada aleatória (botão "Aleatório"). */
  random?: () => Scenario;
};
