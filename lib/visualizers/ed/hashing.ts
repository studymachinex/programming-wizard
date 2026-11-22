import { Trace } from "../core";
import type { ListItem, Panel, Tone, VisualizerDef } from "../types";

/** hashCode de String do Java (31 * h + c), em 32 bits. */
export function javaHash(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return h;
}

const spread = (h: number) => h ^ (h >>> 16); // o "espalhamento" do HashMap
const bucketOf = (key: string, cap: number) => spread(javaHash(key)) & (cap - 1);

function table(entries: { k: string; v: number }[], cap: number, highlight?: string, tone: Tone = "active", label = "tabela"): Panel {
  return {
    kind: "buckets",
    label: `${label} (capacidade ${cap})`,
    buckets: Array.from({ length: cap }, (_, b) => {
      const items: ListItem[] = entries.filter((e) => bucketOf(e.k, cap) === b).map((e) => ({ label: `${e.k}=${e.v}`, tone: e.k === highlight ? tone : undefined }));
      return { label: `[${b}]`, items, tone: highlight !== undefined && bucketOf(highlight, cap) === b ? ("active" as Tone) : undefined };
    }),
  };
}

// --------------------------------------------------- colisões e load factor

export const hashingLoadFactor: VisualizerDef = {
  title: "Hashing, colisões e resize por load factor",
  summary: "O bucket é hash(chave) & (capacidade − 1). Chaves diferentes podem cair no mesmo bucket (colisão). Quando tamanho/capacidade passa de 0,75, a tabela dobra e cada chave é recolocada.",
  code: ["put(k, v):", "  b = spread(k.hashCode()) & (cap - 1)", "  adiciona (k, v) no bucket b", "  se tamanho > 0,75 * cap:", "    cap *= 2; rehash de todas as chaves"],
  scenarios: [
    {
      label: "8 inserções (capacidade 4)",
      build() {
        const t = new Trace();
        let cap = 4;
        const entries: { k: string; v: number }[] = [];
        const keys = ["ana", "bia", "caio", "davi", "eva", "fabio", "gil", "hugo"];
        const vars = (k?: string) => ({
          kind: "vars" as const,
          entries: [
            ...(k ? [{ name: `hash("${k}")`, value: javaHash(k) }, { name: "bucket", value: bucketOf(k, cap), tone: "active" as Tone }] : []),
            { name: "tamanho", value: entries.length },
            { name: "load factor", value: (entries.length / cap).toFixed(2), tone: entries.length / cap > 0.75 ? ("bad" as Tone) : ("done" as Tone) },
          ],
        });
        keys.forEach((k, i) => {
          const b = bucketOf(k, cap);
          const collision = entries.some((e) => bucketOf(e.k, cap) === b);
          entries.push({ k, v: i + 1 });
          t.step(collision ? `"${k}" cai no bucket ${b}, que já tem chaves: colisão — a lista do bucket cresce.` : `"${k}" cai no bucket ${b}, vazio.`, [table(entries, cap, k, collision ? "swap" : "active"), vars(k)], 2);
          if (entries.length > 0.75 * cap) {
            t.step(`Load factor ${(entries.length / cap).toFixed(2)} > 0,75: hora de dobrar a capacidade.`, [table(entries, cap), vars()], 3);
            cap *= 2;
            t.step(`Nova capacidade ${cap}: cada chave é recolocada pelo novo hash & (cap − 1). As listas encurtam.`, [table(entries, cap, undefined, "active", "tabela após rehash"), vars()], 4);
          }
        });
        return t.frames;
      },
    },
  ],
};

// --------------------------------------------------------- HashMap com chaining

export const hashmapChaining: VisualizerDef = {
  title: "HashMap com chaining: put, get e remove",
  summary: "Cada bucket guarda uma lista de entradas. put percorre o bucket para atualizar ou acrescentar; get compara as chaves só dentro do bucket; remove religa a lista.",
  code: ["get(k): b = bucket(k)", "  para e no bucket b: se e.k == k: return e.v", "  return null", "put(k, v): se k existe no bucket: atualiza", "  senão: acrescenta no bucket", "remove(k): tira e do bucket"],
  scenarios: [
    {
      label: "operações em sequência",
      build() {
        const t = new Trace();
        const cap = 4;
        let entries: { k: string; v: number }[] = [];
        const ops: [string, string, number?][] = [["put", "maçã", 3], ["put", "uva", 7], ["put", "kiwi", 2], ["put", "pera", 5], ["get", "kiwi"], ["put", "uva", 9], ["get", "manga"], ["remove", "maçã"], ["get", "maçã"]];
        for (const [op, k, v] of ops) {
          const b = bucketOf(k, cap);
          const found = entries.find((e) => e.k === k);
          if (op === "put") {
            if (found) {
              found.v = v!;
              t.step(`put("${k}", ${v}): a chave já existe no bucket ${b} — atualiza o valor.`, [table(entries, cap, k, "swap")], 3);
            } else {
              entries.push({ k, v: v! });
              t.step(`put("${k}", ${v}): bucket ${b}; a chave é nova, entra no fim da lista.`, [table(entries, cap, k)], 4);
            }
          } else if (op === "get") {
            t.step(found ? `get("${k}"): bucket ${b}, compara as chaves dali e acha ${found.v}.` : `get("${k}"): bucket ${b} não tem a chave → null.`, [table(entries, cap, found ? k : undefined, "done")], found ? 1 : 2);
          } else {
            t.step(`remove("${k}"): localiza no bucket ${b}...`, [table(entries, cap, k, "bad")], 5);
            entries = entries.filter((e) => e.k !== k);
            t.step("...e religa a lista sem ele.", [table(entries, cap)], 5);
          }
        }
        return t.frames;
      },
    },
  ],
};

