/**
 * Autocomplete de Java para o editor do runner (Ctrl+Espaço).
 *
 * Sem servidor de linguagem: combina palavras-chave, snippets, classes comuns
 * do JDK (com import automático), símbolos declarados no próprio código e
 * membros após "." — o tipo da variável é inferido da declaração dela na
 * árvore de sintaxe (lezer-java).
 */
import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

// ---------------------------------------------------------------------------
// Catálogo do JDK. Cada membro: "nome(param tipo, ...): retorno" ou "NOME: tipo".
// ---------------------------------------------------------------------------

type TypeInfo = { extends?: string[]; instance?: string[]; statics?: string[] };

const JDK: Record<string, TypeInfo> = {
  Object: { instance: ["equals(Object o): boolean", "hashCode(): int", "toString(): String", "getClass(): Class<?>"] },
  String: {
    instance: [
      "length(): int", "charAt(int index): char", "substring(int begin): String", "substring(int begin, int end): String",
      "indexOf(String str): int", "indexOf(char ch): int", "lastIndexOf(String str): int", "contains(CharSequence s): boolean",
      "equalsIgnoreCase(String other): boolean", "compareTo(String other): int", "isEmpty(): boolean", "isBlank(): boolean",
      "split(String regex): String[]", "trim(): String", "strip(): String", "toCharArray(): char[]", "toLowerCase(): String",
      "toUpperCase(): String", "startsWith(String prefix): boolean", "endsWith(String suffix): boolean",
      "replace(CharSequence target, CharSequence repl): String", "repeat(int count): String", "chars(): IntStream",
    ],
    statics: ["valueOf(Object x): String", "join(CharSequence sep, Iterable parts): String", "format(String fmt, Object args): String"],
  },
  StringBuilder: {
    instance: [
      "append(Object x): StringBuilder", "insert(int offset, Object x): StringBuilder", "deleteCharAt(int index): StringBuilder",
      "delete(int start, int end): StringBuilder", "reverse(): StringBuilder", "length(): int", "charAt(int index): char",
      "setCharAt(int index, char ch): void", "setLength(int len): void", "indexOf(String str): int", "isEmpty(): boolean",
    ],
  },
  Collection: {
    instance: [
      "add(E e): boolean", "remove(Object o): boolean", "contains(Object o): boolean", "size(): int", "isEmpty(): boolean",
      "clear(): void", "addAll(Collection c): boolean", "removeIf(Predicate filter): boolean", "stream(): Stream<E>",
      "forEach(Consumer action): void", "iterator(): Iterator<E>", "toArray(): Object[]",
    ],
  },
  List: {
    extends: ["Collection"],
    instance: [
      "get(int index): E", "set(int index, E e): E", "add(int index, E e): void", "remove(int index): E", "indexOf(Object o): int",
      "lastIndexOf(Object o): int", "subList(int from, int to): List<E>", "sort(Comparator c): void",
    ],
    statics: ["of(E... elems): List<E>", "copyOf(Collection c): List<E>"],
  },
  ArrayList: { extends: ["List"], instance: ["ensureCapacity(int min): void", "trimToSize(): void"] },
  Queue: { extends: ["Collection"], instance: ["offer(E e): boolean", "poll(): E", "peek(): E", "element(): E"] },
  Deque: {
    extends: ["Queue"],
    instance: [
      "push(E e): void", "pop(): E", "addFirst(E e): void", "addLast(E e): void", "offerFirst(E e): boolean",
      "offerLast(E e): boolean", "pollFirst(): E", "pollLast(): E", "peekFirst(): E", "peekLast(): E",
      "removeFirst(): E", "removeLast(): E", "descendingIterator(): Iterator<E>",
    ],
  },
  LinkedList: { extends: ["List", "Deque"] },
  ArrayDeque: { extends: ["Deque"] },
  PriorityQueue: { extends: ["Queue"], instance: ["comparator(): Comparator"] },
  Stack: { extends: ["List"], instance: ["push(E e): E", "pop(): E", "peek(): E", "empty(): boolean", "search(Object o): int"] },
  Set: { extends: ["Collection"], instance: ["retainAll(Collection c): boolean", "removeAll(Collection c): boolean", "containsAll(Collection c): boolean"], statics: ["of(E... elems): Set<E>", "copyOf(Collection c): Set<E>"] },
  HashSet: { extends: ["Set"] },
  LinkedHashSet: { extends: ["Set"] },
  TreeSet: {
    extends: ["Set"],
    instance: [
      "first(): E", "last(): E", "floor(E e): E", "ceiling(E e): E", "lower(E e): E", "higher(E e): E", "pollFirst(): E",
      "pollLast(): E", "headSet(E to): SortedSet<E>", "tailSet(E from): SortedSet<E>", "descendingSet(): NavigableSet<E>",
    ],
  },
  Map: {
    instance: [
      "put(K key, V value): V", "get(Object key): V", "getOrDefault(Object key, V def): V", "containsKey(Object key): boolean",
      "containsValue(Object value): boolean", "remove(Object key): V", "size(): int", "isEmpty(): boolean", "clear(): void",
      "keySet(): Set<K>", "values(): Collection<V>", "entrySet(): Set<Map.Entry<K, V>>", "putIfAbsent(K key, V value): V",
      "computeIfAbsent(K key, Function fn): V", "computeIfPresent(K key, BiFunction fn): V", "compute(K key, BiFunction fn): V",
      "merge(K key, V value, BiFunction fn): V", "forEach(BiConsumer action): void",
    ],
    statics: ["of(K k1, V v1): Map<K, V>", "entry(K k, V v): Map.Entry<K, V>", "copyOf(Map m): Map<K, V>"],
  },
  HashMap: { extends: ["Map"] },
  LinkedHashMap: { extends: ["Map"] },
  TreeMap: {
    extends: ["Map"],
    instance: [
      "firstKey(): K", "lastKey(): K", "floorKey(K key): K", "ceilingKey(K key): K", "lowerKey(K key): K", "higherKey(K key): K",
      "firstEntry(): Map.Entry<K, V>", "lastEntry(): Map.Entry<K, V>", "floorEntry(K key): Map.Entry<K, V>",
      "ceilingEntry(K key): Map.Entry<K, V>", "pollFirstEntry(): Map.Entry<K, V>", "pollLastEntry(): Map.Entry<K, V>",
      "headMap(K to): SortedMap<K, V>", "tailMap(K from): SortedMap<K, V>", "descendingMap(): NavigableMap<K, V>",
    ],
  },
  Entry: { instance: ["getKey(): K", "getValue(): V", "setValue(V value): V"] },
  Iterator: { instance: ["hasNext(): boolean", "next(): E", "remove(): void"] },
  PrintStream: { instance: ["println(Object x): void", "print(Object x): void", "printf(String fmt, Object args): PrintStream"] },
  Math: {
    statics: [
      "max(int a, int b): int", "min(int a, int b): int", "abs(int a): int", "pow(double a, double b): double",
      "sqrt(double a): double", "floor(double a): double", "ceil(double a): double", "log(double a): double",
      "random(): double", "floorMod(int x, int y): int", "floorDiv(int x, int y): int", "addExact(int a, int b): int",
      "multiplyExact(long a, long b): long", "hypot(double x, double y): double", "signum(double d): double",
      "PI: double", "E: double",
    ],
  },
  Arrays: {
    statics: [
      "sort(int[] a): void", "sort(T[] a, Comparator c): void", "fill(int[] a, int val): void", "asList(T... a): List<T>",
      "copyOf(int[] a, int newLength): int[]", "copyOfRange(int[] a, int from, int to): int[]", "equals(int[] a, int[] b): boolean",
      "toString(int[] a): String", "deepToString(Object[] a): String", "stream(int[] a): IntStream",
      "binarySearch(int[] a, int key): int", "hashCode(int[] a): int",
    ],
  },
  Collections: {
    statics: [
      "sort(List list): void", "reverse(List list): void", "swap(List list, int i, int j): void", "max(Collection c): T",
      "min(Collection c): T", "frequency(Collection c, Object o): int", "shuffle(List list): void",
      "reverseOrder(): Comparator<T>", "emptyList(): List<T>", "unmodifiableList(List list): List<T>", "nCopies(int n, T o): List<T>",
    ],
  },
  Integer: {
    instance: ["intValue(): int", "compareTo(Integer other): int"],
    statics: [
      "MAX_VALUE: int", "MIN_VALUE: int", "parseInt(String s): int", "valueOf(int i): Integer", "toString(int i): String",
      "toBinaryString(int i): String", "bitCount(int i): int", "compare(int x, int y): int", "highestOneBit(int i): int",
      "lowestOneBit(int i): int", "numberOfTrailingZeros(int i): int", "numberOfLeadingZeros(int i): int", "sum(int a, int b): int",
    ],
  },
  Long: {
    instance: ["longValue(): long", "compareTo(Long other): int"],
    statics: ["MAX_VALUE: long", "MIN_VALUE: long", "parseLong(String s): long", "valueOf(long l): Long", "compare(long x, long y): int", "bitCount(long l): int", "toBinaryString(long l): String"],
  },
  Double: { statics: ["MAX_VALUE: double", "MIN_VALUE: double", "POSITIVE_INFINITY: double", "NEGATIVE_INFINITY: double", "parseDouble(String s): double", "compare(double a, double b): int", "isNaN(double d): boolean"] },
  Character: {
    statics: [
      "isDigit(char ch): boolean", "isLetter(char ch): boolean", "isLetterOrDigit(char ch): boolean", "isUpperCase(char ch): boolean",
      "isLowerCase(char ch): boolean", "isWhitespace(char ch): boolean", "toUpperCase(char ch): char", "toLowerCase(char ch): char",
      "getNumericValue(char ch): int",
    ],
  },
  Boolean: { statics: ["parseBoolean(String s): boolean", "TRUE: Boolean", "FALSE: Boolean"] },
  System: { statics: ["out: PrintStream", "err: PrintStream", "arraycopy(Object src, int srcPos, Object dest, int destPos, int length): void", "currentTimeMillis(): long", "nanoTime(): long"] },
  Objects: { statics: ["equals(Object a, Object b): boolean", "hash(Object... values): int", "requireNonNull(T obj): T", "isNull(Object o): boolean", "nonNull(Object o): boolean"] },
  Comparator: {
    instance: ["reversed(): Comparator<T>", "thenComparing(Comparator other): Comparator<T>", "thenComparingInt(ToIntFunction key): Comparator<T>", "compare(T a, T b): int"],
    statics: ["comparingInt(ToIntFunction key): Comparator<T>", "comparing(Function key): Comparator<T>", "naturalOrder(): Comparator<T>", "reverseOrder(): Comparator<T>"],
  },
  Stream: {
    instance: [
      "map(Function fn): Stream<R>", "filter(Predicate p): Stream<T>", "mapToInt(ToIntFunction fn): IntStream", "sorted(): Stream<T>",
      "distinct(): Stream<T>", "limit(long n): Stream<T>", "count(): long", "collect(Collector c): R", "toList(): List<T>",
      "forEach(Consumer action): void", "anyMatch(Predicate p): boolean", "allMatch(Predicate p): boolean",
      "reduce(T identity, BinaryOperator op): T", "findFirst(): Optional<T>",
    ],
  },
  IntStream: {
    instance: ["sum(): int", "max(): OptionalInt", "min(): OptionalInt", "average(): OptionalDouble", "boxed(): Stream<Integer>", "toArray(): int[]", "map(IntUnaryOperator fn): IntStream", "filter(IntPredicate p): IntStream", "count(): long"],
    statics: ["range(int start, int end): IntStream", "rangeClosed(int start, int end): IntStream", "of(int... values): IntStream"],
  },
  Collectors: { statics: ["toList(): Collector", "toSet(): Collector", "joining(CharSequence sep): Collector", "groupingBy(Function key): Collector", "counting(): Collector", "toMap(Function k, Function v): Collector"] },
  Random: { instance: ["nextInt(int bound): int", "nextLong(): long", "nextDouble(): double", "nextBoolean(): boolean"] },
  Optional: { instance: ["isPresent(): boolean", "isEmpty(): boolean", "get(): T", "orElse(T other): T"], statics: ["of(T value): Optional<T>", "empty(): Optional<T>", "ofNullable(T value): Optional<T>"] },
};

