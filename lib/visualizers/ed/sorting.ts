import { Trace, randInt, randomArray, range, tones } from "../core";
import type { Panel, Scenario, Tone, VisualizerDef } from "../types";

const bars = (a: number[], marks: Record<number, Tone>, label = "array", pointers: { index: number; label: string; tone?: Tone }[] = []): Panel => ({ kind: "bars", label, values: [...a], tones: marks, pointers });

// ------------------------------------------------------------ quadráticas

function bubble(input: number[]): Scenario {
  return {
    label: "bubble sort",
    build() {
      const t = new Trace();
      const a = [...input];
      const n = a.length;
      let comps = 0;
      for (let end = n - 1; end > 0; end--) {
        let swapped = false;
        for (let i = 0; i < end; i++) {
          comps++;
          const sorted = tones([range(end + 1, n - 1), "done"]);
          if (a[i] > a[i + 1]) {
            [a[i], a[i + 1]] = [a[i + 1], a[i]];
            swapped = true;
            t.step(`${a[i + 1]} > ${a[i]}: troca. O maior vai "borbulhando" para o fim.`, [bars(a, { ...sorted, [i]: "swap", [i + 1]: "swap" }), { kind: "vars", entries: [{ name: "comparações", value: comps }] }], 2);
          } else {
            t.step(`${a[i]} ≤ ${a[i + 1]}: mantém.`, [bars(a, { ...sorted, [i]: "compare", [i + 1]: "compare" }), { kind: "vars", entries: [{ name: "comparações", value: comps }] }], 1);
          }
        }
        if (!swapped) {
          t.step("Uma passada sem trocas: já está ordenado, para cedo (melhor caso O(n)).", [bars(a, tones([range(0, n - 1), "done"]))], 3);
          return t.frames;
        }
      }
      t.step(`Ordenado com ${comps} comparações — O(n²).`, [bars(a, tones([range(0, n - 1), "done"]))], 3);
      return t.frames;
    },
  };
}

function insertion(input: number[]): Scenario {
  return {
    label: "insertion sort",
    build() {
      const t = new Trace();
      const a = [...input];
      for (let i = 1; i < a.length; i++) {
        const x = a[i];
        let j = i - 1;
        t.step(`Pega ${x} e procura o lugar dele no prefixo já ordenado.`, [bars(a, { ...tones([range(0, i - 1), "done"]), [i]: "active" })], 5);
        while (j >= 0 && a[j] > x) {
          a[j + 1] = a[j];
          t.step(`${a[j]} > ${x}: desloca para a direita.`, [bars(a, { ...tones([range(0, i), "done"]), [j]: "compare", [j + 1]: "swap" })], 6);
          j--;
        }
        a[j + 1] = x;
        t.step(`Insere ${x} na posição ${j + 1}. Estável: iguais não trocam de ordem.`, [bars(a, { ...tones([range(0, i), "done"]), [j + 1]: "active" })], 7);
      }
      t.step("Ordenado. Em dados quase ordenados, insertion sort é O(n) — por isso o Timsort usa em blocos pequenos.", [bars(a, tones([range(0, a.length - 1), "done"]))], 7);
      return t.frames;
    },
  };
}

function selection(input: number[]): Scenario {
  return {
    label: "selection sort",
    build() {
      const t = new Trace();
      const a = [...input];
      for (let i = 0; i < a.length - 1; i++) {
        let m = i;
        for (let j = i + 1; j < a.length; j++) {
          if (a[j] < a[m]) m = j;
          t.step(`Procurando o mínimo de [${i}..]: menor até agora é ${a[m]}.`, [bars(a, { ...tones([range(0, i - 1), "done"]), [j]: "compare", [m]: "active" })], 9);
        }
        [a[i], a[m]] = [a[m], a[i]];
        t.step(`Troca o mínimo (${a[i]}) para a posição ${i}. Não é estável: a troca pode pular iguais.`, [bars(a, { ...tones([range(0, i - 1), "done"]), [i]: "swap", [m]: "swap" })], 10);
      }
      t.step("Ordenado. Sempre O(n²) comparações, mas só n − 1 trocas.", [bars(a, tones([range(0, a.length - 1), "done"]))], 10);
      return t.frames;
    },
  };
}

const QUAD_INPUT = [29, 10, 14, 37, 13, 5, 41, 22];

