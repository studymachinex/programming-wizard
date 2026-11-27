import { Trace, randInt, randomArray, range, tones } from "../core";
import type { ListItem, Panel, Scenario, Tone, VisualizerDef } from "../types";

// -------------------------------------------------------------- dynamic array

export const arraysDynamic: VisualizerDef = {
  title: "Inserir e remover no meio de um array",
  summary: "Inserir na posição i exige deslocar todos os elementos depois dela uma casa para a direita; remover desloca para a esquerda. Por isso add no fim é O(1) e add no meio é O(n).",
  code: [
    "insert(i, x):",
    "  para j de tamanho-1 até i:",
    "    a[j+1] = a[j]      // desloca",
    "  a[i] = x; tamanho++",
    "",
    "remove(i):",
    "  para j de i até tamanho-2:",
    "    a[j] = a[j+1]",
    "  tamanho--",
  ],
  scenarios: [
    {
      label: "insert(2, 99) e remove(1)",
      build() {
        const t = new Trace();
        const a: (number | null)[] = [10, 20, 30, 40, 50, null, null, null];
        let size = 5;
        const view = (extra: Record<number, Tone> = {}, ptr?: number): Panel[] => [
          { kind: "array", label: `array (tamanho ${size}, capacidade ${a.length})`, values: a, tones: { ...tones([range(size, a.length - 1), "muted"]), ...extra }, pointers: ptr !== undefined ? [{ index: ptr, label: "j" }] : [] },
        ];
        t.step("Array com 5 elementos e espaço livre no fim.", view(), 0);
        for (let j = size - 1; j >= 2; j--) {
          a[j + 1] = a[j];
          t.step(`Desloca a[${j}] = ${a[j]} para a[${j + 1}].`, view({ [j]: "compare", [j + 1]: "swap" }, j), 2);
        }
        a[2] = 99;
        size++;
        t.step(`Grava 99 em a[2]. Foram ${size - 1 - 2} deslocamentos — proporcional ao que vem depois de i.`, view({ 2: "active" }), 3);
        for (let j = 1; j <= size - 2; j++) {
          a[j] = a[j + 1];
          t.step(`remove(1): a[${j}] recebe a[${j + 1}] = ${a[j]}.`, view({ [j]: "swap", [j + 1]: "compare" }, j), 7);
        }
        a[size - 1] = null;
        size--;
        t.step("Tamanho volta a 5. Remover do início ou do meio custa O(n); do fim, O(1).", view(tones([range(0, size - 1), "done"])), 8);
        return t.frames;
      },
    },
  ],
};

// ----------------------------------------------------------- linked list reverse

function linkedPanel(values: number[], toneOf: (i: number) => Tone | undefined, pointers: { index: number; label: string; tone?: Tone }[], label: string): Panel {
  return { kind: "list", style: "linked", label, items: values.map((v, i) => ({ label: String(v), tone: toneOf(i) })), pointers };
}

function reverseScenario(values: number[], label: string): Scenario {
  return {
    label,
    build() {
      const t = new Trace();
      // next[i] = índice do próximo nó (ou -1). Representamos as duas metades: revertida e restante.
      let prev: number[] = [];
      let rest = [...values];
      t.step("Lista original. prev = null, curr = head.", [
        linkedPanel([], () => undefined, [], "revertida (a partir de prev)"),
        linkedPanel(rest, (i) => (i === 0 ? "active" : undefined), rest.length ? [{ index: 0, label: "curr" }] : [], "restante (a partir de curr)"),
      ], 0);
      while (rest.length) {
        const curr = rest[0];
        t.step(`next = curr.next (${rest[1] ?? "null"}); guardamos antes de mexer no ponteiro.`, [
          linkedPanel(prev, (i) => (i === 0 ? "compare" : undefined), prev.length ? [{ index: 0, label: "prev" }] : [], "revertida (a partir de prev)"),
          linkedPanel(rest, (i) => (i === 0 ? "active" : i === 1 ? "swap" : undefined), [{ index: 0, label: "curr" }, ...(rest.length > 1 ? [{ index: 1, label: "next", tone: "swap" as Tone }] : [])], "restante (a partir de curr)"),
        ], 2);
        prev = [curr, ...prev];
        rest = rest.slice(1);
        t.step(`curr.next = prev: o nó ${curr} passa a apontar para trás. Avança prev = curr e curr = next.`, [
          linkedPanel(prev, (i) => (i === 0 ? "active" : undefined), [{ index: 0, label: "prev" }], "revertida (a partir de prev)"),
          linkedPanel(rest, (i) => (i === 0 ? "compare" : undefined), rest.length ? [{ index: 0, label: "curr" }] : [], "restante (a partir de curr)"),
        ], 3);
      }
      t.step("curr == null: prev é a nova cabeça. O(n) de tempo, O(1) de memória.", [
        linkedPanel(prev, () => "done", [{ index: 0, label: "head" }], "lista revertida"),
      ], 5);
      return t.frames;
    },
  };
}