// ------------------------------------------------------- frequency maps

export const frequencyMaps: VisualizerDef = {
  title: "Frequency map: são anagramas?",
  summary: "Conte os caracteres da primeira palavra e desconte os da segunda. Se algum contador ficar negativo (ou sobrar diferente de zero), não são anagramas. O(n) contra O(n log n) de ordenar.",
  code: ["para c em s: freq[c]++", "para c em t:", "  freq[c]--", "  se freq[c] < 0: return false", "return true (tamanhos iguais)"],
  scenarios: ["listen|silent", "amor|roma", "abacate|acabata"].map((pair) => {
    const [s, w] = pair.split("|");
    return {
      label: `"${s}" × "${w}"`,
      build() {
        const t = new Trace();
        const freq = new Map<string, number>();
        const grid = (focus?: string, tone: Tone = "active"): Panel => {
          const keys = [...freq.keys()].sort();
          return { kind: "grid", label: "freq", colHeaders: keys, rows: [keys.map((k) => freq.get(k)!)], tones: focus ? [{ r: 0, c: keys.indexOf(focus), tone }] : [] };
        };
        [...s].forEach((c, i) => {
          freq.set(c, (freq.get(c) ?? 0) + 1);
          t.step(`"${s}"[${i}] = '${c}': freq['${c}'] = ${freq.get(c)}.`, [{ kind: "array", label: s, values: [...s], tones: { [i]: "active" } }, grid(c)], 0);
        });
        for (let i = 0; i < w.length; i++) {
          const c = w[i];
          freq.set(c, (freq.get(c) ?? 0) - 1);
          const bad = freq.get(c)! < 0;
          t.step(bad ? `'${c}' aparece mais em "${w}" do que em "${s}": não são anagramas.` : `"${w}"[${i}] = '${c}': freq['${c}'] = ${freq.get(c)}.`, [{ kind: "array", label: w, values: [...w], tones: { [i]: bad ? "bad" : "compare" } }, grid(c, bad ? "bad" : "compare")], bad ? 3 : 2);
          if (bad) return t.frames;
        }
        const ok = s.length === w.length;
        t.step(ok ? "Todos os contadores voltaram a 0: são anagramas." : "Tamanhos diferentes: não são anagramas.", [grid()], 4);
        return t.frames;
      },
    };
  }),
};

// ---------------------------------------------------------------- LRU

export const lruCache: VisualizerDef = {
  title: "LRU cache: HashMap + lista duplamente ligada",
  summary: "O mapa acha o nó em O(1); a lista mantém a ordem de uso. Cada acesso move o nó para a frente; quando lota, sai quem está no fim (o menos usado recentemente).",
  code: ["get(k): se k no mapa: move nó para a frente; return v", "        senão return -1", "put(k, v): se k existe: atualiza e move para a frente", "  senão: insere na frente", "  se tamanho > capacidade: remove o último"],
  scenarios: [
    {
      label: "capacidade 3",
      build() {
        const t = new Trace();
        const cap = 3;
        let order: { k: string; v: number }[] = []; // frente = mais recente
        const view = (focus?: string, tone: Tone = "active", evicted?: string): Panel[] => [
          { kind: "list", style: "doubly", label: "mais recente ⇄ ... ⇄ menos recente", items: order.map((e) => ({ label: `${e.k}:${e.v}`, tone: e.k === focus ? tone : undefined })) },
          { kind: "vars", label: "HashMap<chave, nó>", entries: [...order.map((e) => ({ name: e.k, value: "→ nó", tone: e.k === focus ? tone : undefined })), ...(evicted ? [{ name: evicted, value: "removido", tone: "bad" as Tone }] : [])] },
        ];
        const ops: [string, string, number?][] = [["put", "A", 1], ["put", "B", 2], ["put", "C", 3], ["get", "A"], ["put", "D", 4], ["get", "B"], ["put", "C", 30], ["put", "E", 5]];
        for (const [op, k, v] of ops) {
          const found = order.find((e) => e.k === k);
          if (op === "get") {
            if (!found) {
              t.step(`get(${k}): não está no mapa → -1.`, view(), 1);
              continue;
            }
            order = [found, ...order.filter((e) => e !== found)];
            t.step(`get(${k}) = ${found.v}: o mapa acha o nó e ele vai para a frente.`, view(k, "done"), 0);
          } else if (found) {
            found.v = v!;
            order = [found, ...order.filter((e) => e !== found)];
            t.step(`put(${k}, ${v}): já existe — atualiza e move para a frente.`, view(k, "swap"), 2);
          } else {
            order = [{ k, v: v! }, ...order];
            if (order.length > cap) {
              const out = order.pop()!;
              t.step(`put(${k}, ${v}) lotou o cache: sai ${out.k}, o menos usado recentemente.`, view(k, "active", out.k), 4);
            } else {
              t.step(`put(${k}, ${v}): entra na frente.`, view(k), 3);
            }
          }
        }
        return t.frames;
      },
    },
  ],
};
