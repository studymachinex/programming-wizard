import { Trace, randInt, randomArray, range, tones } from "../core";
import type { GridPanel, Panel, Scenario, Tone, VisualizerDef } from "../types";

// ------------------------------------------------------------- two heaps

export const twoHeaps: VisualizerDef = {
  title: "Mediana de um stream com dois heaps",
  summary: "A metade menor fica num max-heap e a maior num min-heap, com tamanhos iguais ou o da esquerda com um a mais. A mediana está sempre nos topos: O(log n) por inserção, O(1) para consultar.",
  code: ["add(x): se x <= topo(baixa): baixa.offer(x)", "        senão: alta.offer(x)", "  rebalanceia: |baixa| - |alta| em {0, 1}", "mediana: topo(baixa) ou média dos topos"],
  scenarios: [
    {
      label: "stream 5, 15, 1, 3, 8, 7, 9, 10",
      build() {
        const t = new Trace();
        const low: number[] = []; // max-heap (guardado ordenado só para exibir)
        const high: number[] = []; // min-heap
        const view = (x: number, moved?: number): Panel[] => [
          { kind: "list", style: "queue", label: "baixa (max-heap) — o topo é o maior", items: [...low].sort((a, b) => b - a).map((v, i) => ({ label: String(v), tone: i === 0 ? "active" : v === x || v === moved ? "swap" : undefined })) },
          { kind: "list", style: "queue", label: "alta (min-heap) — o topo é o menor", items: [...high].sort((a, b) => a - b).map((v, i) => ({ label: String(v), tone: i === 0 ? "compare" : v === x || v === moved ? "swap" : undefined })) },
          { kind: "vars", entries: [{ name: "mediana", value: median(), tone: "done" }, { name: "tamanhos", value: `${low.length} | ${high.length}` }] },
        ];
        const median = () => (low.length > high.length ? Math.max(...low) : (Math.max(...low) + Math.min(...high)) / 2);
        for (const x of [5, 15, 1, 3, 8, 7, 9, 10]) {
          if (!low.length || x <= Math.max(...low)) low.push(x);
          else high.push(x);
          let moved: number | undefined;
          if (low.length > high.length + 1) {
            moved = Math.max(...low);
            low.splice(low.indexOf(moved), 1);
            high.push(moved);
          } else if (high.length > low.length) {
            moved = Math.min(...high);
            high.splice(high.indexOf(moved), 1);
            low.push(moved);
          }
          t.step(`Chega ${x}.${moved !== undefined ? ` Os tamanhos desequilibraram: ${moved} muda de lado.` : ""} Mediana = ${median()}.`, view(x, moved), moved !== undefined ? 2 : x <= Math.max(...low) ? 0 : 1);
        }
        return t.frames;
      },
    },
  ],
};

// ---------------------------------------------------------- merge intervals

function intervalGrid(label: string, intervals: [number, number][], max: number, toneOf: (i: number) => Tone): GridPanel {
  return {
    kind: "grid",
    label,
    colHeaders: range(0, max).map(String),
    rowHeaders: intervals.map(([a, b]) => `[${a},${b}]`),
    rows: intervals.map(() => range(0, max).map(() => "")),
    tones: intervals.flatMap(([a, b], r) => range(a, b).map((c) => ({ r, c, tone: toneOf(r) }))),
  };
}

