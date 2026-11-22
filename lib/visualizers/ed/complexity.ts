import { Trace, tones } from "../core";
import type { ChartPanel, Panel, VisualizerDef } from "../types";

// --------------------------------------------------------------- por que DSA decide

const COMPRADOS = [104, 211, 37, 560, 88, 402, 19, 333, 75, 260];
const VISTOS = [402, 50, 19];

function hashBuckets(values: number[], capacity: number, highlight?: number, tone: "compare" | "done" | "bad" = "compare"): Panel {
  const buckets = Array.from({ length: capacity }, (_, b) => ({
    label: `[${b}]`,
    tone: highlight !== undefined && highlight % capacity === b ? ("active" as const) : undefined,
    items: values.filter((v) => v % capacity === b).map((v) => ({ label: String(v), tone: v === highlight ? tone : undefined })),
  }));
  return { kind: "buckets", label: `HashSet<Long> comprados (capacidade ${capacity}, bucket = id % ${capacity})`, buckets };
}

export const porQueDsaDecide: VisualizerDef = {
  title: "List.contains × HashSet.contains",
  summary:
    "O mesmo laço da aula: para cada id visto, verificar se ele está entre os comprados. Com uma List, cada contains varre a lista; com um HashSet, o hash leva direto ao bucket.",
  code: [
    "para cada id em vistos:",
    "  se comprados.contains(id):",
    "    remover(id)",
    "",
    "// List.contains: compara um a um  -> O(n)",
    "// HashSet.contains: hash -> bucket -> O(1)",
  ],
  scenarios: [
    {
      label: "List (busca linear)",
      build() {
        const t = new Trace();
        let comparacoes = 0;
        for (const id of VISTOS) {
          let found = -1;
          for (let i = 0; i < COMPRADOS.length; i++) {
            comparacoes++;
            const hit = COMPRADOS[i] === id;
            t.step(
              hit ? `Comparou ${id} com comprados[${i}] = ${COMPRADOS[i]}: achou.` : `Comparou ${id} com comprados[${i}] = ${COMPRADOS[i]}: não é.`,
              [
                { kind: "array", label: "List<Long> comprados", values: COMPRADOS, tones: tones([[i], hit ? "done" : "compare"]), pointers: [{ index: i, label: "i" }] },
                { kind: "vars", entries: [{ name: "id procurado", value: id, tone: "active" }, { name: "comparações (total)", value: comparacoes, tone: "swap" }] },
              ],
              1,
            );
            if (hit) {
              found = i;
              break;
            }
          }
          if (found < 0) {
            t.step(`${id} não está na lista — mas só descobrimos isso depois de comparar com todos os ${COMPRADOS.length}.`, [
              { kind: "array", label: "List<Long> comprados", values: COMPRADOS, tones: tones([COMPRADOS.map((_, k) => k), "muted"]) },
              { kind: "vars", entries: [{ name: "id procurado", value: id, tone: "bad" }, { name: "comparações (total)", value: comparacoes, tone: "swap" }] },
            ], 1);
          }
        }
        t.step(
          `Total: ${comparacoes} comparações para ${VISTOS.length} buscas. Com 50 mil vistos e 50 mil comprados, seriam ~2,5 bilhões — O(n·m).`,
          [{ kind: "vars", entries: [{ name: "comparações", value: comparacoes, tone: "bad" }, { name: "pior caso", value: `${VISTOS.length} × ${COMPRADOS.length}` }] }],
          4,
        );
        return t.frames;
      },
    },
    {
      label: "HashSet (hash → bucket)",
      build() {
        const t = new Trace();
        const cap = 8;
        let comparacoes = 0;
        for (const id of VISTOS) {
          const bucket = id % cap;
          t.step(`hash(${id}) % ${cap} = ${bucket}: vamos direto ao bucket ${bucket}.`, [hashBuckets(COMPRADOS, cap, id), { kind: "vars", entries: [{ name: "id procurado", value: id, tone: "active" }, { name: "comparações (total)", value: comparacoes }] }], 1);
          const items = COMPRADOS.filter((v) => v % cap === bucket);
          comparacoes += Math.max(1, items.length);
          const hit = items.includes(id);
          t.step(
            hit ? `O bucket ${bucket} tem ${items.length} item(ns); ${id} está lá.` : `O bucket ${bucket} não tem ${id}: ausente, sem olhar o resto da tabela.`,
            [hashBuckets(COMPRADOS, cap, id, hit ? "done" : "bad"), { kind: "vars", entries: [{ name: "id procurado", value: id, tone: hit ? "done" : "bad" }, { name: "comparações (total)", value: comparacoes, tone: "swap" }] }],
            hit ? 2 : 1,
          );
        }
        t.step(`Total: ${comparacoes} comparações. O custo por busca não depende do tamanho da coleção — O(n + m) no laço inteiro.`, [{ kind: "vars", entries: [{ name: "comparações", value: comparacoes, tone: "done" }] }], 5);
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------------------------ Big-O

const CLASSES: { label: string; f: (n: number) => number; tone: ChartPanel["series"][number]["tone"] }[] = [
  { label: "O(1)", f: () => 1, tone: "done" },
  { label: "O(log n)", f: (n) => Math.max(1, Math.log2(n)), tone: "path" },
  { label: "O(n)", f: (n) => n, tone: "compare" },
  { label: "O(n log n)", f: (n) => n * Math.max(1, Math.log2(n)), tone: "active" },
  { label: "O(n²)", f: (n) => n * n, tone: "bad" },
];

function growth(logY: boolean): VisualizerDef["scenarios"][number] {
  return {
    label: logY ? "Escala logarítmica" : "Escala linear",
    build() {
      const t = new Trace();
      const ns = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
      for (const n of ns) {
        const series = CLASSES.map((c) => ({ label: c.label, tone: c.tone, points: ns.filter((x) => x <= n).map((x) => [x, c.f(x)] as [number, number]) }));
        t.step(
          n === ns[ns.length - 1]
            ? "Com n = 1024, O(n²) faz ~1 milhão de operações; O(n log n), ~10 mil; O(log n), 10. Constantes deixam de importar."
            : `n = ${n}: quanto cada classe custa. Dobrar n dobra O(n), quadruplica O(n²) e soma só 1 a O(log n).`,
          [
            { kind: "chart", xLabel: "n", yLabel: "operações", logY, series, markerX: n },
            { kind: "vars", entries: CLASSES.map((c) => ({ name: c.label, value: Math.round(c.f(n)).toLocaleString("pt-BR"), tone: c.tone })) },
          ],
        );
      }
      return t.frames;
    },
  };
}

export const bigOThetaOmega: VisualizerDef = {
  title: "Como cada classe de complexidade cresce",
  summary: "Aumente n e compare o número de operações de cada classe. Na escala linear, O(n²) engole o gráfico; na logarítmica, dá para ver todas.",
  scenarios: [growth(false), growth(true)],
};

// -------------------------------------------------------------- custo amortizado

export const custoAmortizado: VisualizerDef = {
  title: "Dynamic array: add com redimensionamento",
  summary:
    "Cada add escreve um elemento; quando o array enche, ele dobra e copia tudo. A cópia é O(n), mas acontece cada vez mais raramente — o custo médio por add fica constante.",
  code: [
    "add(x):",
    "  se tamanho == capacidade:",
    "    novo = array[2 * capacidade]",
    "    copiar todos para novo   // O(n)",
    "  array[tamanho++] = x       // O(1)",
  ],
  scenarios: [
    {
      label: "17 adds (capacidade inicial 1)",
      build() {
        const t = new Trace();
        let cap = 1;
        let arr: (number | null)[] = [null];
        let size = 0;
        let writes = 0;
        let copies = 0;
        const vars = () => [
          { kind: "vars" as const, entries: [
            { name: "tamanho", value: size },
            { name: "capacidade", value: cap },
            { name: "cópias (total)", value: copies, tone: "swap" as const },
            { name: "custo total", value: writes + copies },
            { name: "custo médio por add", value: size ? ((writes + copies) / size).toFixed(2) : "0", tone: "done" as const },
          ] },
        ];
        for (let x = 1; x <= 17; x++) {
          if (size === cap) {
            const old = arr;
            cap *= 2;
            arr = [...old, ...Array(cap - old.length).fill(null)];
            copies += size;
            t.step(`Cheio! Aloca capacidade ${cap} e copia os ${size} elementos (custo ${size}).`, [
              { kind: "array", label: "array interno", values: arr, tones: tones([Array.from({ length: size }, (_, i) => i), "swap"]) },
              ...vars(),
            ], 3);
          }
          arr[size] = x * 10;
          size++;
          writes++;
          t.step(`add(${x * 10}) escreve na posição ${size - 1}.`, [
            { kind: "array", label: "array interno", values: arr, tones: tones([[size - 1], "active"]), pointers: [{ index: size - 1, label: "novo" }] },
            ...vars(),
          ], 4);
        }
        t.step("Somando escritas e cópias, o total fica abaixo de 3·n: por isso add é O(1) amortizado, mesmo com cópias O(n) ocasionais.", [
          { kind: "array", label: "array interno", values: arr, tones: tones([Array.from({ length: size }, (_, i) => i), "done"]) },
          ...vars(),
        ]);
        return t.frames;
      },
    },
  ],
};