export const linkedListSimples: VisualizerDef = {
  title: "Reverter uma linked list (prev, curr, next)",
  summary: "O exercício clássico de ponteiros: a cada passo, salve o próximo, vire o ponteiro do nó atual para trás e avance os dois ponteiros.",
  code: ["prev = null; curr = head", "enquanto curr != null:", "  next = curr.next", "  curr.next = prev", "  prev = curr; curr = next", "return prev"],
  scenarios: [reverseScenario([1, 2, 3, 4, 5], "1 → 2 → 3 → 4 → 5"), reverseScenario([7], "um nó só")],
  random: () => reverseScenario(randomArray(randInt(3, 7), 1, 99), "aleatória"),
};

// ------------------------------------------------------ doubly e circular

export const doublyCircular: VisualizerDef = {
  title: "Lista duplamente ligada com sentinela e lista circular",
  summary: "Com ponteiros para os dois lados, remover um nó conhecido é O(1): basta religar vizinho anterior e posterior. Na circular, o último aponta para o primeiro — útil para round-robin.",
  code: [
    "addLast(x): no = (x); no.prev = tail.prev; no.next = tail",
    "            tail.prev.next = no; tail.prev = no",
    "remove(no): no.prev.next = no.next",
    "            no.next.prev = no.prev",
    "",
    "circular: atual = atual.next  // nunca chega a null",
  ],
  scenarios: [
    {
      label: "deque com sentinelas",
      build() {
        const t = new Trace();
        const items: string[] = [];
        const show = (highlight?: number, tone: Tone = "active"): Panel => ({
          kind: "list",
          style: "doubly",
          label: "head ⇄ ... ⇄ tail (sentinelas)",
          items: [{ label: "H", tone: "muted" }, ...items.map((x, i) => ({ label: x, tone: i === highlight ? tone : undefined })), { label: "T", tone: "muted" }] as ListItem[],
        });
        t.step("Lista vazia: só as sentinelas head e tail, ligadas entre si. Sem casos especiais para lista vazia.", [show()], 0);
        for (const x of ["A", "B", "C", "D"]) {
          items.push(x);
          t.step(`addLast(${x}): o novo nó entra entre o último e a sentinela tail — 4 ponteiros, O(1).`, [show(items.length - 1)], 1);
        }
        t.step("remove(B): temos a referência ao nó (por exemplo, vinda de um HashMap, como no LRU).", [show(1, "bad")], 2);
        items.splice(1, 1);
        t.step("A.next = C e C.prev = A. Sem percorrer a lista: O(1).", [show()], 3);
        return t.frames;
      },
    },
    {
      label: "circular (round-robin)",
      build() {
        const t = new Trace();
        const servers = ["s1", "s2", "s3", "s4"];
        for (let k = 0; k < 9; k++) {
          const i = k % servers.length;
          t.step(`Requisição ${k + 1} vai para ${servers[i]}; depois atual = atual.next.${i === servers.length - 1 ? " O próximo do último é o primeiro." : ""}`, [
            { kind: "list", style: "circular", label: "balanceador round-robin", items: servers.map((s, j) => ({ label: s, tone: j === i ? "active" : undefined })), pointers: [{ index: i, label: "atual" }] },
          ], 5);
        }
        return t.frames;
      },
    },
  ],
};