function mergeScenario(input: [number, number][]): Scenario {
  return {
    label: input.map(([a, b]) => `[${a},${b}]`).join(" "),
    build() {
      const t = new Trace();
      const max = Math.max(...input.map((i) => i[1]));
      const sorted = [...input].sort((a, b) => a[0] - b[0]);
      t.step("Entrada fora de ordem: comparar cada par seria O(n²).", [intervalGrid("intervalos", input, max, () => "compare")], 0);
      t.step("Ordenando pelo início, intervalos que se sobrepõem ficam vizinhos. Basta uma passada.", [intervalGrid("ordenados", sorted, max, () => "compare")], 0);
      const out: [number, number][] = [];
      sorted.forEach(([a, b], i) => {
        const last = out[out.length - 1];
        if (last && a <= last[1]) {
          last[1] = Math.max(last[1], b);
          t.step(`[${a},${b}] começa antes do fim do último (${last[1]}): funde, fim = max(${last[1]}, ${b}).`, [intervalGrid("ordenados", sorted, max, (r) => (r === i ? "active" : r < i ? "muted" : "compare")), intervalGrid("resultado", out, max, (r) => (r === out.length - 1 ? "swap" : "done"))], 2);
        } else {
          out.push([a, b]);
          t.step(last ? `[${a},${b}] começa depois de ${last[1]}: não se sobrepõe, abre um novo intervalo.` : `Primeiro intervalo: [${a},${b}].`, [intervalGrid("ordenados", sorted, max, (r) => (r === i ? "active" : r < i ? "muted" : "compare")), intervalGrid("resultado", out, max, (r) => (r === out.length - 1 ? "active" : "done"))], 3);
        }
      });
      t.step(`${input.length} intervalos viraram ${out.length}. O(n log n) pela ordenação.`, [intervalGrid("resultado", out, max, () => "done")], 4);
      return t.frames;
    },
  };
}

export const mergeIntervals: VisualizerDef = {
  title: "Merge intervals: ordenar para simplificar",
  summary: "Depois de ordenar pelo início, cada intervalo só pode se fundir com o último do resultado. Cada linha da grade é um intervalo desenhado na reta numérica.",
  code: ["ordena por início", "para [a, b] em ordem:", "  se a <= fim do último: último.fim = max(último.fim, b)", "  senão: resultado.add([a, b])", "return resultado"],
  scenarios: [mergeScenario([[8, 10], [1, 3], [15, 18], [2, 6], [9, 12]]), mergeScenario([[1, 4], [4, 5], [6, 7]])],
  random: () => {
    const ivs: [number, number][] = Array.from({ length: 5 }, () => {
      const a = randInt(0, 15);
      return [a, a + randInt(0, 4)];
    });
    return mergeScenario(ivs);
  },
};

// ------------------------------------------------------------- backtracking

function queens(n: number): Scenario {
  return {
    label: `${n} rainhas`,
    build() {
      const t = new Trace();
      const cols: number[] = [];
      let tries = 0;
      const board = (row: number, col: number, tone: Tone): Panel => ({
        kind: "grid",
        label: "tabuleiro",
        colHeaders: range(0, n - 1).map(String),
        rowHeaders: range(0, n - 1).map(String),
        rows: range(0, n - 1).map((r) => range(0, n - 1).map((c) => (cols[r] === c ? "♛" : r === row && c === col ? "?" : ""))),
        tones: [...cols.map((c, r) => ({ r, c, tone: "done" as Tone })), ...(row < n ? [{ r: row, c: col, tone }] : [])],
      });
      const safe = (r: number, c: number) => cols.every((cc, rr) => cc !== c && Math.abs(cc - c) !== Math.abs(rr - r));
      let solved = false;
      const place = (r: number) => {
        if (r === n) {
          solved = true;
          t.step(`Todas as ${n} rainhas posicionadas após ${tries} tentativas: solução encontrada.`, [board(n, 0, "done")], 4);
          return;
        }
        for (let c = 0; c < n && !solved; c++) {
          tries++;
          if (!safe(r, c)) {
            t.step(`Linha ${r}, coluna ${c}: atacada por uma rainha anterior (coluna ou diagonal). Poda.`, [board(r, c, "bad")], 2);
            continue;
          }
          cols.push(c);
          t.step(`Linha ${r}, coluna ${c}: segura. Escolhe e desce para a linha ${r + 1}.`, [board(r + 1, 0, "muted")], 3);
          place(r + 1);
          if (solved) return;
          cols.pop();
          t.step(`Nada funcionou abaixo: desfaz a rainha da linha ${r} (backtrack) e tenta a próxima coluna.`, [board(r, c, "swap")], 5);
        }
      };
      place(0);
      return t.frames;
    },
  };
}

export const backtracking: VisualizerDef = {
  title: "Backtracking: N-Queens",
  summary: "O template escolher → explorar → desfazer em ação. Posições atacadas são podadas antes de descer; quando uma linha não tem saída, a última escolha é desfeita.",
  code: ["place(linha):", "  para cada coluna:", "    se atacada: poda (continue)", "    escolhe: põe a rainha", "    place(linha + 1)  // completa → solução", "    desfaz: tira a rainha"],
  scenarios: [queens(4), queens(5)],
};

