import { Trace, randInt, uniqueRandom, range, tones } from "../core";
import type { Panel, Scenario, Tone, TreeNode, VisualizerDef } from "../types";

// ---------------------------------------------------------------- BST básica

export type Bst = { v: number; l: Bst | null; r: Bst | null } | null;

export function bstInsert(root: Bst, v: number): Bst {
  if (!root) return { v, l: null, r: null };
  if (v < root.v) root.l = bstInsert(root.l, v);
  else if (v > root.v) root.r = bstInsert(root.r, v);
  return root;
}

/** Converte para o formato do painel, com tons por valor. */
export function bstView(root: Bst, toneOf: (v: number) => Tone | undefined = () => undefined, badge?: (n: NonNullable<Bst>) => string | undefined): TreeNode | null {
  if (!root) return null;
  const left = bstView(root.l, toneOf, badge);
  const right = bstView(root.r, toneOf, badge);
  return {
    id: `n${root.v}`,
    label: String(root.v),
    tone: toneOf(root.v),
    badge: badge?.(root),
    children: left || right ? [left, right] : [],
  };
}

const treePanel = (root: Bst, toneOf?: (v: number) => Tone | undefined, label = "árvore"): Panel => ({ kind: "tree", label, binary: true, root: bstView(root, toneOf) });

function bstScenario(values: number[], search: number, remove: number): Scenario {
  return {
    label: `inserir ${values.join(", ")}`,
    build() {
      const t = new Trace();
      let root: Bst = null;
      for (const v of values) {
        const path: number[] = [];
        let n = root;
        while (n) {
          path.push(n.v);
          n = v < n.v ? n.l : n.r;
        }
        root = bstInsert(root, v);
        t.step(path.length ? `insert(${v}): desce comparando (${path.join(" → ")}) e entra como folha.` : `insert(${v}): árvore vazia, vira a raiz.`, [treePanel(root, (x) => (x === v ? "active" : path.includes(x) ? "compare" : undefined))], 0);
      }
      // busca
      const path: number[] = [];
      let n = root;
      while (n) {
        path.push(n.v);
        const hit = n.v === search;
        t.step(hit ? `search(${search}): achou.` : `search(${search}): ${search} ${search < n.v ? "<" : ">"} ${n.v}, vai para a ${search < n.v ? "esquerda" : "direita"}.`, [treePanel(root, (x) => (x === n!.v ? (hit ? "done" : "active") : path.includes(x) ? "compare" : undefined))], 1);
        if (hit) break;
        n = search < n.v ? n.l : n.r;
      }
      if (!n) t.step(`search(${search}): chegou a null — não existe. O custo foi a altura do caminho, não o tamanho da árvore.`, [treePanel(root, (x) => (path.includes(x) ? "muted" : undefined))], 1);
      // remoção
      const target = findNode(root, remove);
      if (target) {
        if (target.l && target.r) {
          let s = target.r;
          while (s.l) s = s.l;
          t.step(`delete(${remove}): tem dois filhos. Troca pelo sucessor em ordem (${s.v}, o menor da subárvore direita).`, [treePanel(root, (x) => (x === remove ? "bad" : x === s.v ? "swap" : undefined))], 2);
        } else {
          t.step(`delete(${remove}): tem ${target.l || target.r ? "um filho, que sobe para o lugar dele" : "nenhum filho: basta soltar a folha"}.`, [treePanel(root, (x) => (x === remove ? "bad" : undefined))], 2);
        }
        root = bstDelete(root, remove);
        t.step("Árvore depois da remoção: continua ordenada (esquerda < nó < direita).", [treePanel(root, () => "done")], 2);
      }
      return t.frames;
    },
  };
}

function findNode(root: Bst, v: number): Bst {
  while (root && root.v !== v) root = v < root.v ? root.l : root.r;
  return root;
}

