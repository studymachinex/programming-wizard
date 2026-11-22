import { Trace, fmt, randInt, randomArray, range, tones } from "../core";
import type { GridPanel, Panel, Scenario, Tone, TreeNode, VisualizerDef } from "../types";

// ------------------------------------------------------------------ DP 1D

function coinChange(coins: number[], amount: number): Scenario {
  return {
    label: `coin change: moedas ${coins.join(",")} para ${amount}`,
    build() {
      const t = new Trace();
      const dp = Array(amount + 1).fill(Infinity);
      dp[0] = 0;
      const view = (i: number, from?: number, tone: Tone = "active"): Panel[] => [
        { kind: "array", label: "dp[v] = menor nº de moedas para somar v", values: dp.map(fmt), tones: { ...tones([range(0, i - 1), "done"]), ...(from !== undefined ? { [from]: "compare" as Tone } : {}), [i]: tone } },
        { kind: "vars", entries: [{ name: "moedas", value: coins.join(", ") }] },
      ];
      t.step("dp[0] = 0 (troco zero não precisa de moeda); o resto começa em ∞.", view(0), 0);
      for (let v = 1; v <= amount; v++) {
        for (const c of coins) {
          if (c > v || dp[v - c] === Infinity) continue;
          const cand = dp[v - c] + 1;
          const better = cand < dp[v];
          if (better) dp[v] = cand;
          t.step(`v = ${v}, moeda ${c}: dp[${v - c}] + 1 = ${cand}${better ? ` melhora dp[${v}]` : " não melhora"}.`, view(v, v - c, better ? "active" : "muted"), 2);
        }
      }
      t.step(dp[amount] === Infinity ? `Impossível formar ${amount}.` : `dp[${amount}] = ${dp[amount]} moedas. O(amount × moedas).`, view(amount, undefined, "done"), 3);
      return t.frames;
    },
  };
}

function houseRobber(nums: number[]): Scenario {
  return {
    label: `house robber [${nums.join(",")}]`,
    build() {
      const t = new Trace();
      const dp: (number | null)[] = nums.map(() => null);
      for (let i = 0; i < nums.length; i++) {
        const skip = i > 0 ? dp[i - 1]! : 0;
        const take = nums[i] + (i > 1 ? dp[i - 2]! : 0);
        dp[i] = Math.max(skip, take);
        t.step(`Casa ${i}: pular = dp[${i - 1}] = ${skip}; roubar = ${nums[i]} + dp[${i - 2}] = ${take}. dp[${i}] = ${dp[i]}.`, [
          { kind: "array", label: "valor de cada casa", values: nums, tones: { [i]: take >= skip ? "active" : "muted" } },
          { kind: "array", label: "dp[i] = melhor até a casa i", values: dp, tones: { [i]: "done", ...(i > 0 ? { [i - 1]: "compare" as Tone } : {}), ...(i > 1 ? { [i - 2]: "swap" as Tone } : {}) } },
        ], 5);
      }
      t.step(`Resposta dp[${nums.length - 1}] = ${dp[nums.length - 1]}. Só os dois últimos valores importam: dá para usar O(1) de memória.`, [{ kind: "array", label: "dp", values: dp, tones: { [nums.length - 1]: "done" } }], 5);
      return t.frames;
    },
  };
}

export const dp1d: VisualizerDef = {
  title: "DP 1D: coin change e house robber",
  summary: "A tabela cresce da esquerda para a direita e cada célula só depende de células já calculadas. Coin change olha para trás em v − moeda; house robber decide entre pular e roubar.",
  code: ["dp[0] = 0; resto = ∞", "para v de 1 a amount:", "  para moeda: dp[v] = min(dp[v], dp[v-moeda] + 1)", "return dp[amount]", "", "robber: dp[i] = max(dp[i-1], nums[i] + dp[i-2])"],
  scenarios: [coinChange([1, 3, 4], 6), houseRobber([2, 7, 9, 3, 1, 5])],
  random: () => (Math.random() < 0.5 ? houseRobber(randomArray(7, 1, 20)) : coinChange([1, randInt(2, 4), randInt(5, 7)], randInt(7, 11))),
};