/** Pacote de cada classe que precisa de import (java.lang fica de fora). */
const PACKAGES: Record<string, string> = {};
for (const n of "List ArrayList LinkedList Map HashMap TreeMap LinkedHashMap Set HashSet TreeSet LinkedHashSet Deque ArrayDeque Queue PriorityQueue Stack Iterator Arrays Collections Objects Comparator Random Scanner Optional StringJoiner BitSet Collection".split(" "))
  PACKAGES[n] = "java.util";
for (const n of "Function BiFunction Predicate Supplier Consumer BiConsumer".split(" ")) PACKAGES[n] = "java.util.function";
for (const n of "Collectors IntStream Stream".split(" ")) PACKAGES[n] = "java.util.stream";

const LANG_CLASSES = "String StringBuilder Math Integer Long Double Character Boolean System Object Exception RuntimeException IllegalArgumentException IllegalStateException UnsupportedOperationException IndexOutOfBoundsException Iterable Comparable".split(" ");

const KEYWORDS = "abstract break case catch class continue default do else enum extends final finally for if implements import instanceof interface new null private protected public record return static super switch this throw throws true false try var void while yield".split(" ");
const PRIMITIVES = "int long double float boolean char byte short".split(" ");

const SNIPPETS: Completion[] = [
  snippetCompletion("System.out.println(${});", { label: "sout", detail: "System.out.println", type: "snippet" }),
  snippetCompletion('System.out.printf("${fmt}%n", ${args});', { label: "souf", detail: "System.out.printf", type: "snippet" }),
  snippetCompletion("for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", { label: "fori", detail: "laço com índice", type: "snippet" }),
  snippetCompletion("for (int ${i} = ${n} - 1; ${i} >= 0; ${i}--) {\n\t${}\n}", { label: "forr", detail: "laço reverso", type: "snippet" }),
  snippetCompletion("for (${int} ${x} : ${array}) {\n\t${}\n}", { label: "fore", detail: "for-each", type: "snippet" }),
  snippetCompletion("for (Map.Entry<${K}, ${V}> ${e} : ${map}.entrySet()) {\n\t${}\n}", { label: "forentry", detail: "percorrer Map", type: "snippet" }),
  snippetCompletion("while (${cond}) {\n\t${}\n}", { label: "while", detail: "bloco while", type: "snippet" }),
  snippetCompletion("if (${cond}) {\n\t${}\n}", { label: "if", detail: "bloco if", type: "snippet" }),
  snippetCompletion("if (${cond}) {\n\t${}\n} else {\n\t\n}", { label: "ifelse", detail: "if / else", type: "snippet" }),
  snippetCompletion("try {\n\t${}\n} catch (${Exception} e) {\n\t\n}", { label: "tryc", detail: "try / catch", type: "snippet" }),
  snippetCompletion("public static void main(String[] args) {\n\t${}\n}", { label: "psvm", detail: "método main", type: "snippet" }),
  snippetCompletion('throw new IllegalArgumentException("${msg}");', { label: "thr", detail: "lançar exceção", type: "snippet" }),
];