export const ordenacaoQuadratica: VisualizerDef = {
  title: "Bubble, insertion e selection sort",
  summary: "Os três O(n²), lado a lado no mesmo array. Repare em quantas trocas cada um faz e em qual deles para cedo quando a entrada já está quase ordenada.",
  code: [
    "bubble: para cada passada:",
    "  compara vizinhos a[i], a[i+1]",
    "  troca se fora de ordem",
    "  sem trocas → para",
    "",
    "insertion: x = a[i]",
    "  desloca maiores que x para a direita",
    "  coloca x no buraco",
    "",
    "selection: acha o mínimo de [i..n-1]",
    "  troca com a[i]",
  ],
  scenarios: [insertion(QUAD_INPUT), bubble(QUAD_INPUT), selection(QUAD_INPUT)],
  random: () => {
    const a = randomArray(8, 5, 50);
    return [bubble, insertion, selection][randInt(0, 2)](a);
  },
};

// --------------------------------------------------------- merge e quick

function mergeSort(input: number[]): Scenario {
  return {
    label: "merge sort",
    build() {
      const t = new Trace();
      const a = [...input];
      const sort = (lo: number, hi: number) => {
        if (lo >= hi) return;
        const mid = (lo + hi) >> 1;
        t.step(`Divide [${lo}..${hi}] em [${lo}..${mid}] e [${mid + 1}..${hi}].`, [{ kind: "array", label: "array", values: [...a], ranges: [{ from: lo, to: mid, tone: "compare", label: "esq" }, { from: mid + 1, to: hi, tone: "swap", label: "dir" }] }], 1);
        sort(lo, mid);
        sort(mid + 1, hi);
        const left = a.slice(lo, mid + 1);
        const right = a.slice(mid + 1, hi + 1);
        let i = 0;
        let j = 0;
        let k = lo;
        while (i < left.length || j < right.length) {
          const takeLeft = j >= right.length || (i < left.length && left[i] <= right[j]);
          a[k] = takeLeft ? left[i++] : right[j++];
          t.step(`Intercala: o menor das duas frentes é ${a[k]}${takeLeft && j < right.length && left[i - 1] === right[j] ? " (empate: pega a esquerda, por isso é estável)" : ""}.`, [
            { kind: "array", label: "array", values: [...a], tones: { ...tones([range(lo, k - 1), "done"]), [k]: "active" }, ranges: [{ from: lo, to: hi, tone: "active", label: `merge [${lo}..${hi}]` }] },
            { kind: "array", label: "cópia da esquerda", values: left, tones: tones([range(0, i - 1), "muted"]), showIndex: false },
            { kind: "array", label: "cópia da direita", values: right, tones: tones([range(0, j - 1), "muted"]), showIndex: false },
          ], 3);
          k++;
        }
      };
      sort(0, a.length - 1);
      t.step("Ordenado. log n níveis de divisão × O(n) de merge por nível = O(n log n), sempre.", [{ kind: "array", label: "array", values: a, tones: tones([range(0, a.length - 1), "done"]) }], 4);
      return t.frames;
    },
  };
}

function quickSort(input: number[]): Scenario {
  return {
    label: "quick sort (Lomuto)",
    build() {
      const t = new Trace();
      const a = [...input];
      const fixed = new Set<number>();
      const sort = (lo: number, hi: number) => {
        if (lo > hi) return;
        if (lo === hi) {
          fixed.add(lo);
          return;
        }
        const pivot = a[hi];
        let i = lo;
        t.step(`Particiona [${lo}..${hi}] com pivô ${pivot} (o último).`, [bars(a, { ...tones([fixed, "done"]), [hi]: "active" }, "array", [{ index: hi, label: "pivô" }])], 6);
        for (let j = lo; j < hi; j++) {
          if (a[j] < pivot) {
            [a[i], a[j]] = [a[j], a[i]];
            t.step(`${a[i]} < ${pivot}: vai para a região dos menores (troca com a posição ${i}).`, [bars(a, { ...tones([fixed, "done"], [range(lo, i), "compare"]), [i]: "swap", [j]: "swap", [hi]: "active" }, "array", [{ index: i, label: "i" }, { index: j, label: "j", tone: "compare" }])], 7);
            i++;
          } else {
            t.step(`${a[j]} ≥ ${pivot}: fica do lado dos maiores.`, [bars(a, { ...tones([fixed, "done"], [range(lo, i - 1), "compare"]), [j]: "muted", [hi]: "active" }, "array", [{ index: i, label: "i" }, { index: j, label: "j", tone: "compare" }])], 7);
          }
        }
        [a[i], a[hi]] = [a[hi], a[i]];
        fixed.add(i);
        t.step(`Pivô ${pivot} vai para a posição ${i}: à esquerda só menores, à direita só maiores. Ele está na posição final.`, [bars(a, { ...tones([fixed, "done"]), [i]: "active" })], 8);
        sort(lo, i - 1);
        sort(i + 1, hi);
      };
      sort(0, a.length - 1);
      t.step("Ordenado in-place. O(n log n) em média; O(n²) se o pivô for sempre o extremo (entrada já ordenada).", [bars(a, tones([range(0, a.length - 1), "done"]))], 9);
      return t.frames;
    },
  };
}