// ------------------------------------------------------------------ DP 2D

function editDistance(a: string, b: string): Scenario {
  return {
    label: `edit distance "${a}" → "${b}"`,
    build() {
      const t = new Trace();
      const dp: (number | null)[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(null));
      for (let i = 0; i <= a.length; i++) dp[i][0] = i;
      for (let j = 0; j <= b.length; j++) dp[0][j] = j;
      const grid = (i: number, j: number, deps: [number, number][]): GridPanel => ({
        kind: "grid",
        label: "dp[i][j] = edições para transformar a[0..i) em b[0..j)",
        colHeaders: ["∅", ...b],
        rowHeaders: ["∅", ...a],
        rows: dp,
        tones: [...deps.map(([r, c]) => ({ r, c, tone: "compare" as Tone })), { r: i, c: j, tone: "active" }],
      });
      t.step("Bordas: transformar em/de string vazia custa o tamanho da outra (só inserções ou remoções).", [grid(0, 0, [])], 0);
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          if (a[i - 1] === b[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1];
            t.step(`'${a[i - 1]}' = '${b[j - 1]}': copia a diagonal (${dp[i][j]}), sem custo.`, [grid(i, j, [[i - 1, j - 1]])], 2);
          } else {
            dp[i][j] = 1 + Math.min(dp[i - 1][j]!, dp[i][j - 1]!, dp[i - 1][j - 1]!);
            t.step(`'${a[i - 1]}' ≠ '${b[j - 1]}': 1 + min(remover ${dp[i - 1][j]}, inserir ${dp[i][j - 1]}, trocar ${dp[i - 1][j - 1]}) = ${dp[i][j]}.`, [grid(i, j, [[i - 1, j], [i, j - 1], [i - 1, j - 1]])], 3);
          }
        }
      }
      t.step(`Resposta no canto: ${dp[a.length][b.length]} edições. O(n·m).`, [{ ...grid(a.length, b.length, []), tones: [{ r: a.length, c: b.length, tone: "done" }] }], 4);
      return t.frames;
    },
  };
}

function knapsack(weights: number[], values: number[], cap: number): Scenario {
  return {
    label: `mochila 0/1 (capacidade ${cap})`,
    build() {
      const t = new Trace();
      const n = weights.length;
      const dp: (number | null)[][] = Array.from({ length: n + 1 }, (_, i) => Array(cap + 1).fill(i === 0 ? 0 : null));
      const grid = (i: number, w: number, deps: [number, number][]): GridPanel => ({
        kind: "grid",
        label: "dp[i][w] = melhor valor com os i primeiros itens e capacidade w",
        colHeaders: range(0, cap).map(String),
        rowHeaders: ["—", ...weights.map((wt, k) => `p${wt} v${values[k]}`)],
        rows: dp,
        tones: [...deps.map(([r, c]) => ({ r, c, tone: "compare" as Tone })), { r: i, c: w, tone: "active" }],
      });
      for (let i = 1; i <= n; i++) {
        for (let w = 0; w <= cap; w++) {
          const skip = dp[i - 1][w]!;
          if (weights[i - 1] > w) {
            dp[i][w] = skip;
            if (w === weights[i - 1] - 1 || w === 0) t.step(`Item ${i} (peso ${weights[i - 1]}) não cabe em w = ${w}: copia a linha de cima.`, [grid(i, w, [[i - 1, w]])], 1);
            continue;
          }
          const take = values[i - 1] + dp[i - 1][w - weights[i - 1]]!;
          dp[i][w] = Math.max(skip, take);
          t.step(`Item ${i}, w = ${w}: deixar = ${skip}; levar = ${values[i - 1]} + dp[${i - 1}][${w - weights[i - 1]}] = ${take}. Fica ${dp[i][w]}.`, [grid(i, w, [[i - 1, w], [i - 1, w - weights[i - 1]]])], 2);
        }
      }
      t.step(`Melhor valor: ${dp[n][cap]}. O(n × capacidade) — pseudo-polinomial.`, [{ ...grid(n, cap, []), tones: [{ r: n, c: cap, tone: "done" }] }], 3);
      return t.frames;
    },
  };
}

