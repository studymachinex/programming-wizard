import { Trace, randInt, randomArray, range, tones } from "../core";
import type { Panel, Scenario, Tone, TreeNode, VisualizerDef } from "../types";

// ------------------------------------------------------ reconhecendo o padrão

function longestUnique(s: string, mode: "brute" | "window"): Scenario {
  return {
    label: mode === "brute" ? `força bruta: "${s}"` : `janela deslizante: "${s}"`,
    build() {
      const t = new Trace();
      const chars = s.split("");
      let ops = 0;
      let best = 0;
      let bestAt = 0;
      if (mode === "brute") {
        for (let i = 0; i < chars.length; i++) {
          const seen = new Set<string>();
          for (let j = i; j < chars.length; j++) {
            ops++;
            if (seen.has(chars[j])) {
              t.step(`Início ${i}: '${chars[j]}' repetiu em ${j}. Recomeça do próximo início — e reexamina tudo de novo.`, [{ kind: "array", label: "s", values: chars, tones: { [j]: "bad" }, ranges: [{ from: i, to: j - 1, tone: "compare" }] }, { kind: "vars", entries: [{ name: "operações", value: ops, tone: "bad" }, { name: "melhor", value: best }] }], 0);
              break;
            }
            seen.add(chars[j]);
            if (j - i + 1 > best) {
              best = j - i + 1;
              bestAt = i;
            }
            t.step(`Início ${i}, fim ${j}: "${s.slice(i, j + 1)}" sem repetição.`, [{ kind: "array", label: "s", values: chars, tones: { [j]: "active" }, ranges: [{ from: i, to: j, tone: "compare" }] }, { kind: "vars", entries: [{ name: "operações", value: ops, tone: "swap" }, { name: "melhor", value: best }] }], 0);
          }
        }
      } else {
        const last = new Map<string, number>();
        let l = 0;
        for (let r = 0; r < chars.length; r++) {
          ops++;
          const prev = last.get(chars[r]);
          if (prev !== undefined && prev >= l) {
            l = prev + 1;
            t.step(`'${chars[r]}' já está na janela (posição ${prev}): L pula para ${l}, sem voltar.`, [{ kind: "array", label: "s", values: chars, tones: { [r]: "swap", [prev]: "bad" }, ranges: [{ from: l, to: r, tone: "active" }], pointers: [{ index: l, label: "L" }, { index: r, label: "R", tone: "compare" }] }, { kind: "vars", entries: [{ name: "operações", value: ops, tone: "done" }, { name: "melhor", value: best }] }], 2);
          }
          last.set(chars[r], r);
          if (r - l + 1 > best) {
            best = r - l + 1;
            bestAt = l;
          }
          t.step(`R = ${r}: janela "${s.slice(l, r + 1)}" (tamanho ${r - l + 1}).`, [{ kind: "array", label: "s", values: chars, tones: { [r]: "active" }, ranges: [{ from: l, to: r, tone: "active", label: String(r - l + 1) }], pointers: [{ index: l, label: "L" }, { index: r, label: "R", tone: "compare" }] }, { kind: "vars", entries: [{ name: "operações", value: ops, tone: "done" }, { name: "melhor", value: best }] }], 3);
        }
      }
      t.step(`Resposta: "${s.slice(bestAt, bestAt + best)}" (${best}). ${mode === "brute" ? `Foram ${ops} operações — O(n²).` : `Foram ${ops} operações: cada caractere entra uma vez — O(n).`}`, [{ kind: "array", label: "s", values: chars, ranges: [{ from: bestAt, to: bestAt + best - 1, tone: "done", label: "melhor" }] }, { kind: "vars", entries: [{ name: "operações", value: ops, tone: mode === "brute" ? "bad" : "done" }, { name: "n", value: chars.length }] }], 4);
      return t.frames;
    },
  };
}

export const reconhecendoPadrao: VisualizerDef = {
  title: "Do força bruta ao padrão: maior substring sem repetição",
  summary: "O funil da aula aplicado: a saída é um comprimento de trecho contíguo e a propriedade \"sem repetição\" é monotônica — sinal de sliding window. Compare quantas operações cada versão gasta.",
  code: ["força bruta: para cada início, estende até repetir", "janela: para R de 0 a n-1:", "  se s[R] está na janela: L = última posição + 1", "  atualiza a última posição de s[R]; melhor = max(melhor, R-L+1)", "fim"],
  scenarios: [longestUnique("abcabcbb", "brute"), longestUnique("abcabcbb", "window"), longestUnique("pwwkew", "window")],
};

// -------------------------------------------------- comunicação e trade-offs