export const mergeQuick: VisualizerDef = {
  title: "Merge sort e quick sort",
  summary: "Os dois dividem para conquistar. Merge sort divide no meio e trabalha na volta (intercalando); quick sort trabalha na ida (particionando em torno do pivô) e não precisa de array auxiliar.",
  code: ["mergeSort(lo, hi):", "  divide no meio e ordena as metades", "  intercala:", "    pega o menor das duas frentes", "  O(n log n), estável, O(n) extra", "", "quickSort(lo, hi):", "  para j: se a[j] < pivô, troca para a esquerda", "  pivô vai para a posição final", "  recursão nas duas partes"],
  scenarios: [mergeSort([38, 27, 43, 3, 9, 82, 10, 27]), quickSort([38, 27, 43, 3, 9, 82, 10, 31])],
  random: () => (Math.random() < 0.5 ? mergeSort : quickSort)(randomArray(8, 1, 99)),
};

// --------------------------------------------------------- counting e radix

export const countingRadix: VisualizerDef = {
  title: "Counting sort e radix sort",
  summary: "Quando os valores são inteiros num intervalo pequeno, dá para ordenar sem comparar: conte quantas vezes cada valor aparece. O radix aplica isso dígito a dígito, do menos significativo para o mais.",
  code: ["counting: cont[v]++ para cada v", "  acumula: cont[v] += cont[v-1]", "  saída[--cont[v]] = v (de trás para frente)", "", "radix: para cada dígito d (unidade, dezena...):", "  distribui nos baldes 0..9 pelo dígito d", "  recolhe em ordem (estável)"],
  scenarios: [
    {
      label: "counting sort (0..5)",
      build() {
        const t = new Trace();
        const a = [4, 1, 3, 4, 0, 2, 1, 5, 3, 1];
        const cont = Array(6).fill(0);
        a.forEach((v, i) => {
          cont[v]++;
          t.step(`Conta ${v}: cont[${v}] = ${cont[v]}.`, [{ kind: "array", label: "entrada", values: a, tones: { [i]: "active" } }, { kind: "array", label: "cont", values: [...cont], tones: { [v]: "active" } }], 0);
        });
        for (let v = 1; v < 6; v++) {
          cont[v] += cont[v - 1];
          t.step(`Acumula: cont[${v}] = ${cont[v]} — é onde termina a faixa do valor ${v} na saída.`, [{ kind: "array", label: "cont (acumulado)", values: [...cont], tones: { [v]: "swap" } }], 1);
        }
        const out: (number | null)[] = Array(a.length).fill(null);
        for (let i = a.length - 1; i >= 0; i--) {
          const v = a[i];
          out[--cont[v]] = v;
          t.step(`a[${i}] = ${v} vai para saída[${cont[v]}]. Percorrer de trás para frente mantém a estabilidade.`, [{ kind: "array", label: "entrada", values: a, tones: { [i]: "active" } }, { kind: "array", label: "saída", values: [...out], tones: { [cont[v]]: "done" } }, { kind: "array", label: "cont", values: [...cont], tones: { [v]: "swap" } }], 2);
        }
        t.step("O(n + k), sem nenhuma comparação. Só vale quando k (o intervalo) é pequeno.", [{ kind: "array", label: "saída", values: out, tones: tones([range(0, out.length - 1), "done"]) }], 2);
        return t.frames;
      },
    },
    {
      label: "radix sort LSD",
      build() {
        const t = new Trace();
        let a = [170, 45, 75, 90, 802, 24, 2, 66];
        for (const [exp, name] of [[1, "unidade"], [10, "dezena"], [100, "centena"]] as const) {
          const buckets: number[][] = Array.from({ length: 10 }, () => []);
          for (const v of a) buckets[Math.floor(v / exp) % 10].push(v);
          t.step(`Distribui pela ${name}: cada número vai para o balde do seu dígito.`, [
            { kind: "array", label: "antes", values: a },
            { kind: "buckets", label: `baldes pelo dígito da ${name}`, buckets: buckets.map((b, d) => ({ label: String(d), items: b.map((v) => ({ label: String(v) })), tone: b.length ? ("active" as Tone) : undefined })) },
          ], 5);
          a = buckets.flat();
          t.step(`Recolhe os baldes em ordem. Ordenado pela ${name}; os dígitos anteriores mantêm a ordem (estável).`, [{ kind: "array", label: "depois", values: a, tones: exp === 100 ? tones([range(0, a.length - 1), "done"]) : {} }], 6);
        }
        return t.frames;
      },
    },
  ],
};

// --------------------------------------------------------- busca binária