function bstDelete(root: Bst, v: number): Bst {
  if (!root) return null;
  if (v < root.v) root.l = bstDelete(root.l, v);
  else if (v > root.v) root.r = bstDelete(root.r, v);
  else {
    if (!root.l) return root.r;
    if (!root.r) return root.l;
    let s = root.r;
    while (s.l) s = s.l;
    root.v = s.v;
    root.r = bstDelete(root.r, s.v);
  }
  return root;
}

export const bstOperacoes: VisualizerDef = {
  title: "BST: inserir, buscar e remover",
  summary: "Cada comparação descarta uma subárvore inteira. Com a árvore balanceada isso dá O(log n); com valores inseridos em ordem, ela vira uma lista e tudo vira O(n).",
  code: ["insert(v): desce (< esquerda, > direita) até null", "search(v): desce comparando até achar ou null", "delete(v): 0 filhos → solta; 1 filho → sobe", "           2 filhos → troca pelo sucessor"],
  scenarios: [bstScenario([50, 30, 70, 20, 40, 60, 80, 35], 35, 30), bstScenario([10, 20, 30, 40, 50], 50, 20)],
  random: () => {
    const values = uniqueRandom(8, 1, 99);
    return bstScenario(values, values[randInt(0, 7)], values[randInt(0, 7)]);
  },
};

// ---------------------------------------------------------------- percursos

function buildBst(values: number[]): Bst {
  let root: Bst = null;
  for (const v of values) root = bstInsert(root, v);
  return root;
}

const TRAV_VALUES = [8, 4, 12, 2, 6, 10, 14, 5];

function traversal(kind: "pre" | "in" | "post" | "bfs"): Scenario {
  const names = { pre: "pré-ordem (nó, esq, dir)", in: "em ordem (esq, nó, dir)", post: "pós-ordem (esq, dir, nó)", bfs: "por nível (BFS)" };
  return {
    label: names[kind],
    build() {
      const t = new Trace();
      const root = buildBst(TRAV_VALUES);
      const out: number[] = [];
      const view = (current: number): Panel[] => [
        { kind: "tree", binary: true, root: bstView(root, (x) => (x === current ? "active" : out.includes(x) ? "done" : undefined)) },
        { kind: "array", label: "saída", values: out, tones: { [out.length - 1]: "active" } },
      ];
      if (kind === "bfs") {
        const queue: Bst[] = [root];
        while (queue.length) {
          const n = queue.shift()!;
          if (!n) continue;
          out.push(n.v);
          t.step(`Visita ${n.v} e enfileira os filhos: a ordem segue os níveis.`, view(n.v), 3);
          queue.push(n.l, n.r);
        }
      } else {
        const go = (n: Bst) => {
          if (!n) return;
          if (kind === "pre") {
            out.push(n.v);
            t.step(`Visita ${n.v} antes dos filhos.`, view(n.v), 0);
          }
          go(n.l);
          if (kind === "in") {
            out.push(n.v);
            t.step(`Voltou da esquerda de ${n.v}: visita ${n.v}.`, view(n.v), 1);
          }
          go(n.r);
          if (kind === "post") {
            out.push(n.v);
            t.step(`Os dois filhos de ${n.v} já foram: visita ${n.v}.`, view(n.v), 2);
          }
        };
        go(root);
      }
      t.step(kind === "in" ? "Em ordem numa BST sai ordenado — é assim que se valida uma BST." : kind === "post" ? "Pós-ordem processa filhos antes do pai: útil para apagar a árvore ou calcular alturas." : kind === "pre" ? "Pré-ordem serializa a árvore: dá para reconstruí-la nessa ordem." : "Por nível usa fila; os outros três usam a pilha (recursão).", [
        { kind: "tree", binary: true, root: bstView(root, () => "done") },
        { kind: "array", label: "saída", values: out, tones: tones([range(0, out.length - 1), "done"]) },
      ]);
      return t.frames;
    },
  };
}

