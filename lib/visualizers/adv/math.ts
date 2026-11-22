import { Trace, randInt, range, tones } from "../core";
import type { GridPanel, Panel, Scenario, Tone, VisualizerDef } from "../types";

// ---------------------------------------------------------------- crivo e MDC

function sieveGrid(n: number, composite: boolean[], marks: Record<number, Tone>): Panel {
  const cols = 10;
  const rows: (number | null)[][] = [];
  for (let start = 0; start <= n; start += cols) rows.push(range(start, start + cols - 1).map((v) => (v <= n ? v : null)));
  const toneOf = (v: number): Tone | undefined => marks[v] ?? (v < 2 ? "muted" : composite[v] ? "muted" : undefined);
  return {
    kind: "grid",
    label: `números de 0 a ${n}`,
    rows,
    tones: rows.flatMap((row, r) => row.map((v, c) => (v === null ? null : toneOf(v) ? { r, c, tone: toneOf(v)! } : null)).filter((x): x is { r: number; c: number; tone: Tone } => x !== null)),
  };
}

function gcdScenario(a: number, b: number): Scenario {
  return {
    label: `mdc(${a}, ${b})`,
    build() {
      const t = new Trace();
      const rows: (number | string)[][] = [];
      let x = a;
      let y = b;
      while (y !== 0) {
        rows.push([x, y, x % y]);
        t.step(`mdc(${x}, ${y}) = mdc(${y}, ${x} % ${y} = ${x % y}).`, [{ kind: "grid", label: "Euclides", colHeaders: ["a", "b", "a % b"], rows, tones: [{ r: rows.length - 1, c: 2, tone: "active" }] }], 5);
        [x, y] = [y, x % y];
      }
      t.step(`Resto 0: mdc = ${x}. mmc = ${a} / ${x} × ${b} = ${(a / x) * b} (dividindo antes de multiplicar). O(log min(a, b)).`, [{ kind: "grid", label: "Euclides", colHeaders: ["a", "b", "a % b"], rows: [...rows, [x, 0, "—"]], tones: [{ r: rows.length, c: 0, tone: "done" }] }], 6);
      return t.frames;
    },
  };
}

export const primosMdcCrivo: VisualizerDef = {
  title: "Crivo de Eratóstenes e algoritmo de Euclides",
  summary: "No crivo, cada primo risca seus múltiplos a partir de p·p — os menores já foram riscados por primos menores — e o laço para em p·p > n. Em Euclides, o resto encolhe rápido até zerar.",
  code: ["para p de 2 enquanto p·p <= n:", "  se p não riscado:", "    para m de p·p até n, passo p: risca m", "sobram os primos", "", "mdc(a, b): enquanto b != 0: (a, b) = (b, a % b)", "return a"],
  scenarios: [
    {
      label: "crivo até 50",
      build() {
        const t = new Trace();
        const n = 50;
        const composite = Array(n + 1).fill(false);
        t.step("Todos começam como candidatos a primo (0 e 1 não são).", [sieveGrid(n, composite, {})], 0);
        for (let p = 2; p * p <= n; p++) {
          if (composite[p]) {
            t.step(`${p} já foi riscado: é composto, não precisa riscar seus múltiplos.`, [sieveGrid(n, composite, { [p]: "muted" })], 1);
            continue;
          }
          const riscados: number[] = [];
          for (let m = p * p; m <= n; m += p) {
            if (!composite[m]) riscados.push(m);
            composite[m] = true;
          }
          t.step(`${p} é primo: risca ${p * p}, ${p * p + p}, ... (${riscados.length} novos).`, [sieveGrid(n, composite, { [p]: "active", ...Object.fromEntries(riscados.map((r) => [r, "bad"])) })], 2);
        }
        const primes = range(2, n).filter((v) => !composite[v]);
        t.step(`8 × 8 > 50: pode parar. Sobram ${primes.length} primos. O(n log log n).`, [sieveGrid(n, composite, Object.fromEntries(primes.map((p) => [p, "done"])))], 3);
        return t.frames;
      },
    },
    gcdScenario(1071, 462),
    gcdScenario(84, 36),
  ],
  random: () => gcdScenario(randInt(100, 2000), randInt(10, 500)),
};

// --------------------------------------------------------- exponenciação rápida