function binarySearch(a: number[], target: number, variant: "classic" | "first" | "rotated"): Scenario {
  const labels = { classic: `buscar ${target}`, first: `primeira ocorrência de ${target}`, rotated: `buscar ${target} em array rotacionado` };
  return {
    label: labels[variant],
    build() {
      const t = new Trace();
      let lo = 0;
      let hi = a.length - 1;
      let ans = -1;
      const view = (mid: number, tone: Tone): Panel[] => [
        { kind: "array", label: "array", values: a, tones: { ...tones([range(0, lo - 1), "muted"], [range(hi + 1, a.length - 1), "muted"]), [mid]: tone }, pointers: [{ index: lo, label: "lo", tone: "compare" }, { index: mid, label: "mid" }, { index: hi, label: "hi", tone: "compare" }] },
        { kind: "vars", entries: [{ name: "intervalo", value: `[${lo}..${hi}]` }, ...(variant === "first" ? [{ name: "resposta", value: ans, tone: "done" as Tone }] : [])] },
      ];
      while (lo <= hi) {
        const mid = lo + ((hi - lo) >> 1);
        if (variant === "classic") {
          if (a[mid] === target) {
            t.step(`a[${mid}] = ${target}: achou.`, view(mid, "done"), 2);
            return t.frames;
          }
          const goRight = a[mid] < target;
          t.step(`a[${mid}] = ${a[mid]} ${goRight ? "<" : ">"} ${target}: descarta a metade ${goRight ? "esquerda" : "direita"}.`, view(mid, "active"), goRight ? 3 : 4);
          if (goRight) lo = mid + 1;
          else hi = mid - 1;
        } else if (variant === "first") {
          if (a[mid] >= target) {
            if (a[mid] === target) ans = mid;
            t.step(a[mid] === target ? `a[${mid}] = ${target}: candidato, mas pode haver um antes — continua à esquerda.` : `a[${mid}] = ${a[mid]} > ${target}: vai para a esquerda.`, view(mid, a[mid] === target ? "done" : "active"), 6);
            hi = mid - 1;
          } else {
            t.step(`a[${mid}] = ${a[mid]} < ${target}: vai para a direita.`, view(mid, "active"), 6);
            lo = mid + 1;
          }
        } else {
          if (a[mid] === target) {
            t.step(`a[${mid}] = ${target}: achou.`, view(mid, "done"), 9);
            return t.frames;
          }
          const leftSorted = a[lo] <= a[mid];
          const inLeft = leftSorted ? a[lo] <= target && target < a[mid] : !(a[mid] < target && target <= a[hi]);
          t.step(`A metade ${leftSorted ? "esquerda" : "direita"} está ordenada; ${target} ${inLeft === leftSorted ? "está" : "não está"} nela → vai para a ${inLeft ? "esquerda" : "direita"}.`, view(mid, "active"), 10);
          if (inLeft) hi = mid - 1;
          else lo = mid + 1;
        }
      }
      t.step(variant === "first" ? (ans >= 0 ? `Primeira ocorrência em ${ans}. O(log n) mesmo com repetidos.` : "Não existe.") : `lo > hi: ${target} não está no array. log₂(${a.length}) ≈ ${Math.ceil(Math.log2(a.length))} passos no máximo.`, [{ kind: "array", label: "array", values: a, tones: ans >= 0 ? { [ans]: "done" } : {} }], variant === "first" ? 7 : 5);
      return t.frames;
    },
  };
}

export const binarySearchVariantes: VisualizerDef = {
  title: "Busca binária e variantes",
  summary: "Cada passo descarta metade do intervalo. As variantes mudam só o que fazer quando acha (continuar para achar a primeira ocorrência) ou como decidir o lado (array rotacionado).",
  code: ["lo = 0; hi = n - 1", "mid = lo + (hi - lo) / 2", "se a[mid] == alvo: achou", "se a[mid] < alvo: lo = mid + 1", "senão: hi = mid - 1", "lo > hi: não existe", "first: se a[mid] >= alvo: hi = mid - 1", "  (guarda mid se igual)", "", "rotated: se a[mid] == alvo: achou", "  descobre a metade ordenada e decide"],
  scenarios: [
    binarySearch([2, 5, 8, 12, 16, 23, 38, 56, 72, 91], 23, "classic"),
    binarySearch([1, 3, 3, 3, 3, 5, 7, 9], 3, "first"),
    binarySearch([15, 18, 22, 27, 2, 4, 7, 10, 12], 7, "rotated"),
    binarySearch([2, 5, 8, 12, 16, 23, 38, 56], 40, "classic"),
  ],
  random: () => {
    const a = [...new Set(randomArray(11, 1, 99))].sort((x, y) => x - y);
    return binarySearch(a, Math.random() < 0.7 ? a[randInt(0, a.length - 1)] : randInt(1, 99), "classic");
  },
};