export const traversals: VisualizerDef = {
  title: "Percursos em árvore: pré, em, pós-ordem e por nível",
  summary: "A mesma árvore percorrida de quatro jeitos. Só muda o momento em que o nó é visitado em relação aos filhos — ou, na BFS, a estrutura auxiliar (fila em vez de pilha).",
  code: ["pre(n):  visita(n); pre(n.esq); pre(n.dir)", "in(n):   in(n.esq); visita(n); in(n.dir)", "post(n): post(n.esq); post(n.dir); visita(n)", "bfs: fila = [raiz]; visita e enfileira filhos"],
  scenarios: [traversal("in"), traversal("pre"), traversal("post"), traversal("bfs")],
};

// ------------------------------------------------------------------- heap

function heapTree(h: number[], toneOf: (i: number) => Tone | undefined): TreeNode | null {
  const build = (i: number): TreeNode | null => {
    if (i >= h.length) return null;
    const l = build(2 * i + 1);
    const r = build(2 * i + 2);
    return { id: `h${i}`, label: String(h[i]), tone: toneOf(i), children: l || r ? [l, r] : [] };
  };
  return build(0);
}

function heapView(h: number[], marks: Record<number, Tone>): Panel[] {
  return [
    { kind: "tree", label: "min-heap (visão de árvore)", binary: true, root: heapTree(h, (i) => marks[i]) },
    { kind: "array", label: "o mesmo heap no array (filhos de i: 2i+1 e 2i+2)", values: h, tones: marks },
  ];
}

function heapScenario(values: number[]): Scenario {
  return {
    label: `inserir ${values.join(", ")} e extrair 2`,
    build() {
      const t = new Trace();
      const h: number[] = [];
      for (const v of values) {
        h.push(v);
        let i = h.length - 1;
        t.step(`offer(${v}): entra na última posição.`, heapView(h, { [i]: "active" }), 0);
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (h[p] <= h[i]) {
            t.step(`${h[i]} ≥ pai ${h[p]}: propriedade do heap ok.`, heapView(h, { [i]: "done", [p]: "compare" }), 1);
            break;
          }
          [h[p], h[i]] = [h[i], h[p]];
          t.step(`${h[p]} < pai: troca e sobe (sift-up).`, heapView(h, { [p]: "swap", [i]: "swap" }), 2);
          i = p;
        }
      }
      for (let k = 0; k < 2; k++) {
        const min = h[0];
        const last = h.pop()!;
        if (!h.length) break;
        h[0] = last;
        t.step(`poll() devolve o mínimo ${min}. O último (${last}) vai para a raiz.`, heapView(h, { 0: "active" }), 3);
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < h.length && h[l] < h[m]) m = l;
          if (r < h.length && h[r] < h[m]) m = r;
          if (m === i) {
            t.step(`${h[i]} não é maior que nenhum filho: heap restaurado. O(log n).`, heapView(h, { [i]: "done" }), 4);
            break;
          }
          [h[i], h[m]] = [h[m], h[i]];
          t.step(`Troca com o menor filho (${h[i]}) e desce (sift-down).`, heapView(h, { [i]: "swap", [m]: "swap" }), 5);
          i = m;
        }
      }
      return t.frames;
    },
  };
}

export const heapsPriorityQueue: VisualizerDef = {
  title: "Min-heap: sift-up e sift-down",
  summary: "Um heap é uma árvore completa guardada num array. Inserir sobe o elemento trocando com o pai; extrair o mínimo põe o último na raiz e desce trocando com o menor filho. Ambos O(log n).",
  code: ["offer(x): a[n] = x", "  enquanto pai <= x: ok, para", "  senão troca com o pai e sobe", "poll(): min = a[0]; a[0] = último", "  enquanto não for maior que os filhos: para", "  senão troca com o menor filho e desce"],
  scenarios: [heapScenario([7, 3, 9, 1, 5, 8, 2])],
  random: () => heapScenario(uniqueRandom(7, 1, 60)),
};

// ------------------------------------------------------------------- trie

type TrieNode = { ch: string; end: boolean; kids: Map<string, TrieNode>; id: string };

