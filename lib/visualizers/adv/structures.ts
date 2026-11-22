import { Trace, range, tones } from "../core";
import type { Panel, Tone, TreeNode, VisualizerDef } from "../types";

// --------------------------------------------------------- segment tree lazy

export const segmentTreeLazy: VisualizerDef = {
  title: "Segment tree com lazy propagation",
  summary: "Cada nó guarda a soma do seu intervalo. Uma atualização de intervalo para nos nós totalmente cobertos e deixa um \"lazy\" pendente (no canto); ele só desce quando uma operação precisar entrar ali.",
  code: ["update(nó, [l, r], [a, b], δ):", "  sem interseção: return", "  coberto: soma += δ·tamanho; lazy += δ; return", "  push(nó): repassa lazy aos filhos", "  desce nos dois filhos; soma = esq + dir", "query: mesma descida, somando nós cobertos"],
  scenarios: [
    {
      label: "add(1, 5, +3) e sum(2, 6)",
      build() {
        const t = new Trace();
        const a = [5, 2, 7, 1, 4, 6, 3, 8];
        const n = a.length;
        const sum = Array(4 * n).fill(0);
        const lazy = Array(4 * n).fill(0);
        const build = (node: number, l: number, r: number) => {
          if (l === r) {
            sum[node] = a[l];
            return;
          }
          const m = (l + r) >> 1;
          build(2 * node, l, m);
          build(2 * node + 1, m + 1, r);
          sum[node] = sum[2 * node] + sum[2 * node + 1];
        };
        build(1, 0, n - 1);
        const view = (marks: Record<number, Tone>, highlight?: [number, number]): Panel[] => {
          const conv = (node: number, l: number, r: number): TreeNode => {
            const m = (l + r) >> 1;
            return { id: `s${node}`, label: String(sum[node]), tone: marks[node], badge: lazy[node] ? `+${lazy[node]}` : l === r ? `[${l}]` : `${l}-${r}`, children: l === r ? [] : [conv(2 * node, l, m), conv(2 * node + 1, m + 1, r)] };
          };
          return [{ kind: "tree", binary: true, label: "soma do intervalo (canto: intervalo ou lazy pendente)", root: conv(1, 0, n - 1) }, { kind: "array", label: "array original", values: a, ranges: highlight ? [{ from: highlight[0], to: highlight[1], tone: "active" }] : [] }];
        };
        t.step("Árvore construída: cada nó soma o intervalo dos filhos.", view({}), 4);
        const push = (node: number, l: number, r: number) => {
          if (!lazy[node] || l === r) return;
          const m = (l + r) >> 1;
          for (const [child, cl, cr] of [[2 * node, l, m], [2 * node + 1, m + 1, r]]) {
            sum[child] += lazy[node] * (cr - cl + 1);
            lazy[child] += lazy[node];
          }
          t.step(`push: o nó [${l}-${r}] repassa +${lazy[node]} aos filhos antes de descer.`, view({ [node]: "swap", [2 * node]: "swap", [2 * node + 1]: "swap" }), 3);
          lazy[node] = 0;
        };
        const update = (node: number, l: number, r: number, qa: number, qb: number, d: number) => {
          if (qb < l || r < qa) return;
          if (qa <= l && r <= qb) {
            sum[node] += d * (r - l + 1);
            lazy[node] += d;
            t.step(`[${l}-${r}] está inteiro dentro de [${qa}-${qb}]: soma += ${d}×${r - l + 1}, guarda lazy +${d} e não desce.`, view({ [node]: "active" }, [qa, qb]), 2);
            return;
          }
          push(node, l, r);
          const m = (l + r) >> 1;
          update(2 * node, l, m, qa, qb, d);
          update(2 * node + 1, m + 1, r, qa, qb, d);
          sum[node] = sum[2 * node] + sum[2 * node + 1];
          t.step(`Volta em [${l}-${r}]: soma = ${sum[2 * node]} + ${sum[2 * node + 1]} = ${sum[node]}.`, view({ [node]: "compare" }, [qa, qb]), 4);
        };
        update(1, 0, n - 1, 1, 5, 3);
        let acc = 0;
        const query = (node: number, l: number, r: number, qa: number, qb: number) => {
          if (qb < l || r < qa) return;
          if (qa <= l && r <= qb) {
            acc += sum[node];
            t.step(`sum: [${l}-${r}] coberto por [${qa}-${qb}], soma ${sum[node]} entra no total (${acc}).`, view({ [node]: "done" }, [qa, qb]), 5);
            return;
          }
          push(node, l, r);
          const m = (l + r) >> 1;
          query(2 * node, l, m, qa, qb);
          query(2 * node + 1, m + 1, r, qa, qb);
        };
        query(1, 0, n - 1, 2, 6);
        const real = a.slice(2, 7).reduce((x, y, i) => x + y + (i + 2 <= 5 ? 3 : 0), 0);
        t.step(`sum(2, 6) = ${acc} (conferindo no array: ${real}). Atualização e consulta em O(log n).`, view({}, [2, 6]), 5);
        return t.frames;
      },
    },
  ],
};