// ------------------------------------------------------------------ greedy

function jumpGame(nums: number[]): Scenario {
  return {
    label: `jump game [${nums.join(",")}]`,
    build() {
      const t = new Trace();
      let reach = 0;
      for (let i = 0; i < nums.length; i++) {
        if (i > reach) {
          t.step(`Índice ${i} está além do alcance ${reach}: impossível chegar ao fim.`, [{ kind: "array", label: "nums (salto máximo)", values: nums, tones: { ...tones([range(0, reach), "done"]), [i]: "bad" } }, { kind: "vars", entries: [{ name: "alcance", value: reach, tone: "bad" }] }], 2);
          return t.frames;
        }
        const before = reach;
        reach = Math.max(reach, i + nums[i]);
        t.step(`Em ${i}, dá para saltar até ${i + nums[i]}. Alcance = max(${before}, ${i + nums[i]}) = ${reach}.`, [{ kind: "array", label: "nums (salto máximo)", values: nums, tones: { ...tones([range(0, Math.min(reach, nums.length - 1)), "done"]), [i]: "active" }, ranges: [{ from: i, to: Math.min(reach, nums.length - 1), tone: "compare", label: "alcançável" }] }, { kind: "vars", entries: [{ name: "alcance", value: reach, tone: "done" }] }], 3);
        if (reach >= nums.length - 1) {
          t.step("O alcance cobre o último índice: dá para chegar. Greedy O(n): guardar só o alcance máximo basta.", [{ kind: "array", label: "nums", values: nums, tones: tones([range(0, nums.length - 1), "done"]) }], 4);
          return t.frames;
        }
      }
      return t.frames;
    },
  };
}

export const greedyProva: VisualizerDef = {
  title: "Greedy: Jump Game e Gas Station",
  summary: "Greedy funciona quando uma escolha local nunca piora o futuro. No Jump Game basta o alcance máximo; no Gas Station, um saldo negativo prova que nenhum ponto anterior serve de partida.",
  code: ["jump: alcance = 0", "para i:", "  se i > alcance: impossível", "  alcance = max(alcance, i + nums[i])", "  se alcance >= n-1: possível", "", "gas: saldo += gas[i] - cost[i]", "  se saldo < 0: início = i + 1; saldo = 0"],
  scenarios: [
    jumpGame([2, 3, 1, 1, 4]),
    jumpGame([3, 2, 1, 0, 4]),
    {
      label: "gas station",
      build() {
        const t = new Trace();
        const gas = [1, 2, 3, 4, 5];
        const cost = [3, 4, 5, 1, 2];
        let tank = 0;
        let total = 0;
        let start = 0;
        for (let i = 0; i < gas.length; i++) {
          tank += gas[i] - cost[i];
          total += gas[i] - cost[i];
          const neg = tank < 0;
          t.step(neg ? `Posto ${i}: saldo ${tank} < 0. Nenhum início entre ${start} e ${i} funciona — novo início em ${i + 1}.` : `Posto ${i}: +${gas[i]} −${cost[i]} → saldo ${tank}.`, [
            { kind: "grid", label: "postos", colHeaders: gas.map((_, k) => String(k)), rowHeaders: ["gas", "cost", "gas−cost"], rows: [gas, cost, gas.map((g, k) => g - cost[k])], tones: [{ r: 2, c: i, tone: neg ? "bad" : "active" }, ...range(start, i).map((c) => ({ r: 0, c, tone: "compare" as Tone }))] },
            { kind: "vars", entries: [{ name: "início", value: neg ? i + 1 : start, tone: "done" }, { name: "saldo", value: tank, tone: neg ? "bad" : "default" }, { name: "total", value: total }] },
          ], neg ? 7 : 6);
          if (neg) {
            start = i + 1;
            tank = 0;
          }
        }
        t.step(total >= 0 ? `Total ${total} ≥ 0: a volta é possível começando no posto ${start}. Uma passada, O(n).` : "Total negativo: nenhum início completa a volta.", [{ kind: "vars", entries: [{ name: "resposta", value: total >= 0 ? start : -1, tone: "done" }] }], 7);
        return t.frames;
      },
    },
  ],
  random: () => jumpGame(randomArray(7, 0, 3)),
};