function trieView(root: TrieNode, path: Set<string>, tone: Tone = "active"): TreeNode {
  const conv = (n: TrieNode): TreeNode => ({
    id: n.id,
    label: n.ch || "·",
    tone: path.has(n.id) ? tone : n.end ? "done" : undefined,
    badge: n.end ? "fim" : undefined,
    children: [...n.kids.values()].sort((a, b) => a.ch.localeCompare(b.ch)).map(conv),
  });
  return conv(root);
}

export const trie: VisualizerDef = {
  title: "Trie: inserir palavras e buscar por prefixo",
  summary: "Cada aresta é uma letra; palavras com o mesmo prefixo compartilham o caminho. Buscar um prefixo custa O(tamanho do prefixo), não importa quantas palavras existam.",
  code: ["insert(w): n = raiz", "  para c em w: n = n.filho[c] (cria se faltar)", "  n.fim = true", "startsWith(p): desce letra a letra; falhou → false"],
  scenarios: [
    {
      label: "car, cat, cart, dog, do",
      build() {
        const t = new Trace();
        let counter = 0;
        const root: TrieNode = { ch: "", end: false, kids: new Map(), id: "r" };
        for (const w of ["car", "cat", "cart", "dog", "do"]) {
          let n = root;
          const path = new Set<string>(["r"]);
          for (const c of w) {
            const created = !n.kids.has(c);
            if (created) n.kids.set(c, { ch: c, end: false, kids: new Map(), id: `t${counter++}` });
            n = n.kids.get(c)!;
            path.add(n.id);
            t.step(created ? `insert("${w}"): cria o nó '${c}'.` : `insert("${w}"): '${c}' já existe — reaproveita o prefixo.`, [{ kind: "tree", binary: false, root: trieView(root, path) }], 1);
          }
          n.end = true;
          t.step(`Marca o fim de "${w}".`, [{ kind: "tree", binary: false, root: trieView(root, path, "done") }], 2);
        }
        for (const p of ["ca", "cart", "dot"]) {
          let n: TrieNode | undefined = root;
          const path = new Set<string>(["r"]);
          for (const c of p) {
            n = n?.kids.get(c);
            if (!n) break;
            path.add(n.id);
          }
          t.step(n ? `startsWith("${p}"): o caminho existe${n.end ? ` e "${p}" também é uma palavra` : ""}.` : `startsWith("${p}"): falta uma letra no caminho → false.`, [{ kind: "tree", binary: false, root: trieView(root, path, n ? "path" : "bad") }], 3);
        }
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------------------- AVL

type Avl = { v: number; l: Avl | null; r: Avl | null; h: number } | null;
const height = (n: Avl) => (n ? n.h : 0);
const fix = (n: NonNullable<Avl>) => {
  n.h = 1 + Math.max(height(n.l), height(n.r));
  return n;
};
const balance = (n: Avl) => (n ? height(n.l) - height(n.r) : 0);

function rotateRight(y: NonNullable<Avl>): NonNullable<Avl> {
  const x = y.l!;
  y.l = x.r;
  x.r = y;
  fix(y);
  return fix(x);
}
function rotateLeft(x: NonNullable<Avl>): NonNullable<Avl> {
  const y = x.r!;
  x.r = y.l;
  y.l = x;
  fix(x);
  return fix(y);
}

function avlView(root: Avl, toneOf: (v: number) => Tone | undefined): TreeNode | null {
  if (!root) return null;
  const l = avlView(root.l, toneOf);
  const r = avlView(root.r, toneOf);
  return { id: `a${root.v}`, label: String(root.v), tone: toneOf(root.v), badge: `${balance(root) > 0 ? "+" : ""}${balance(root)}`, children: l || r ? [l, r] : [] };
}

export const avlRedBlack: VisualizerDef = {
  title: "AVL: rotações mantêm a altura em O(log n)",
  summary: "Depois de cada inserção, o fator de balanceamento (altura esq − altura dir, no canto de cada nó) precisa ficar entre −1 e +1. Quando passa disso, uma ou duas rotações reequilibram a árvore.",
  code: ["insert como numa BST", "atualiza alturas na volta da recursão", "fator > 1 e filho esq pesado à esq: rotação direita", "fator < -1 e filho dir pesado à dir: rotação esquerda", "casos em zigue-zague: rotação dupla"],
  scenarios: [
    {
      label: "inserir 10, 20, 30, 40, 50, 25",
      build() {
        const t = new Trace();
        let root: Avl = null;
        const snap = (caption: string, toneOf: (v: number) => Tone | undefined, line: number) => t.step(caption, [{ kind: "tree", binary: true, label: "AVL (fator de balanceamento no canto)", root: avlView(root, toneOf) }], line);
        const insert = (n: Avl, v: number): NonNullable<Avl> => {
          if (!n) return { v, l: null, r: null, h: 1 };
          if (v < n.v) n.l = insert(n.l, v);
          else n.r = insert(n.r, v);
          fix(n);
          const b = balance(n);
          if (b > 1 || b < -1) {
            const kind = b > 1 ? (v < n.l!.v ? "LL" : "LR") : v > n.r!.v ? "RR" : "RL";
            pending.push({ at: n.v, kind });
            if (kind === "LL") return rotateRight(n);
            if (kind === "RR") return rotateLeft(n);
            if (kind === "LR") {
              n.l = rotateLeft(n.l!);
              return rotateRight(n);
            }
            n.r = rotateRight(n.r!);
            return rotateLeft(n);
          }
          return n;
        };
        let pending: { at: number; kind: string }[] = [];
        for (const v of [10, 20, 30, 40, 50, 25]) {
          // mostra o desequilíbrio antes de rotacionar: insere numa cópia sem rotação
          const plain = cloneAvl(root);
          const unbalanced = plainInsert(plain, v);
          const prevRoot = root;
          root = unbalanced;
          const bad = findUnbalanced(unbalanced);
          snap(bad ? `insert(${v}): o nó ${bad} ficou com fator ${balance(findNodeAvl(unbalanced, bad))} — desequilibrado.` : `insert(${v}): todos os fatores entre −1 e +1.`, (x) => (x === v ? "active" : x === bad ? "bad" : undefined), bad ? 1 : 0);
          root = prevRoot;
          pending = [];
          root = insert(root, v);
          if (pending.length) {
            const p = pending[0];
            const names: Record<string, string> = { LL: "rotação à direita", RR: "rotação à esquerda", LR: "rotação dupla (esquerda + direita)", RL: "rotação dupla (direita + esquerda)" };
            snap(`Caso ${p.kind} em ${p.at}: ${names[p.kind]}. A altura volta a ser logarítmica.`, (x) => (x === v ? "active" : "done"), p.kind === "LL" ? 2 : p.kind === "RR" ? 3 : 4);
          }
        }
        snap("Inserindo em ordem crescente, uma BST comum viraria uma lista de altura 6. A AVL tem altura 3.", () => "done", 1);
        return t.frames;
      },
    },
  ],
};

function cloneAvl(n: Avl): Avl {
  return n ? { v: n.v, h: n.h, l: cloneAvl(n.l), r: cloneAvl(n.r) } : null;
}
function plainInsert(n: Avl, v: number): Avl {
  if (!n) return { v, l: null, r: null, h: 1 };
  if (v < n.v) n.l = plainInsert(n.l, v);
  else n.r = plainInsert(n.r, v);
  return fix(n);
}
function findUnbalanced(n: Avl): number | undefined {
  if (!n) return undefined;
  return findUnbalanced(n.l) ?? findUnbalanced(n.r) ?? (Math.abs(balance(n)) > 1 ? n.v : undefined);
}
function findNodeAvl(n: Avl, v: number): Avl {
  while (n && n.v !== v) n = v < n.v ? n.l : n.r;
  return n;
}