// ---------------------------------------------------------------------------
// Membros: parse do catálogo -> Completion
// ---------------------------------------------------------------------------

function memberCompletion(sig: string, isStatic: boolean, boost = 0): Completion {
  const paren = sig.indexOf("(");
  if (paren < 0) {
    const [name, type] = sig.split(":").map((s) => s.trim());
    const constant = /^[A-Z_]+$/.test(name);
    return { label: name, detail: type, type: constant ? "constant" : "property", boost };
  }
  const name = sig.slice(0, paren);
  const close = sig.indexOf(")");
  const params = sig.slice(paren + 1, close).trim();
  const ret = sig.slice(close + 1).replace(/^\s*:\s*/, "");
  const names = params ? params.split(",").map((p) => p.trim().split(/\s+/).pop()!.replace(/\W/g, "")) : [];
  const body = names.map((n) => "${" + n + "}").join(", ");
  return snippetCompletion(`${name}(${body})`, {
    label: name,
    detail: `(${params})${ret ? " → " + ret : ""}`,
    type: isStatic ? "function" : "method",
    boost,
  });
}

const cache = new Map<string, Completion[]>();

function jdkMembers(typeName: string, kind: "instance" | "statics"): Completion[] | null {
  const key = typeName + "#" + kind;
  if (cache.has(key)) return cache.get(key)!;
  if (!JDK[typeName]) return null;
  const out: Completion[] = [];
  const seen = new Set<string>();
  const visit = (name: string, depth: number) => {
    const info = JDK[name];
    if (!info) return;
    for (const sig of info[kind] ?? []) {
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(memberCompletion(sig, kind === "statics", -depth));
    }
    for (const parent of info.extends ?? []) visit(parent, depth + 1);
  };
  visit(typeName, 0);
  if (kind === "instance") visit("Object", 5);
  cache.set(key, out);
  return out;
}