function modPowScenario(base: number, exp: number, mod: number): Scenario {
  return {
    label: `${base}^${exp} mod ${mod}`,
    build() {
      const t = new Trace();
      // BigInt: o produto de dois resíduos de 10^9 + 7 passa de 2^53 e perderia precisão em number.
      const M = BigInt(mod);
      const bits = exp.toString(2).split("").reverse().map(Number);
      let result = 1n;
      let b = BigInt(base) % M;
      let mults = 0;
      bits.forEach((bit, i) => {
        if (bit) {
          result = (result * b) % M;
          mults++;
        }
        t.step(bit ? `Bit ${i} = 1: resultado = resultado × base^(2^${i}) = ${result}.` : `Bit ${i} = 0: não multiplica.`, [
          { kind: "array", label: `bits do expoente ${exp} (do menos significativo)`, values: bits, tones: { ...tones([range(0, i - 1), "muted"]), [i]: bit ? "active" : "compare" } },
          { kind: "vars", entries: [{ name: `base^(2^${i}) mod ${mod}`, value: b.toString(), tone: "compare" }, { name: "resultado", value: result.toString(), tone: "done" }, { name: "multiplicações", value: mults }] },
        ], bit ? 2 : 3);
        b = (b * b) % M;
        mults++;
      });
      t.step(`${base}^${exp} mod ${mod} = ${result} com ${mults} multiplicações, contra ${(exp - 1).toLocaleString("pt-BR")} do jeito ingênuo. O(log exp).`, [{ kind: "vars", entries: [{ name: "resultado", value: result.toString(), tone: "done" }, { name: "multiplicações", value: mults }, { name: "ingênuo", value: (exp - 1).toLocaleString("pt-BR"), tone: "bad" }] }], 4);
      return t.frames;
    },
  };
}

export const aritmeticaModular: VisualizerDef = {
  title: "Exponenciação rápida (por quadrados)",
  summary: "O expoente em binário diz quais potências de dois da base entram no produto: a^13 = a^8 · a^4 · a^1. A base é elevada ao quadrado a cada bit, sempre reduzindo módulo m.",
  code: ["resultado = 1; base %= m", "enquanto exp > 0:", "  se exp & 1: resultado = resultado · base % m", "  base = base · base % m; exp >>= 1", "return resultado"],
  scenarios: [modPowScenario(3, 13, 1000), modPowScenario(2, 100, 1_000_000_007), modPowScenario(7, 1_000_000_005, 1_000_000_007)],
  random: () => modPowScenario(randInt(2, 9), randInt(10, 200), 1_000_000_007),
};

// ----------------------------------------------------------------- combinatória

export const combinatoria: VisualizerDef = {
  title: "Triângulo de Pascal e caminhos na grade",
  summary: "C(n, k) = C(n−1, k−1) + C(n−1, k): cada número é a soma dos dois de cima. A mesma regra conta caminhos numa grade (só direita e baixo) — e a resposta é C(m+n−2, m−1).",
  code: ["C[i][0] = C[i][i] = 1", "C[i][j] = C[i-1][j-1] + C[i-1][j]", "", "caminhos[r][c] = caminhos[r-1][c] + caminhos[r][c-1]", "caminhos(m, n) = C(m + n - 2, m - 1)"],
  scenarios: [
    {
      label: "Pascal até n = 7",
      build() {
        const t = new Trace();
        const n = 7;
        const c: (number | null)[][] = Array.from({ length: n + 1 }, () => Array(n + 1).fill(null));
        const grid = (r: number, k: number): GridPanel => ({ kind: "grid", label: "C(n, k)", colHeaders: range(0, n).map((x) => `k=${x}`), rowHeaders: range(0, n).map((x) => `n=${x}`), rows: c, tones: [{ r, c: k, tone: "active" }, ...(r > 0 && k > 0 ? [{ r: r - 1, c: k - 1, tone: "compare" as Tone }] : []), ...(r > 0 && k < r ? [{ r: r - 1, c: k, tone: "compare" as Tone }] : [])] });
        for (let i = 0; i <= n; i++) {
          for (let j = 0; j <= i; j++) {
            c[i][j] = j === 0 || j === i ? 1 : c[i - 1][j - 1]! + c[i - 1][j]!;
            if (i <= 4 || j === Math.floor(i / 2)) t.step(j === 0 || j === i ? `C(${i}, ${j}) = 1 (borda).` : `C(${i}, ${j}) = C(${i - 1}, ${j - 1}) + C(${i - 1}, ${j}) = ${c[i][j]}.`, [grid(i, j)], j === 0 || j === i ? 0 : 1);
          }
        }
        t.step(`Só somas: funciona com qualquer módulo. C(7, 3) = ${c[7][3]}.`, [{ ...grid(7, 3), tones: [{ r: 7, c: 3, tone: "done" }] }], 1);
        return t.frames;
      },
    },
    {
      label: "caminhos numa grade 4 × 5",
      build() {
        const t = new Trace();
        const m = 4;
        const n = 5;
        const ways: (number | null)[][] = Array.from({ length: m }, () => Array(n).fill(null));
        for (let r = 0; r < m; r++) {
          for (let col = 0; col < n; col++) {
            ways[r][col] = r === 0 || col === 0 ? 1 : ways[r - 1][col]! + ways[r][col - 1]!;
            t.step(r === 0 || col === 0 ? `(${r}, ${col}): na borda só existe um caminho.` : `(${r}, ${col}): vem de cima (${ways[r - 1][col]}) ou da esquerda (${ways[r][col - 1]}) = ${ways[r][col]}.`, [{ kind: "grid", label: "caminhos até cada célula", rows: ways, tones: [{ r, c: col, tone: "active" }, ...(r > 0 && col > 0 ? [{ r: r - 1, c: col, tone: "compare" as Tone }, { r, c: col - 1, tone: "compare" as Tone }] : [])] }], 3);
          }
        }
        t.step(`${ways[m - 1][n - 1]} caminhos = C(${m + n - 2}, ${m - 1}). A fórmula responde em O(1) mesmo para grades de 10⁵ × 10⁵.`, [{ kind: "grid", label: "caminhos até cada célula", rows: ways, tones: [{ r: m - 1, c: n - 1, tone: "done" }] }], 4);
        return t.frames;
      },
    },
  ],
};