// ---------------------------------------------------- Fenwick e sparse table

export const fenwickSparse: VisualizerDef = {
  title: "Fenwick tree e sparse table",
  summary: "Na Fenwick, tree[i] cobre i & −i posições: update sobe somando o bit mais baixo e a consulta de prefixo desce tirando-o. A sparse table pré-calcula mínimos em janelas de tamanho 2ᵏ e responde em O(1).",
  code: ["add(i, δ): enquanto i <= n: tree[i] += δ; i += i & -i", "prefix(i): enquanto i > 0: soma += tree[i]; i -= i & -i", "", "sparse[k][i] = min(sparse[k-1][i], sparse[k-1][i + 2^(k-1)])", "min(l, r): k = log2(r-l+1)", "  = min(sparse[k][l], sparse[k][r - 2^k + 1])"],
  scenarios: [
    {
      label: "Fenwick: add e prefix",
      build() {
        const t = new Trace();
        const n = 8;
        const tree = Array(n + 1).fill(0);
        const view = (marks: Record<number, Tone>): Panel[] => [
          { kind: "array", label: "tree (1-based) — tree[i] cobre i & −i posições", values: tree.slice(1), indexBase: 1, tones: Object.fromEntries(Object.entries(marks).map(([k, v]) => [Number(k) - 1, v])) },
          { kind: "vars", entries: range(1, n).map((i) => ({ name: `tree[${i}]`, value: `soma de [${i - (i & -i) + 1}..${i}]` })) },
        ];
        for (const [pos, d] of [[3, 5], [6, 2], [1, 4]] as const) {
          let i = pos;
          const visited: number[] = [];
          while (i <= n) {
            tree[i] += d;
            visited.push(i);
            t.step(`add(${pos}, ${d}): tree[${i}] += ${d}; próximo i = ${i} + (${i} & −${i}) = ${i + (i & -i)}.`, view(Object.fromEntries(visited.map((v) => [v, v === i ? "active" : "compare"]))), 0);
            i += i & -i;
          }
        }
        let i = 7;
        let s = 0;
        const used: number[] = [];
        while (i > 0) {
          s += tree[i];
          used.push(i);
          t.step(`prefix(7): soma += tree[${i}] = ${tree[i]} (total ${s}); i = ${i} − (${i} & −${i}) = ${i - (i & -i)}.`, view(Object.fromEntries(used.map((v) => [v, v === i ? "active" : "done"]))), 1);
          i -= i & -i;
        }
        t.step(`prefix(7) = ${s} visitando só ${used.length} posições (os bits de 7 = 111). O(log n).`, view(Object.fromEntries(used.map((v) => [v, "done"]))), 1);
        return t.frames;
      },
    },
    {
      label: "sparse table: mínimo em intervalo",
      build() {
        const t = new Trace();
        const a = [6, 2, 8, 4, 9, 1, 7, 3];
        const n = a.length;
        const table: (number | null)[][] = [a.slice()];
        const grid = (marks: { r: number; c: number; tone: Tone }[]): Panel => ({ kind: "grid", label: "sparse[k][i] = mín de a[i .. i + 2^k − 1]", colHeaders: a.map((_, i) => String(i)), rowHeaders: table.map((_, k) => `2^${k}`), rows: table.map((row) => [...row, ...Array(n - row.length).fill(null)]), tones: marks });
        t.step("Linha k = 0 é o próprio array (janelas de tamanho 1).", [grid([])], 3);
        for (let k = 1; 1 << k <= n; k++) {
          const row: number[] = [];
          for (let i = 0; i + (1 << k) <= n; i++) row.push(Math.min(table[k - 1][i]!, table[k - 1][i + (1 << (k - 1))]!));
          table.push(row);
          t.step(`Linha k = ${k}: cada janela de ${1 << k} é o mínimo de duas janelas de ${1 << (k - 1)} da linha anterior.`, [grid(row.map((_, c) => ({ r: k, c, tone: "active" as Tone })))], 3);
        }
        const [l, r] = [1, 6];
        const k = Math.floor(Math.log2(r - l + 1));
        const right = r - (1 << k) + 1;
        const ans = Math.min(table[k][l]!, table[k][right]!);
        t.step(`min(${l}, ${r}): tamanho ${r - l + 1} → k = ${k}. Duas janelas de ${1 << k} que se sobrepõem cobrem o intervalo: min(${table[k][l]}, ${table[k][right]}) = ${ans}. O(1).`, [grid([{ r: k, c: l, tone: "compare" }, { r: k, c: right, tone: "compare" }]), { kind: "array", label: "a", values: a, ranges: [{ from: l, to: l + (1 << k) - 1, tone: "compare" }, { from: right, to: r, tone: "swap" }], tones: { [a.indexOf(ans)]: "done" } }], 5);
        return t.frames;
      },
    },
  ],
};