let allInstance: Completion[] | null = null;
function anyInstanceMembers(): Completion[] {
  if (allInstance) return allInstance;
  const seen = new Set<string>();
  allInstance = [];
  for (const name of Object.keys(JDK))
    for (const c of jdkMembers(name, "instance") ?? [])
      if (!seen.has(c.label + c.detail)) {
        seen.add(c.label + c.detail);
        allInstance.push({ ...c, boost: -10 });
      }
  return allInstance;
}

// ---------------------------------------------------------------------------
// Símbolos do próprio código (via árvore de sintaxe)
// ---------------------------------------------------------------------------

type Symbol = {
  name: string;
  kind: "class" | "method" | "field" | "variable";
  type?: string; // tipo base declarado ("List", "int", "Node", "array")
  owner?: string; // classe que declara (para campos e métodos)
  detail?: string;
  pos: number;
  isStatic?: boolean;
};

const TYPE_NODES = new Set(["TypeName", "GenericType", "ArrayType", "PrimitiveType", "ScopedTypeName"]);
const CLASS_NODES = new Set(["ClassDeclaration", "InterfaceDeclaration", "EnumDeclaration", "RecordDeclaration"]);

function baseType(state: EditorState, node: SyntaxNode | null): string | undefined {
  if (!node) return undefined;
  const text = state.sliceDoc(node.from, node.to).trim();
  if (/\[\s*\]\s*$/.test(text)) return "array";
  const raw = text.replace(/<[\s\S]*$/, "").trim();
  const last = raw.split(".").pop()!;
  return last === "var" ? undefined : last;
}