// ---------------------------------------------------------------- two pointers

function twoSumSorted(nums: number[], target: number): Scenario {
  return {
    label: `par com soma ${target}`,
    build() {
      const t = new Trace();
      let l = 0;
      let r = nums.length - 1;
      while (l < r) {
        const s = nums[l] + nums[r];
        const done = s === target;
        t.step(
          done ? `${nums[l]} + ${nums[r]} = ${s}: achou!` : s < target ? `${nums[l]} + ${nums[r]} = ${s} < ${target}: a soma precisa crescer, então L avança.` : `${nums[l]} + ${nums[r]} = ${s} > ${target}: a soma precisa diminuir, então R recua.`,
          [
            { kind: "array", label: "nums (ordenado)", values: nums, tones: { ...tones([range(0, l - 1), "muted"], [range(r + 1, nums.length - 1), "muted"]), [l]: done ? "done" : "compare", [r]: done ? "done" : "compare" }, pointers: [{ index: l, label: "L" }, { index: r, label: "R" }] },
            { kind: "vars", entries: [{ name: "soma", value: s, tone: done ? "done" : "active" }, { name: "alvo", value: target }] },
          ],
          done ? 3 : s < target ? 4 : 5,
        );
        if (done) return t.frames;
        if (s < target) l++;
        else r--;
      }
      t.step("L encontrou R: não existe par. Cada passo descartou um elemento — O(n) no total.", [{ kind: "array", label: "nums (ordenado)", values: nums, tones: tones([range(0, nums.length - 1), "muted"]) }], 6);
      return t.frames;
    },
  };
}

export const twoPointers: VisualizerDef = {
  title: "Two pointers: opostos e mesmo sentido",
  summary: "Ponteiros opostos funcionam porque o array está ordenado: cada comparação descarta uma ponta inteira. No mesmo sentido, um ponteiro lê e o outro escreve, removendo duplicatas in-place.",
  code: ["L = 0; R = n - 1", "enquanto L < R:", "  soma = a[L] + a[R]", "  se soma == alvo: retorna (L, R)", "  se soma < alvo: L++", "  senão: R--", "retorna nenhum"],
  scenarios: [
    twoSumSorted([1, 3, 4, 6, 8, 11, 14, 17], 20),
    twoSumSorted([2, 5, 9, 12, 15], 6),
    {
      label: "remover duplicatas (mesmo sentido)",
      build() {
        const t = new Trace();
        const a = [1, 1, 2, 2, 2, 3, 5, 5, 7];
        let w = 1;
        t.step("w marca onde escrever o próximo valor distinto; r lê.", [{ kind: "array", label: "nums", values: [...a], pointers: [{ index: 1, label: "w" }, { index: 1, label: "r", tone: "compare" }] }]);
        for (let r = 1; r < a.length; r++) {
          const novo = a[r] !== a[w - 1];
          if (novo) a[w] = a[r];
          t.step(novo ? `a[r] = ${a[r]} é novo: copia para a[w] e w avança.` : `a[r] = ${a[r]} repete a[w-1]: ignora.`, [
            { kind: "array", label: "nums", values: [...a], tones: { ...tones([range(0, novo ? w : w - 1), "done"]), [r]: "compare", ...(novo ? { [w]: "active" as Tone } : {}) }, pointers: [{ index: novo ? w : w - 1, label: "w" }, { index: r, label: "r", tone: "compare" }] },
          ]);
          if (novo) w++;
        }
        t.step(`Os ${w} primeiros elementos são os distintos. O(n) de tempo, O(1) de memória.`, [{ kind: "array", label: "nums", values: [...a], tones: tones([range(0, w - 1), "done"], [range(w, a.length - 1), "muted"]) }]);
        return t.frames;
      },
    },
  ],
  random: () => {
    // Precisa de pelo menos 3 números distintos e de um alvo que não seja a soma das pontas
    // (senão o cenário acaba no primeiro quadro).
    let nums: number[] = [];
    while (nums.length < 3) nums = [...new Set(randomArray(8, 1, 30))].sort((x, y) => x - y);
    let target = 0;
    do target = nums[randInt(0, nums.length - 1)] + nums[randInt(0, nums.length - 1)];
    while (target === nums[0] + nums[nums.length - 1]);
    return twoSumSorted(nums, target);
  },
};