export const dp2dKnapsack: VisualizerDef = {
  title: "DP 2D: edit distance e mochila 0/1",
  summary: "Tabelas que contam uma história: cada célula combina vizinhas já calculadas (em azul). Leia a linha e a coluna para entender o que cada estado significa.",
  code: ["edit: bordas dp[i][0] = i, dp[0][j] = j", "mochila: item não cabe → dp[i][w] = dp[i-1][w]", "letras iguais: dp[i][j] = dp[i-1][j-1]", "diferentes: 1 + min(cima, esquerda, diagonal)", "resposta no canto inferior direito"],
  scenarios: [editDistance("horse", "ros"), knapsack([1, 3, 4, 5], [1, 4, 5, 7], 7)],
};

// ------------------------------------------------------------------ LIS

function lisDp(nums: number[]): Scenario {
  return {
    label: `LIS O(n²) [${nums.join(",")}]`,
    build() {
      const t = new Trace();
      const dp = nums.map(() => 1);
      for (let i = 0; i < nums.length; i++) {
        for (let j = 0; j < i; j++) {
          if (nums[j] < nums[i] && dp[j] + 1 > dp[i]) {
            dp[i] = dp[j] + 1;
            t.step(`${nums[j]} < ${nums[i]}: estender a sequência que termina em ${j} dá ${dp[i]}.`, [{ kind: "array", label: "nums", values: nums, tones: { [j]: "compare", [i]: "active" } }, { kind: "array", label: "dp[i] = maior subsequência crescente terminando em i", values: [...dp], tones: { [i]: "active", [j]: "compare" } }], 1);
          }
        }
        t.step(`dp[${i}] = ${dp[i]}.`, [{ kind: "array", label: "nums", values: nums, tones: { [i]: "done" } }, { kind: "array", label: "dp", values: [...dp], tones: { [i]: "done" } }], 1);
      }
      t.step(`LIS = max(dp) = ${Math.max(...dp)}. O(n²).`, [{ kind: "array", label: "dp", values: dp }], 2);
      return t.frames;
    },
  };
}

function lisTails(nums: number[]): Scenario {
  return {
    label: `LIS O(n log n) (tails)`,
    build() {
      const t = new Trace();
      const tails: number[] = [];
      nums.forEach((x, i) => {
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (tails[mid] < x) lo = mid + 1;
          else hi = mid;
        }
        const extend = lo === tails.length;
        tails[lo] = x;
        t.step(extend ? `${x} é maior que todos os finais: estende, tails cresce para ${tails.length}.` : `${x} substitui tails[${lo}]: uma sequência de tamanho ${lo + 1} agora termina num valor menor (mais fácil de estender).`, [
          { kind: "array", label: "nums", values: nums, tones: { ...tones([range(0, i - 1), "muted"]), [i]: "active" } },
          { kind: "array", label: "tails[k] = menor final de uma subsequência crescente de tamanho k+1", values: [...tails], tones: { [lo]: extend ? "done" : "swap" } },
        ], 3);
      });
      t.step(`Tamanho da LIS = tamanho de tails = ${tails.length}. Busca binária em cada passo: O(n log n).`, [{ kind: "array", label: "tails", values: tails, tones: tones([range(0, tails.length - 1), "done"]) }], 4);
      return t.frames;
    },
  };
}

const LIS = [10, 9, 2, 5, 3, 7, 101, 18];

export const lisIntervalosStocks: VisualizerDef = {
  title: "LIS: a DP quadrática e o truque dos tails",
  summary: "A mesma pergunta resolvida duas vezes. A DP O(n²) olha todos os anteriores; a versão O(n log n) mantém o menor final possível para cada tamanho e usa busca binária.",
  code: ["dp[i] = 1", "para j < i: se nums[j] < nums[i]: dp[i] = max(dp[i], dp[j]+1)", "return max(dp)", "tails: lower_bound(tails, x) → substitui ou estende", "return tails.size"],
  scenarios: [lisDp(LIS), lisTails(LIS)],
  random: () => lisTails(randomArray(9, 1, 50)),
};

// --------------------------------------------------------- tree DP e bitmask