function typeBefore(node: SyntaxNode): SyntaxNode | null {
  for (let s = node.prevSibling; s; s = s.prevSibling) if (TYPE_NODES.has(s.name)) return s;
  return null;
}

function enclosingClass(state: EditorState, node: SyntaxNode): string | undefined {
  for (let p = node.parent; p; p = p.parent)
    if (CLASS_NODES.has(p.name)) {
      const def = p.getChild("Definition");
      return def ? state.sliceDoc(def.from, def.to) : undefined;
    }
  return undefined;
}

function hasStatic(state: EditorState, decl: SyntaxNode): boolean {
  const mods = decl.getChild("Modifiers");
  return !!mods && /\bstatic\b/.test(state.sliceDoc(mods.from, mods.to));
}

function collectSymbols(state: EditorState): Symbol[] {
  const out: Symbol[] = [];
  syntaxTree(state).iterate({
    enter(ref) {
      if (ref.name !== "Definition") return;
      const node = ref.node;
      const parent = node.parent;
      if (!parent) return;
      const name = state.sliceDoc(node.from, node.to);
      if (CLASS_NODES.has(parent.name)) {
        out.push({ name, kind: "class", pos: node.from, detail: parent.name.replace("Declaration", "").toLowerCase() });
      } else if (parent.name === "MethodDeclaration") {
        const params = parent.getChild("FormalParameters");
        out.push({
          name,
          kind: "method",
          owner: enclosingClass(state, parent),
          type: baseType(state, typeBefore(node)),
          detail: params ? state.sliceDoc(params.from, params.to).replace(/\s+/g, " ") : "()",
          pos: node.from,
          isStatic: hasStatic(state, parent),
        });
      } else if (parent.name === "VariableDeclarator") {
        const decl = parent.parent;
        if (!decl) return;
        const field = decl.name === "FieldDeclaration";
        const tNode = typeBefore(parent);
        let type = baseType(state, tNode);
        // "int[] a" já veio como array; "int a[]" também conta.
        if (parent.getChild("Dimension")) type = "array";
        out.push({
          name,
          kind: field ? "field" : "variable",
          type,
          owner: field ? enclosingClass(state, decl) : undefined,
          detail: tNode ? state.sliceDoc(tNode.from, tNode.to).trim() : undefined,
          pos: node.from,
          isStatic: field && hasStatic(state, decl),
        });
      } else {
        // Parâmetros, for-each, catch, lambdas tipados.
        const tNode = typeBefore(node);
        out.push({
          name,
          kind: "variable",
          type: baseType(state, tNode),
          detail: tNode ? state.sliceDoc(tNode.from, tNode.to).trim() : undefined,
          pos: node.from,
        });
      }
    },
  });
  return out;
}