// ---------------------------------------------------------- manipulação de bits

const toBits = (x: number, width = 8) => (x >>> 0).toString(2).padStart(width, "0").slice(-width).split("").map(Number);

export const manipulacaoBits: VisualizerDef = {
  title: "XOR, x & (x − 1) e máscaras",
  summary: "Veja os bits mudando: o XOR cancela pares bit a bit; x & (x − 1) apaga o bit 1 mais baixo a cada passo; e cada inteiro de 0 a 2ⁿ − 1 é um subconjunto.",
  code: ["único: acc = 0; para x: acc ^= x", "contar bits: enquanto x != 0: x &= x - 1; total++", "subconjuntos: para mask de 0 a 2^n - 1:", "  item i entra se (mask >> i) & 1"],
  scenarios: [
    {
      label: "XOR: o único entre pares",
      build() {
        const t = new Trace();
        const nums = [4, 9, 1, 4, 1];
        let acc = 0;
        nums.forEach((x, i) => {
          const before = acc;
          acc ^= x;
          t.step(`${before} ^ ${x} = ${acc}. Bits iguais se anulam.`, [
            { kind: "array", label: "nums", values: nums, tones: { ...tones([range(0, i - 1), "muted"]), [i]: "active" } },
            { kind: "grid", label: "bits", colHeaders: ["128", "64", "32", "16", "8", "4", "2", "1"], rowHeaders: ["acc antes", `x = ${x}`, "acc ^ x"], rows: [toBits(before), toBits(x), toBits(acc)], tones: toBits(acc).map((b, c) => ({ r: 2, c, tone: (b ? "active" : "muted") as Tone })) },
          ], 0);
        });
        t.step(`Sobra ${acc}: o único sem par. O(n) de tempo, O(1) de memória.`, [{ kind: "vars", entries: [{ name: "único", value: acc, tone: "done" }] }], 0);
        return t.frames;
      },
    },
    {
      label: "x & (x − 1): contar bits de 108",
      build() {
        const t = new Trace();
        let x = 108;
        let count = 0;
        while (x) {
          const next = x & (x - 1);
          count++;
          t.step(`${x} & ${x - 1} = ${next}: o bit 1 mais baixo some. Contagem = ${count}.`, [{ kind: "grid", label: "bits", colHeaders: ["128", "64", "32", "16", "8", "4", "2", "1"], rowHeaders: ["x", "x − 1", "x & (x−1)"], rows: [toBits(x), toBits(x - 1), toBits(next)], tones: toBits(x).map((b, c) => (b && !toBits(next)[c] ? { r: 0, c, tone: "bad" as Tone } : null)).filter((v): v is { r: number; c: number; tone: Tone } => v !== null) }], 1);
          x = next;
        }
        t.step(`108 tem ${count} bits ligados; o laço rodou ${count} vezes, não 8.`, [{ kind: "vars", entries: [{ name: "bits ligados", value: count, tone: "done" }] }], 1);
        return t.frames;
      },
    },
    {
      label: "máscaras: subconjuntos de {a, b, c}",
      build() {
        const t = new Trace();
        const items = ["a", "b", "c"];
        const out: string[] = [];
        for (let mask = 0; mask < 1 << items.length; mask++) {
          const subset = items.filter((_, i) => (mask >> i) & 1);
          out.push(`{${subset.join("")}}`);
          t.step(`mask = ${mask} = ${toBits(mask, 3).join("")}₂ → {${subset.join(", ")}}.`, [
            { kind: "array", label: "bits da máscara (c b a)", values: toBits(mask, 3), tones: Object.fromEntries(toBits(mask, 3).map((b, i) => [i, b ? "active" : "muted"])) },
            { kind: "array", label: "subconjuntos gerados", values: [...out], tones: { [out.length - 1]: "active" } },
          ], 3);
        }
        t.step("2³ = 8 máscaras, 8 subconjuntos. É a base da bitmask DP — viável até n ≈ 20.", [{ kind: "array", label: "subconjuntos", values: out, tones: tones([range(0, out.length - 1), "done"]) }], 2);
        return t.frames;
      },
    },
  ],
};