// ---------------------------------------------------- sliding window e prefix sums

function windowScenario(nums: number[], k: number): Scenario {
  return {
    label: `maior soma em janela de ${k}`,
    build() {
      const t = new Trace();
      let sum = nums.slice(0, k).reduce((a, b) => a + b, 0);
      let best = sum;
      let bestAt = 0;
      t.step(`Primeira janela [0..${k - 1}]: soma ${sum}.`, [
        { kind: "array", label: "nums", values: nums, ranges: [{ from: 0, to: k - 1, tone: "active", label: `soma ${sum}` }] },
        { kind: "vars", entries: [{ name: "soma", value: sum }, { name: "melhor", value: best, tone: "done" }] },
      ], 0);
      for (let r = k; r < nums.length; r++) {
        sum += nums[r] - nums[r - k];
        if (sum > best) {
          best = sum;
          bestAt = r - k + 1;
        }
        t.step(`Desliza: soma += ${nums[r]} (entra) − ${nums[r - k]} (sai) = ${sum}. Sem recalcular a janela inteira.`, [
          { kind: "array", label: "nums", values: nums, tones: { [r]: "done", [r - k]: "bad" }, ranges: [{ from: r - k + 1, to: r, tone: "active", label: `soma ${sum}` }] },
          { kind: "vars", entries: [{ name: "soma", value: sum }, { name: "melhor", value: best, tone: "done" }] },
        ], 2);
      }
      t.step(`Melhor janela começa em ${bestAt} com soma ${best}. O(n) em vez de O(n·k).`, [
        { kind: "array", label: "nums", values: nums, ranges: [{ from: bestAt, to: bestAt + k - 1, tone: "done", label: `melhor ${best}` }] },
      ], 3);
      return t.frames;
    },
  };
}

export const slidingWindowPrefix: VisualizerDef = {
  title: "Sliding window e prefix sums",
  summary: "A janela deslizante reaproveita a soma anterior: soma o que entra e subtrai o que sai. O prefix sum pré-calcula somas acumuladas para responder qualquer intervalo em O(1).",
  code: ["soma = soma(a[0..k-1])", "para r de k até n-1:", "  soma += a[r] - a[r-k]", "  melhor = max(melhor, soma)", "", "pre[i+1] = pre[i] + a[i]", "soma(l..r) = pre[r+1] - pre[l]"],
  scenarios: [
    windowScenario([4, 2, 7, 1, 8, 3, 6, 5], 3),
    {
      label: "prefix sums + consultas",
      build() {
        const t = new Trace();
        const a = [3, 1, 4, 1, 5, 9, 2, 6];
        const pre = [0];
        for (let i = 0; i < a.length; i++) {
          pre.push(pre[i] + a[i]);
          t.step(`pre[${i + 1}] = pre[${i}] + a[${i}] = ${pre[i + 1]}.`, [
            { kind: "array", label: "a", values: a, tones: { [i]: "compare" } },
            { kind: "array", label: "pre (pre[0] = 0)", values: [...pre, ...Array(a.length + 1 - pre.length).fill(null)], tones: { [i + 1]: "active" } },
          ], 5);
        }
        for (const [l, r] of [[2, 5], [0, 3], [4, 7]]) {
          t.step(`soma(${l}..${r}) = pre[${r + 1}] − pre[${l}] = ${pre[r + 1]} − ${pre[l]} = ${pre[r + 1] - pre[l]}, em O(1).`, [
            { kind: "array", label: "a", values: a, ranges: [{ from: l, to: r, tone: "active", label: `${pre[r + 1] - pre[l]}` }] },
            { kind: "array", label: "pre", values: pre, tones: { [r + 1]: "done", [l]: "bad" } },
          ], 6);
        }
        return t.frames;
      },
    },
  ],
  random: () => windowScenario(randomArray(9, 1, 20), randInt(2, 4)),
};