type BT = { v: number; l?: BT; r?: BT; id: string };
const TREE: BT = { id: "a", v: -10, l: { id: "b", v: 9 }, r: { id: "c", v: 20, l: { id: "d", v: 15 }, r: { id: "e", v: 7 } } };

export const treeDpBitmask: VisualizerDef = {
  title: "Tree DP (maior soma de caminho) e bitmask DP",
  summary: "Na árvore, cada nó devolve ao pai o melhor ganho de um ramo e atualiza a resposta global com os dois ramos. No bitmask, um inteiro guarda quais itens já foram usados.",
  code: ["gain(n): se null → 0", "  esq = max(0, gain(n.esq)); dir = max(0, gain(n.dir))", "  melhor = max(melhor, n.v + esq + dir)", "  return n.v + max(esq, dir)", "", "bitmask: mask tem bit i = item i usado"],
  scenarios: [
    {
      label: "maior soma de caminho",
      build() {
        const t = new Trace();
        const gains = new Map<string, number>();
        let best = -Infinity;
        let current = "";
        const view = (): TreeNode => {
          const conv = (n?: BT): TreeNode | null =>
            n ? { id: n.id, label: String(n.v), tone: n.id === current ? "active" : gains.has(n.id) ? "done" : undefined, badge: gains.has(n.id) ? `g=${gains.get(n.id)}` : undefined, children: n.l || n.r ? [conv(n.l), conv(n.r)] : [] } : null;
          return conv(TREE)!;
        };
        const gain = (n?: BT): number => {
          if (!n) return 0;
          const l = Math.max(0, gain(n.l));
          const r = Math.max(0, gain(n.r));
          current = n.id;
          const through = n.v + l + r;
          best = Math.max(best, through);
          const g = n.v + Math.max(l, r);
          gains.set(n.id, g);
          t.step(`Nó ${n.v}: ramos ${l} e ${r}. Caminho passando por ele = ${through}; devolve ao pai ${g}.`, [{ kind: "tree", binary: true, root: view() }, { kind: "vars", entries: [{ name: "melhor", value: fmt(best), tone: "done" }] }], 2);
          return g;
        };
        gain(TREE);
        current = "";
        t.step(`Resposta: ${best} (o caminho 15 → 20 → 7). Uma DFS pós-ordem: O(n).`, [{ kind: "tree", binary: true, root: view() }, { kind: "vars", entries: [{ name: "melhor", value: best, tone: "done" }] }], 3);
        return t.frames;
      },
    },
    {
      label: "bitmask: dividir em 2 grupos de soma igual",
      build() {
        const t = new Trace();
        const nums = [3, 1, 4, 2, 2];
        const target = nums.reduce((a, b) => a + b, 0) / 2;
        const bits = (mask: number) => nums.map((_, i) => ((mask >> i) & 1 ? 1 : 0));
        let found = false;
        const dfs = (mask: number, sum: number) => {
          if (found) return;
          t.step(`mask = ${mask.toString(2).padStart(nums.length, "0")} → soma ${sum} de ${target}.`, [
            { kind: "array", label: "nums", values: nums, tones: tones([nums.map((_, i) => i).filter((i) => (mask >> i) & 1), "active"]) },
            { kind: "array", label: "mask (bit i = item i no grupo)", values: bits(mask), tones: tones([nums.map((_, i) => i).filter((i) => (mask >> i) & 1), "active"]) },
            { kind: "vars", entries: [{ name: "mask", value: mask }, { name: "soma", value: sum, tone: sum === target ? "done" : "default" }] },
          ], 5);
          if (sum === target) {
            found = true;
            return;
          }
          for (let i = 0; i < nums.length && !found; i++) {
            if ((mask >> i) & 1 || sum + nums[i] > target) continue;
            dfs(mask | (1 << i), sum + nums[i]);
          }
        };
        dfs(0, 0);
        t.step(`Achou um grupo com soma ${target}; o resto forma o outro. Com memo[mask], cada estado é visitado uma vez: O(2ⁿ · n).`, [{ kind: "vars", entries: [{ name: "resultado", value: found ? "possível" : "impossível", tone: "done" }] }], 5);
        return t.frames;
      },
    },
  ],
};