/** Declaração mais próxima antes do cursor (aproxima o escopo léxico). */
function findVar(symbols: Symbol[], name: string, pos: number): Symbol | undefined {
  const all = symbols.filter((s) => s.name === name && (s.kind === "variable" || s.kind === "field"));
  const before = all.filter((s) => s.pos <= pos);
  return before.length ? before.reduce((a, b) => (b.pos > a.pos ? b : a)) : all[0];
}

function userClassMembers(symbols: Symbol[], cls: string, onlyStatic: boolean): Completion[] {
  return symbols
    .filter((s) => s.owner === cls && (s.kind === "method" || s.kind === "field") && (!onlyStatic || s.isStatic))
    .map((s) =>
      s.kind === "method"
        ? snippetCompletion(`${s.name}(${paramSnippet(s.detail)})`, { label: s.name, detail: s.detail + (s.type ? " → " + s.type : ""), type: "method", boost: 2 })
        : { label: s.name, detail: s.detail, type: "property", boost: 2 },
    );
}

function paramSnippet(params?: string): string {
  const inner = (params ?? "()").replace(/^\(|\)$/g, "").trim();
  if (!inner) return "";
  return splitTopLevel(inner)
    .map((p) => "${" + (p.trim().split(/\s+/).pop() ?? "x").replace(/\W/g, "") + "}")
    .join(", ");
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "<") depth++;
    if (ch === ">") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

// ---------------------------------------------------------------------------
// Resolução de "a.b.c." -> lista de membros
// ---------------------------------------------------------------------------

type Resolved = { type: string; statics: boolean } | null;