function kthHeap(nums: number[], k: number): Scenario {
  return {
    label: `heap de tamanho ${k}`,
    build() {
      const t = new Trace();
      const heap: number[] = [];
      const push = (x: number) => {
        heap.push(x);
        let i = heap.length - 1;
        while (i > 0 && heap[(i - 1) >> 1] > heap[i]) {
          [heap[i], heap[(i - 1) >> 1]] = [heap[(i - 1) >> 1], heap[i]];
          i = (i - 1) >> 1;
        }
      };
      const pop = () => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length) {
          heap[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1;
            const r = l + 1;
            let m = i;
            if (l < heap.length && heap[l] < heap[m]) m = l;
            if (r < heap.length && heap[r] < heap[m]) m = r;
            if (m === i) break;
            [heap[i], heap[m]] = [heap[m], heap[i]];
            i = m;
          }
        }
        return top;
      };
      const tree = (): TreeNode | null => {
        const b = (i: number): TreeNode | null => (i >= heap.length ? null : { id: `h${i}`, label: String(heap[i]), tone: i === 0 ? "active" : undefined, children: 2 * i + 1 < heap.length ? [b(2 * i + 1), b(2 * i + 2)] : [] });
        return b(0);
      };
      nums.forEach((x, i) => {
        push(x);
        let removed: number | undefined;
        if (heap.length > k) removed = pop();
        t.step(removed !== undefined ? `Entra ${x}; o heap passou de ${k}, então sai o menor (${removed}). Sobram os ${k} maiores vistos.` : `Entra ${x}. Heap com ${heap.length} de ${k}.`, [
          { kind: "array", label: "nums", values: nums, tones: { ...tones([range(0, i - 1), "muted"]), [i]: "active" } },
          { kind: "tree", label: `min-heap (raiz = ${k}º maior até agora)`, binary: true, root: tree() },
        ], removed !== undefined ? 2 : 1);
      });
      t.step(`A raiz do heap, ${heap[0]}, é o ${k}º maior. O(n log k) de tempo e O(k) de memória — melhor que ordenar quando k é pequeno.`, [{ kind: "tree", label: "min-heap final", binary: true, root: tree() }, { kind: "vars", entries: [{ name: `${k}º maior`, value: heap[0], tone: "done" }] }], 3);
      return t.frames;
    },
  };
}

function kthSort(nums: number[], k: number): Scenario {
  return {
    label: "ordenar e indexar",
    build() {
      const t = new Trace();
      t.step("Alternativa simples: ordenar tudo. Fácil de explicar, O(n log n) de tempo e O(n) se não puder mexer no array.", [{ kind: "bars", values: nums }], 5);
      const sorted = [...nums].sort((a, b) => b - a);
      t.step(`Ordenado em ordem decrescente: o ${k}º maior está no índice ${k - 1}.`, [{ kind: "bars", values: sorted, tones: { [k - 1]: "done" }, pointers: [{ index: k - 1, label: `${k}º` }] }], 6);
      t.step("Trade-off para verbalizar: ordenar é mais simples e ótimo para n pequeno; o heap ganha quando k ≪ n ou os dados chegam em stream.", [{ kind: "vars", entries: [{ name: "ordenar", value: "O(n log n)" }, { name: "heap", value: "O(n log k)", tone: "done" }] }], 6);
      return t.frames;
    },
  };
}

const KTH = [3, 2, 1, 5, 6, 4, 8, 7];

export const comunicacaoTradeoffs: VisualizerDef = {
  title: "k-ésimo maior: duas abordagens para comparar em voz alta",
  summary: "O exemplo da aula: o mesmo problema com heap de tamanho k e com ordenação. Use as duas animações para treinar a frase \"vou usar X porque..., o custo é..., a alternativa seria...\".",
  code: ["heap = min-heap vazio", "para x em nums: heap.offer(x)", "  se heap.size > k: heap.poll()", "return heap.peek()", "", "alternativa: ordena decrescente", "  return nums[k-1]"],
  scenarios: [kthHeap(KTH, 3), kthSort(KTH, 3)],
  random: () => kthHeap(randomArray(8, 1, 50), randInt(2, 4)),
};

// ------------------------------------------------- bordas, complexidade e testes