// --------------------------------------------------- bloom filter e skip list

const bloomHashes = (word: string, m: number) => {
  let h1 = 0;
  let h2 = 7;
  for (const c of word) {
    h1 = (h1 * 31 + c.charCodeAt(0)) % 9973;
    h2 = (h2 * 17 + c.charCodeAt(0)) % 9967;
  }
  return [h1 % m, h2 % m, (h1 + 2 * h2) % m];
};

export const lruLfuSkipBloom: VisualizerDef = {
  title: "Bloom filter e skip list",
  summary: "O Bloom filter responde \"com certeza não está\" ou \"talvez esteja\" usando só bits; falsos positivos acontecem quando outros itens ligaram os mesmos bits. A skip list busca descendo de níveis esparsos para densos, como uma busca binária em lista ligada.",
  code: ["bloom.add(x): liga os bits h1(x), h2(x), h3(x)", "bloom.contains(x): todos ligados → talvez; algum 0 → não", "", "skip list: começa no nível mais alto", "  avança enquanto o próximo < alvo; senão desce um nível"],
  scenarios: [
    {
      label: "Bloom filter (16 bits, 3 hashes)",
      build() {
        const t = new Trace();
        const m = 16;
        const bits = Array(m).fill(0);
        for (const w of ["java", "kafka", "redis"]) {
          const hs = bloomHashes(w, m);
          hs.forEach((h) => (bits[h] = 1));
          t.step(`add("${w}"): liga os bits ${hs.join(", ")}.`, [{ kind: "array", label: "bits", values: [...bits], tones: tones([hs, "active"]) }], 0);
        }
        for (const w of ["kafka", "mongo", "scala"]) {
          const hs = bloomHashes(w, m);
          const all = hs.every((h) => bits[h]);
          const really = ["java", "kafka", "redis"].includes(w);
          t.step(all ? (really ? `contains("${w}"): bits ${hs.join(", ")} ligados → talvez (e está mesmo).` : `contains("${w}"): bits ${hs.join(", ")} ligados por outros itens → "talvez", mas é um FALSO POSITIVO.`) : `contains("${w}"): algum bit está 0 → com certeza não está.`, [{ kind: "array", label: "bits", values: [...bits], tones: Object.fromEntries(hs.map((h) => [h, bits[h] ? (really ? "done" : "swap") : "bad"])) }], 1);
        }
        return t.frames;
      },
    },
    {
      label: "skip list: buscar 19",
      build() {
        const t = new Trace();
        const values = [3, 6, 7, 9, 12, 17, 19, 21, 25, 26];
        const levels = [[3, 12, 21], [3, 7, 12, 17, 21, 26], values];
        const view = (level: number, at: number | null, tone: Tone = "active"): Panel => ({
          kind: "grid",
          label: "níveis (0 = mais esparso)",
          colHeaders: values.map(String),
          rowHeaders: levels.map((_, i) => `nível ${i}`),
          rows: levels.map((lv) => values.map((v) => (lv.includes(v) ? v : null))),
          tones: [...levels.flatMap((lv, r) => lv.map((v) => ({ r, c: values.indexOf(v), tone: "default" as Tone }))), ...(at !== null ? [{ r: level, c: values.indexOf(at), tone }] : [])],
        });
        const target = 19;
        let cur: number | null = null;
        for (let lv = 0; lv < levels.length; lv++) {
          const row = levels[lv];
          let idx: number = cur === null ? -1 : row.indexOf(cur);
          while (idx + 1 < row.length && row[idx + 1] <= target) {
            idx++;
            cur = row[idx];
            t.step(`Nível ${lv}: avança para ${cur} (≤ ${target}).`, [view(lv, cur, cur === target ? "done" : "active")], 4);
            if (cur === target) {
              t.step(`Achou ${target} tocando poucos nós: O(log n) esperado, sem precisar de árvore balanceada.`, [view(lv, cur, "done")], 4);
              return t.frames;
            }
          }
          t.step(`Nível ${lv}: o próximo passaria de ${target}. Desce um nível.`, [view(lv, cur, "compare")], 4);
        }
        return t.frames;
      },
    },
  ],
};