function resolveChain(chain: string[], symbols: Symbol[], pos: number, state: EditorState, at: number): Resolved {
  const userClasses = new Set(symbols.filter((s) => s.kind === "class").map((s) => s.name));
  let cur: Resolved = null;
  chain.forEach((seg, i) => {
    if (i === 0) {
      if (seg === "this") {
        const node = syntaxTree(state).resolveInner(at, -1);
        const cls = enclosingClass(state, node);
        cur = cls ? { type: cls, statics: false } : null;
        return;
      }
      const v = findVar(symbols, seg, pos);
      if (v?.type) cur = { type: v.type, statics: false };
      else if (JDK[seg] || userClasses.has(seg)) cur = { type: seg, statics: true };
      else cur = null;
      return;
    }
    const prev = cur as Resolved;
    if (!prev) return;
    // Campo de classe do usuário, campo estático do JDK ou Map.Entry.
    const field = symbols.find((s) => s.kind === "field" && s.owner === prev.type && s.name === seg);
    if (field?.type) cur = { type: field.type, statics: false };
    else if (prev.type === "System" && (seg === "out" || seg === "err")) cur = { type: "PrintStream", statics: false };
    else if (prev.type === "Map" && seg === "Entry") cur = { type: "Entry", statics: true };
    else cur = null;
  });
  return cur;
}