function lowerBoundCase(nums: number[], target: number, label: string): Scenario {
  return {
    label,
    build() {
      const t = new Trace();
      let lo = 0;
      let hi = nums.length;
      const view = (mid?: number, tone: Tone = "active"): Panel[] => [
        nums.length
          ? { kind: "array", label: `nums (alvo ${target})`, values: nums, tones: { ...tones([range(0, lo - 1), "muted"], [range(hi, nums.length - 1), "muted"]), ...(mid !== undefined ? { [mid]: tone } : {}) }, pointers: [...(lo < nums.length ? [{ index: lo, label: "lo", tone: "compare" as Tone }] : []), ...(mid !== undefined ? [{ index: mid, label: "mid" }] : [])] }
          : { kind: "text", label: "nums", lines: [{ text: "[]  (array vazio)", tone: "swap" }] },
        { kind: "vars", entries: [{ name: "lo", value: lo }, { name: "hi", value: hi }, { name: "invariante", value: "resposta em [lo, hi]" }] },
      ];
      t.step(`Intervalo meio-aberto: hi = n = ${nums.length}. Assim "não existe maior ou igual" vira a resposta n, sem caso especial.`, view(), 0);
      while (lo < hi) {
        const mid = lo + ((hi - lo) >> 1);
        if (nums[mid] < target) {
          t.step(`nums[${mid}] = ${nums[mid]} < ${target}: a resposta está depois de mid → lo = ${mid + 1}.`, view(mid, "compare"), 3);
          lo = mid + 1;
        } else {
          t.step(`nums[${mid}] = ${nums[mid]} ≥ ${target}: mid pode ser a resposta → hi = ${mid}.`, view(mid, "active"), 4);
          hi = mid;
        }
      }
      t.step(`lo == hi = ${lo}: ${lo === nums.length ? "nenhum elemento ≥ alvo (devolve n)" : `primeiro índice com valor ≥ ${target}`}. O laço roda ⌈log₂(n+1)⌉ vezes, inclusive com n = 0.`, view(lo < nums.length ? lo : undefined, "done"), 5);
      return t.frames;
    },
  };
}

export const bordasComplexidadeTestes: VisualizerDef = {
  title: "lowerBound contra as bordas",
  summary: "O exemplo da aula testado na ordem que expõe bugs: vazio, um elemento, repetidos, tudo menor e tudo maior. Um contrato meio-aberto [lo, hi) resolve todos sem if especial.",
  code: ["lowerBound(nums, alvo):", "  lo = 0; hi = n          // [lo, hi)", "  enquanto lo < hi:", "    se nums[mid] < alvo: lo = mid + 1", "    senão: hi = mid", "  return lo"],
  scenarios: [
    lowerBoundCase([], 5, "vazio"),
    lowerBoundCase([3], 3, "um elemento"),
    lowerBoundCase([1, 2, 2, 2, 5, 8], 2, "repetidos"),
    lowerBoundCase([1, 3, 5, 7], 9, "tudo menor que o alvo"),
    lowerBoundCase([4, 6, 9], 1, "tudo maior que o alvo"),
  ],
};

// ------------------------------------------------------------ mock interview

const PHASES = [
  { name: "Contexto", min: 5, say: "Repita o problema com suas palavras: \"dado um array e um alvo, devolver os índices de dois números que somam o alvo\"." },
  { name: "Requisitos", min: 5, say: "Clarifique: pode haver negativos? Exatamente uma resposta? Posso usar o mesmo elemento duas vezes? Retorno índices ou valores?" },
  { name: "Exemplos", min: 5, say: "Monte casos: [2,7,11,15] alvo 9 → [0,1]; [3,3] alvo 6 → [0,1]; borda: array com 2 elementos." },
  { name: "Solução", min: 15, say: "Força bruta O(n²) com dois laços; depois: \"para cada x, procuro alvo − x num HashMap\" → O(n) de tempo, O(n) de memória." },
  { name: "Código", min: 10, say: "Escreva a versão com HashMap, narrando decisões (\"guardo depois de checar, para não usar o mesmo índice\")." },
  { name: "Testes", min: 5, say: "Rode os exemplos à mão, depois as bordas. Feche com complexidade e o trade-off memória × tempo." },
];

export const mockInterview: VisualizerDef = {
  title: "O roteiro de 45 minutos, fase a fase",
  summary: "A linha do tempo da aula aplicada a um problema concreto (Two Sum). Cada passo mostra quanto tempo a fase leva e o que você deveria estar dizendo nela.",
  scenarios: [
    {
      label: "Two Sum em 45 minutos",
      build() {
        const t = new Trace();
        let elapsed = 0;
        PHASES.forEach((phase, i) => {
          elapsed += phase.min;
          t.step(`${phase.name} (${phase.min} min): ${phase.say}`, [
            { kind: "grid", label: "linha do tempo", colHeaders: PHASES.map((p) => p.name), rows: [PHASES.map((p) => `${p.min} min`)], tones: PHASES.map((_, c) => ({ r: 0, c, tone: (c < i ? "done" : c === i ? "active" : "muted") as Tone })) },
            { kind: "vars", entries: [{ name: "tempo decorrido", value: `${elapsed} de 45 min`, tone: elapsed > 40 ? "swap" : "default" }, { name: "fase", value: `${i + 1}/${PHASES.length}` }] },
          ]);
        });
        t.step("Se travar em alguma fase, diga em voz alta onde travou e qual hipótese está testando — silêncio é o pior sinal.", [{ kind: "grid", label: "linha do tempo", colHeaders: PHASES.map((p) => p.name), rows: [PHASES.map((p) => `${p.min} min`)], tones: PHASES.map((_, c) => ({ r: 0, c, tone: "done" as Tone })) }]);
        return t.frames;
      },
    },
  ],
};