function membersOf(r: NonNullable<Resolved>, symbols: Symbol[]): Completion[] {
  if (r.type === "array") return [{ label: "length", detail: "int", type: "property" }, memberCompletion("clone(): T[]", false, -1)];
  const isUser = symbols.some((s) => s.kind === "class" && s.name === r.type);
  if (isUser) {
    const own = userClassMembers(symbols, r.type, r.statics);
    return r.statics ? own : [...own, ...(jdkMembers("Object", "instance") ?? [])];
  }
  const fromJdk = jdkMembers(r.type, r.statics ? "statics" : "instance");
  if (fromJdk) {
    // Map.Entry aparece como membro estático de Map.
    if (r.type === "Map" && r.statics) return [...fromJdk, { label: "Entry", detail: "interface", type: "interface" }];
    return fromJdk;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Import automático
// ---------------------------------------------------------------------------

function importChange(state: EditorState, cls: string): { from: number; insert: string } | null {
  const pkg = PACKAGES[cls];
  if (!pkg) return null;
  const doc = state.doc.toString();
  const already = new RegExp(`^\\s*import\\s+${pkg.replace(/\./g, "\\.")}\\.(\\*|${cls})\\s*;`, "m");
  if (already.test(doc)) return null;
  const imports = [...doc.matchAll(/^\s*import\s+[\w.*]+\s*;[ \t]*$/gm)];
  if (imports.length) {
    const last = imports[imports.length - 1];
    return { from: last.index! + last[0].length, insert: `\nimport ${pkg}.${cls};` };
  }
  const pkgDecl = /^\s*package\s+[\w.]+\s*;[ \t]*$/m.exec(doc);
  if (pkgDecl) return { from: pkgDecl.index + pkgDecl[0].length, insert: `\n\nimport ${pkg}.${cls};` };
  return { from: 0, insert: `import ${pkg}.${cls};\n\n` };
}

function classCompletion(cls: string, boost: number): Completion {
  const pkg = PACKAGES[cls] ?? "java.lang";
  return {
    label: cls,
    detail: pkg,
    type: "class",
    boost,
    apply: (view: EditorView, _c: Completion, from: number, to: number) => {
      const imp = importChange(view.state, cls);
      const changes = [{ from, to, insert: cls }];
      if (imp) changes.push({ from: imp.from, to: imp.from, insert: imp.insert });
      const shift = imp && imp.from <= from ? imp.insert.length : 0;
      view.dispatch({ changes, selection: { anchor: from + cls.length + shift }, userEvent: "input.complete" });
    },
  };
}

// ---------------------------------------------------------------------------
// Fonte de completions
// ---------------------------------------------------------------------------

const SKIP_NODES = new Set(["LineComment", "BlockComment", "StringLiteral", "TextBlock", "CharacterLiteral"]);
const IDENT = /^[\w$]*$/;

export function javaCompletions(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context;
  const inner = syntaxTree(state).resolveInner(pos, -1);
  for (let n: SyntaxNode | null = inner; n; n = n.parent) if (SKIP_NODES.has(n.name)) return null;

  const symbols = collectSymbols(state);

  // Acesso a membro: "obj.", "Math.ab", "System.out.pr", "this.x".
  const member = context.matchBefore(/(?:[A-Za-z_$][\w$]*\s*\.\s*)+[\w$]*$/);
  if (member) {
    const text = member.text;
    const lastDot = text.lastIndexOf(".");
    const chain = text.slice(0, lastDot).split(".").map((s) => s.trim());
    const from = member.from + lastDot + 1 + (text.slice(lastDot + 1).length - text.slice(lastDot + 1).trimStart().length);
    // Nome qualificado ("import java.util.") lista as classes do pacote.
    if (chain[0] === "java" || chain[0] === "javax") {
      const pkg = chain.join(".");
      const classes = Object.keys(PACKAGES).filter((c) => PACKAGES[c] === pkg);
      const subs = [...new Set(Object.values(PACKAGES).filter((p) => p.startsWith(pkg + ".")).map((p) => p.slice(pkg.length + 1).split(".")[0]))];
      const options: Completion[] = [
        ...classes.map((c) => ({ label: c, type: "class" })),
        ...subs.map((s) => ({ label: s, type: "namespace" })),
        ...(classes.length ? [{ label: "*", type: "keyword", detail: "todas as classes", boost: 1 }] : []),
      ];
      return { from, options, validFor: /^[\w$*]*$/ };
    }
    {
      const resolved = resolveChain(chain, symbols, member.from, state, pos);
      const options = resolved ? membersOf(resolved, symbols) : [];
      return { from, options: options.length ? options : anyInstanceMembers(), validFor: IDENT };
    }
  }
  // "arr[i]." ou "foo()." -> não dá para inferir; oferece membros comuns.
  const afterDot = context.matchBefore(/[)\]]\s*\.\s*[\w$]*$/);
  if (afterDot) {
    const word = context.matchBefore(/[\w$]*$/)!;
    return { from: word.from, options: anyInstanceMembers(), validFor: IDENT };
  }

  // Anotações.
  const anno = context.matchBefore(/@[\w$]*$/);
  if (anno)
    return {
      from: anno.from + 1,
      options: ["Override", "FunctionalInterface", "SuppressWarnings", "Deprecated"].map((label) => ({ label, type: "type" })),
      validFor: IDENT,
    };

  const word = context.matchBefore(/[\w$]*$/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const options: Completion[] = [];
  const seen = new Set<string>();
  const push = (c: Completion) => {
    if (seen.has(c.label)) return;
    seen.add(c.label);
    options.push(c);
  };

  // Variáveis mais próximas do cursor primeiro.
  const locals = symbols
    .filter((s) => s.kind === "variable" || s.kind === "field")
    .sort((a, b) => Math.abs(pos - a.pos) - Math.abs(pos - b.pos));
  for (const s of locals) if (s.pos < pos || s.kind === "field") push({ label: s.name, detail: s.detail, type: s.kind === "field" ? "property" : "variable", boost: s.kind === "field" ? 6 : 8 });
  for (const s of symbols)
    if (s.kind === "method")
      push(snippetCompletion(`${s.name}(${paramSnippet(s.detail)})`, { label: s.name, detail: s.detail + (s.type ? " → " + s.type : ""), type: "method", boost: 5 }));
  for (const s of symbols) if (s.kind === "class") push({ label: s.name, detail: s.detail, type: "class", boost: 4 });

  for (const s of SNIPPETS) push(s);
  for (const c of LANG_CLASSES) push(classCompletion(c, 1));
  for (const c of Object.keys(PACKAGES)) push(classCompletion(c, 1));
  for (const p of PRIMITIVES) push({ label: p, type: "type", boost: 0 });
  for (const k of KEYWORDS) push({ label: k, type: "keyword", boost: -1 });

  return { from: word.from, options, validFor: IDENT };
}
