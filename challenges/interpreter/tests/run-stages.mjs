#!/usr/bin/env node
/**
 * Tester local do desafio Interpreter (linguagem Lox, do livro Crafting Interpreters).
 *
 * Executa `java -jar target/interpreter.jar <comando> <arquivo.lox>` e confere stdout, código
 * de saída e, nos erros, a linha reportada no stderr.
 *
 *   - scanning (tokenize): fontes aleatórias comparadas com um scanner de referência em JS;
 *   - parsing/evaluating: expressões aleatórias geradas a partir da gramática, com a árvore e o
 *     valor esperados calculados pelo próprio gerador;
 *   - run: programas escritos para cada stage, com nomes e valores sorteados.
 *
 * Uso:
 *   node challenges/interpreter/tests/run-stages.mjs
 *   node challenges/interpreter/tests/run-stages.mjs --dir <workspace> --no-build [--only 1,2]
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const WORDS = ["abacaxi", "banana", "caju", "damasco", "figo", "goiaba", "jaca", "kiwi", "limao", "manga", "pitanga", "uva"];
const NAMES = ["alfa", "beta", "gama", "delta", "omega", "sigma", "kappa", "zeta", "theta", "lambda"];

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

function rand(min, max) {
  return min + crypto.randomInt(max - min + 1);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** n nomes distintos (para variáveis, funções, classes). */
function names(n, pool = NAMES) {
  return shuffle(pool).slice(0, n);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function show(text) {
  return JSON.stringify(text);
}

/** Formato de número do Java (Double.toString) no intervalo usado pelos testes. */
function javaDouble(n) {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

/** Como o Lox imprime um valor. */
function stringify(value) {
  if (value === null) return "nil";
  if (typeof value === "number") return String(value);
  return String(value);
}

// --------------------------------------------------------------------- execução

let logs = "";

function runLox(ctx, command, source) {
  return new Promise((resolve) => {
    const file = path.join(ctx.tmp, `teste-${crypto.randomBytes(4).toString("hex")}.lox`);
    fs.writeFile(file, source).then(() => {
      const child = spawn("java", ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", ctx.jar, command, file], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout = [];
      const stderr = [];
      const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout: "", stderr: error.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const out = Buffer.concat(stdout).toString("utf8").replaceAll("\r\n", "\n");
        const err = Buffer.concat(stderr).toString("utf8").replaceAll("\r\n", "\n");
        logs += `$ ./your_program.sh ${command} teste.lox\n--- teste.lox ---\n${source}\n--- saída (código ${code}) ---\n${out}${err}\n`;
        fs.rm(file, { force: true }).catch(() => {});
        resolve({ code, stdout: out, stderr: err });
      });
    });
  });
}

function label(command, source) {
  const shown = source.length > 400 ? `${source.slice(0, 400)}...` : source;
  return `${command} de:\n${shown.split("\n").map((l) => `      ${l}`).join("\n")}\n  `;
}

function compareOutput(result, expectedLines, title) {
  const expected = expectedLines.map((l) => `${l}\n`).join("");
  if (result.stdout === expected) return;
  const got = result.stdout.split("\n");
  const want = expected.split("\n");
  let i = 0;
  while (i < got.length && got[i] === want[i]) i++;
  throw new Error(
    `${title} stdout diferente na linha ${i + 1}: esperava ${show(want[i] ?? "(fim)")}, recebeu ${show(got[i] ?? "(fim)")}` +
      (result.stderr ? `\n   stderr: ${result.stderr.trim().split("\n").slice(0, 3).join(" | ")}` : "")
  );
}

/**
 * Roda e confere. `stdout`: linhas esperadas; `code`: código de saída; `errors`: lista de
 * {line, message?} que devem aparecer no stderr.
 */
async function check(ctx, command, source, { stdout = [], code = 0, errors = [] } = {}) {
  const result = await runLox(ctx, command, source);
  const title = label(command, source);
  if (code === 0 && result.code !== 0) {
    throw new Error(`${title} terminou com código ${result.code}, esperava 0\n   stderr: ${result.stderr.trim().split("\n").slice(0, 3).join(" | ")}`);
  }
  compareOutput(result, stdout, title);
  assert(result.code === code, `${title} código de saída ${result.code}, esperava ${code}`);
  for (const { line, message } of errors) {
    if (message) {
      assert(
        result.stderr.includes(message),
        `${title} o stderr deveria conter ${show(message)}; recebeu ${show(result.stderr.trim())}`
      );
    }
    assert(result.stderr.includes(`[line ${line}]`), `${title} o erro deveria apontar [line ${line}]; stderr: ${show(result.stderr.trim())}`);
  }
}

const run = (ctx, source, stdout) => check(ctx, "run", source, { stdout });
const runError = (ctx, source, { stdout = [], code, line, message }) =>
  check(ctx, "run", source, { stdout, code, errors: [{ line, message }] });

// ------------------------------------------------------------- scanner de referência

const KEYWORDS = ["and", "class", "else", "false", "for", "fun", "if", "nil", "or", "print", "return", "super", "this", "true", "var", "while"];
const SINGLE = { "(": "LEFT_PAREN", ")": "RIGHT_PAREN", "{": "LEFT_BRACE", "}": "RIGHT_BRACE", ",": "COMMA", ".": "DOT", "-": "MINUS", "+": "PLUS", ";": "SEMICOLON", "*": "STAR" };
const DOUBLE = { "!": ["BANG", "BANG_EQUAL"], "=": ["EQUAL", "EQUAL_EQUAL"], "<": ["LESS", "LESS_EQUAL"], ">": ["GREATER", "GREATER_EQUAL"] };

function scan(source) {
  const out = [];
  const errors = [];
  let line = 1;
  let i = 0;
  const isDigit = (c) => c >= "0" && c <= "9";
  const isAlpha = (c) => /[A-Za-z_]/.test(c);
  while (i < source.length) {
    const c = source[i];
    if (SINGLE[c]) {
      out.push(`${SINGLE[c]} ${c} null`);
      i++;
    } else if (DOUBLE[c]) {
      if (source[i + 1] === "=") {
        out.push(`${DOUBLE[c][1]} ${c}= null`);
        i += 2;
      } else {
        out.push(`${DOUBLE[c][0]} ${c} null`);
        i++;
      }
    } else if (c === "/") {
      if (source[i + 1] === "/") {
        while (i < source.length && source[i] !== "\n") i++;
      } else {
        out.push("SLASH / null");
        i++;
      }
    } else if (c === " " || c === "\t" || c === "\r") {
      i++;
    } else if (c === "\n") {
      line++;
      i++;
    } else if (c === '"') {
      let j = i + 1;
      let lines = 0;
      while (j < source.length && source[j] !== '"') {
        if (source[j] === "\n") lines++;
        j++;
      }
      line += lines;
      if (j >= source.length) {
        errors.push(`[line ${line}] Error: Unterminated string.`);
        i = j;
      } else {
        const text = source.slice(i + 1, j);
        out.push(`STRING "${text}" ${text}`);
        i = j + 1;
      }
    } else if (isDigit(c)) {
      let j = i;
      while (isDigit(source[j] ?? "")) j++;
      if (source[j] === "." && isDigit(source[j + 1] ?? "")) {
        j++;
        while (isDigit(source[j] ?? "")) j++;
      }
      const text = source.slice(i, j);
      out.push(`NUMBER ${text} ${javaDouble(Number(text))}`);
      i = j;
    } else if (isAlpha(c)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      const text = source.slice(i, j);
      out.push(KEYWORDS.includes(text) ? `${text.toUpperCase()} ${text} null` : `IDENTIFIER ${text} null`);
      i = j;
    } else {
      errors.push(`[line ${line}] Error: Unexpected character: ${c}`);
      i++;
    }
  }
  out.push("EOF  null");
  return { stdout: out, errors, code: errors.length ? 65 : 0 };
}

async function checkTokenize(ctx, source) {
  const expected = scan(source);
  const result = await runLox(ctx, "tokenize", source);
  const title = label("tokenize", source);
  compareOutput(result, expected.stdout, title);
  assert(result.code === expected.code, `${title} código de saída ${result.code}, esperava ${expected.code}`);
  const errLines = result.stderr.split("\n").filter(Boolean);
  for (const error of expected.errors) {
    assert(errLines.includes(error), `${title} o stderr deveria ter a linha ${show(error)}; recebeu ${show(result.stderr.trim())}`);
  }
}

/** Junta pedaços com separadores sorteados. */
function joinRandom(parts, separators) {
  return parts.map((p, i) => (i === 0 ? p : pick(separators) + p)).join("");
}

function randomTokens(pool, count) {
  return Array.from({ length: count }, () => pick(pool));
}

// -------------------------------------------------- gerador de expressões (com valores)

/**
 * Cada nó gerado tem: src (código Lox), tree (o que `parse` imprime) e value (o resultado de
 * `evaluate`). A geração segue a gramática, então o parser reconstrói exatamente a mesma árvore.
 */
function numberLiteral() {
  const n = crypto.randomInt(4) === 0 ? rand(1, 99) + pick([0.5, 0.25, 0.75]) : rand(1, 99);
  return { src: String(n), tree: javaDouble(n), value: n };
}

function stringLiteral() {
  const word = pick(WORDS);
  return { src: `"${word}"`, tree: word, value: word };
}

const BOOL_LITERALS = [
  { src: "true", tree: "true", value: true },
  { src: "false", tree: "false", value: false },
  { src: "nil", tree: "nil", value: null },
];

function group(node) {
  return { src: `(${node.src})`, tree: `(group ${node.tree})`, value: node.value };
}

function binary(op, left, right, value) {
  return { src: `${left.src} ${op} ${right.src}`, tree: `(${op} ${left.tree} ${right.tree})`, value };
}

function unary(op, node, value) {
  return { src: `${op}${node.src}`, tree: `(${op} ${node.tree})`, value };
}

const niceNumber = (v) => typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0) && Math.abs(v) < 1e6 && (v === 0 || Math.abs(v) >= 0.01) && Math.round(v * 10000) === v * 10000;

/** Expressão numérica: term → factor → unary → primary. */
function numExpr(depth, { unaryOps = true, factorOps = true, termOps = true, groups = true } = {}) {
  const opts = { unaryOps, factorOps, termOps, groups };
  const primary = (d) => (groups && d > 0 && crypto.randomInt(3) === 0 ? group(numExpr(d - 1, opts)) : numberLiteral());
  const unaryNode = (d) => (unaryOps && crypto.randomInt(4) === 0 ? (() => {
    const inner = primary(d);
    return unary("-", inner, -inner.value);
  })() : primary(d));
  const factor = (d) => {
    let node = unaryNode(d);
    const count = factorOps ? crypto.randomInt(3) : 0;
    for (let i = 0; i < count; i++) {
      if (crypto.randomInt(2) === 0) {
        const right = unaryNode(d);
        node = binary("*", node, right, node.value * right.value);
      } else {
        const divisor = pick([2, 4, 5, 8]);
        node = binary("/", node, { src: String(divisor), tree: javaDouble(divisor), value: divisor }, node.value / divisor);
      }
    }
    return node;
  };
  let node = factor(depth);
  const count = termOps ? crypto.randomInt(3) : 0;
  for (let i = 0; i < count; i++) {
    const right = factor(depth);
    node = crypto.randomInt(2) === 0 ? binary("+", node, right, node.value + right.value) : binary("-", node, right, node.value - right.value);
  }
  return node;
}

/** Gera até a expressão ter um valor "bem comportado" (sem -0, sem notação científica). */
function niceNum(depth, options) {
  for (;;) {
    const node = numExpr(depth, options);
    if (niceNumber(node.value) && !hasBadIntermediate(node)) return node;
  }
}

function hasBadIntermediate(node) {
  return node.src.length > 120;
}

function comparison(depth) {
  const left = niceNum(depth);
  const right = niceNum(depth);
  const op = pick(["<", "<=", ">", ">="]);
  const value = { "<": left.value < right.value, "<=": left.value <= right.value, ">": left.value > right.value, ">=": left.value >= right.value }[op];
  return binary(op, left, right, value);
}

function equalityOperand() {
  const kind = crypto.randomInt(4);
  if (kind === 0) return stringLiteral();
  if (kind === 1) return pick(BOOL_LITERALS);
  if (kind === 2) return niceNum(1);
  return comparison(0);
}

function looxEquals(a, b) {
  return a === b;
}

function equality() {
  const left = equalityOperand();
  const right = crypto.randomInt(3) === 0 ? { ...left } : equalityOperand();
  const op = pick(["==", "!="]);
  return binary(op, left, right, op === "==" ? looxEquals(left.value, right.value) : !looxEquals(left.value, right.value));
}

function stringConcat() {
  let node = stringLiteral();
  const count = rand(1, 3);
  for (let i = 0; i < count; i++) {
    const right = crypto.randomInt(3) === 0 ? group(stringLiteral()) : stringLiteral();
    node = binary("+", node, right, node.value + right.value);
  }
  return node;
}

async function checkParse(ctx, node) {
  await check(ctx, "parse", node.src, { stdout: [node.tree] });
}

async function checkEvaluate(ctx, node) {
  await check(ctx, "evaluate", node.src, { stdout: [stringify(node.value)] });
}

// ------------------------------------------------------------------------ stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

// Scanning --------------------------------------------------------------------------

stage(1, "Scanning: Empty file", async (ctx) => {
  await checkTokenize(ctx, "");
});

stage(2, "Scanning: Parentheses", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkTokenize(ctx, randomTokens(["(", ")"], rand(2, 8)).join(""));
});

stage(3, "Scanning: Braces", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkTokenize(ctx, randomTokens(["(", ")", "{", "}"], rand(4, 10)).join(""));
});

stage(4, "Scanning: Other single-character tokens", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkTokenize(ctx, randomTokens(["(", ")", "{", "}", ",", ".", "-", "+", ";", "*"], rand(5, 12)).join(""));
});

stage(5, "Scanning: Lexical errors", async (ctx) => {
  await checkTokenize(ctx, "@");
  for (let i = 0; i < 3; i++) {
    await checkTokenize(ctx, randomTokens(["(", ")", "{", "}", ",", "+", ";", "$", "#", "@", "%"], rand(5, 10)).join(""));
  }
});

stage(6, "Scanning: Assignment & equality Operators", async (ctx) => {
  await checkTokenize(ctx, "={===}");
  for (let i = 0; i < 3; i++) await checkTokenize(ctx, randomTokens(["=", "==", "(", ")", "{", "}", ";", "#"], rand(5, 10)).join(""));
});

stage(7, "Scanning: Negation & inequality operators", async (ctx) => {
  await checkTokenize(ctx, "!!===!");
  for (let i = 0; i < 3; i++) await checkTokenize(ctx, randomTokens(["!", "!=", "=", "==", "(", ")", "{", "}"], rand(5, 10)).join(""));
});

stage(8, "Scanning: Relational operators", async (ctx) => {
  await checkTokenize(ctx, "<<=>>=");
  for (let i = 0; i < 3; i++) await checkTokenize(ctx, randomTokens(["<", "<=", ">", ">=", "=", "!", "(", ")"], rand(5, 10)).join(""));
});

stage(9, "Scanning: Division operator & comments", async (ctx) => {
  await checkTokenize(ctx, "//comentario");
  await checkTokenize(ctx, `(/)//${pick(WORDS)}`);
  for (let i = 0; i < 2; i++) {
    await checkTokenize(ctx, `${randomTokens(["/", "*", "(", ")", "=", "<", "!="], rand(4, 8)).join("")}//${pick(WORDS)}(){}`);
  }
});

stage(10, "Scanning: Whitespace", async (ctx) => {
  await checkTokenize(ctx, "(\t)\n{ }\r\n");
  for (let i = 0; i < 3; i++) {
    await checkTokenize(ctx, joinRandom(randomTokens(["(", ")", "{", "}", "*", "-", "=", "<=", ";"], rand(5, 10)), [" ", "\t", "\n", "  ", ""]));
  }
});

stage(11, "Scanning: Multi-line errors", async (ctx) => {
  await checkTokenize(ctx, "()\n\t@");
  for (let i = 0; i < 3; i++) {
    await checkTokenize(ctx, joinRandom(randomTokens(["(", ")", "{", "}", "#", "$", "@", "=="], rand(6, 12)), [" ", "\n", "\t", "\n\n"]));
  }
});

stage(12, "Scanning: String literals", async (ctx) => {
  await checkTokenize(ctx, `"${pick(WORDS)}"`);
  await checkTokenize(ctx, `"${pick(WORDS)} ${pick(WORDS)}" , "unterminated`);
  for (let i = 0; i < 2; i++) {
    await checkTokenize(ctx, joinRandom([`"${pick(WORDS)}"`, "(", `"${pick(WORDS)}  ${rand(1, 9)}"`, ")", "+", `"x//y"`, "#"], [" ", "\n"]));
  }
});

stage(13, "Scanning: Number literals", async (ctx) => {
  await checkTokenize(ctx, `${rand(10, 9999)}`);
  await checkTokenize(ctx, `${rand(1, 999)}.${rand(1, 9999)}`);
  await checkTokenize(ctx, `${rand(10, 99)}.00 ${rand(1, 9)}.50`);
  await checkTokenize(ctx, joinRandom([`(${rand(1, 99)}+${rand(1, 99)}.${rand(1, 9)})`, `"${rand(1, 9)}"`, `${rand(1, 9)}.`, `.${rand(1, 9)}`, "*", `${rand(100, 999)}`], [" ", "\n"]));
});

stage(14, "Scanning: Identifiers", async (ctx) => {
  await checkTokenize(ctx, `${pick(NAMES)} _${pick(NAMES)}_ ${pick(NAMES)}42`);
  for (let i = 0; i < 2; i++) {
    await checkTokenize(ctx, joinRandom([pick(NAMES), "=", `"${pick(WORDS)}"`, ";", `${pick(NAMES)}_${rand(1, 99)}`, "!=", `${rand(1, 9)}${pick(NAMES)}`, "{", "}"], [" ", "\n"]));
  }
});

stage(15, "Scanning: Reserved words", async (ctx) => {
  await checkTokenize(ctx, KEYWORDS.join(" "));
  await checkTokenize(ctx, shuffle(KEYWORDS).map((k) => (crypto.randomInt(2) ? k : k.toUpperCase())).join(" "));
  await checkTokenize(ctx, `var ${pick(NAMES)} = "${pick(WORDS)}";\nif (${pick(NAMES)} and orchid) { print nil; } else { return fun_; }\nclassy class`);
});

// Parsing Expressions ---------------------------------------------------------------

stage(16, "Booleans & Nil", async (ctx) => {
  for (const node of BOOL_LITERALS) await checkParse(ctx, node);
});

stage(17, "Number literals", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkParse(ctx, numberLiteral());
  const n = rand(10, 99);
  await checkParse(ctx, { src: `${n}.000`, tree: `${n}.0` });
});

stage(18, "String literals", async (ctx) => {
  const words = `${pick(WORDS)} ${pick(WORDS)}`;
  await checkParse(ctx, { src: `"${words}"`, tree: words });
  await checkParse(ctx, stringLiteral());
});

stage(19, "Parentheses", async (ctx) => {
  await checkParse(ctx, group(stringLiteral()));
  await checkParse(ctx, group(group(pick(BOOL_LITERALS))));
  await checkParse(ctx, group(group(group(numberLiteral()))));
});

stage(20, "Unary Operators", async (ctx) => {
  await checkParse(ctx, unary("!", pick(BOOL_LITERALS)));
  await checkParse(ctx, unary("-", numberLiteral()));
  await checkParse(ctx, unary("!", unary("!", group(unary("-", numberLiteral())))));
});

stage(21, "Arithmetic operators (1/2)", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkParse(ctx, numExpr(1, { termOps: false }));
  const [a, b, c] = [numberLiteral(), numberLiteral(), numberLiteral()];
  await checkParse(ctx, binary("/", binary("*", a, b), c));
});

stage(22, "Arithmetic operators (2/2)", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkParse(ctx, numExpr(2));
  const [a, b, c] = [numberLiteral(), numberLiteral(), numberLiteral()];
  await checkParse(ctx, binary("-", binary("+", a, binary("*", b, c)), group(binary("-", c, a))));
});

stage(23, "Comparison operators", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkParse(ctx, comparison(1));
  const [a, b] = [numberLiteral(), numberLiteral()];
  await checkParse(ctx, binary("<", binary("<", a, b), b));
});

stage(24, "Equality operators", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkParse(ctx, equality());
  await checkParse(ctx, binary("==", group(comparison(0)), stringLiteral()));
});

stage(25, "Syntactic errors", async (ctx) => {
  const n = rand(1, 99);
  await check(ctx, "parse", `(${n} +)`, { code: 65, errors: [{ line: 1, message: "Expect expression." }] });
  await check(ctx, "parse", `("${pick(WORDS)}"`, { code: 65, errors: [{ line: 1 }] });
  await check(ctx, "parse", `\n\n${n} * * ${n}`, { code: 65, errors: [{ line: 3 }] });
  await check(ctx, "parse", `"${pick(WORDS)}`, { code: 65, errors: [{ line: 1, message: "Unterminated string." }] });
});

// Evaluating Expressions -------------------------------------------------------------

stage(26, "Literals: Booleans & Nil", async (ctx) => {
  for (const node of BOOL_LITERALS) await checkEvaluate(ctx, node);
});

stage(27, "Literals: Strings & Numbers", async (ctx) => {
  const words = `${pick(WORDS)} ${pick(WORDS)}`;
  await check(ctx, "evaluate", `"${words}"`, { stdout: [words] });
  const n = rand(10, 99);
  await check(ctx, "evaluate", `${n}`, { stdout: [String(n)] });
  await check(ctx, "evaluate", `${n}.50`, { stdout: [`${n}.5`] });
  await check(ctx, "evaluate", `${n}.000`, { stdout: [String(n)] });
});

stage(28, "Parentheses", async (ctx) => {
  await checkEvaluate(ctx, group(stringLiteral()));
  await checkEvaluate(ctx, group(group(pick(BOOL_LITERALS))));
  await checkEvaluate(ctx, group(numberLiteral()));
});

stage(29, "Unary Operators: Negation & Not", async (ctx) => {
  const n = numberLiteral();
  await checkEvaluate(ctx, unary("-", n, -n.value));
  await checkEvaluate(ctx, unary("!", { src: "true", value: true }, false));
  await checkEvaluate(ctx, unary("!", { src: "nil", value: null }, true));
  await checkEvaluate(ctx, unary("!", n, false));
  await checkEvaluate(ctx, unary("!", unary("!", group(stringLiteral()), false), true));
});

stage(30, "Arithmetic Operators (1/2)", async (ctx) => {
  for (let i = 0; i < 4; i++) await checkEvaluate(ctx, niceNum(1, { termOps: false }));
});

stage(31, "Arithmetic Operators (2/2)", async (ctx) => {
  for (let i = 0; i < 4; i++) await checkEvaluate(ctx, niceNum(2));
});

stage(32, "String Concatenation", async (ctx) => {
  for (let i = 0; i < 3; i++) await checkEvaluate(ctx, stringConcat());
});

stage(33, "Relational Operators", async (ctx) => {
  for (let i = 0; i < 4; i++) await checkEvaluate(ctx, comparison(1));
  const n = numberLiteral();
  await checkEvaluate(ctx, binary(">=", n, n, true));
});

stage(34, "Equality Operators", async (ctx) => {
  for (let i = 0; i < 4; i++) await checkEvaluate(ctx, equality());
  const n = rand(1, 99);
  await check(ctx, "evaluate", `${n} == "${n}"`, { stdout: ["false"] });
  await check(ctx, "evaluate", "nil == false", { stdout: ["false"] });
});

stage(35, "Runtime Errors: Unary Operators", async (ctx) => {
  await check(ctx, "evaluate", `-"${pick(WORDS)}"`, { code: 70, errors: [{ line: 1, message: "Operand must be a number." }] });
  await check(ctx, "evaluate", `-true`, { code: 70, errors: [{ line: 1, message: "Operand must be a number." }] });
  await check(ctx, "evaluate", `\n-("${pick(WORDS)}" + "x")`, { code: 70, errors: [{ line: 2, message: "Operand must be a number." }] });
});

stage(36, "Runtime Errors: Binary Operators (1/2)", async (ctx) => {
  await check(ctx, "evaluate", `${rand(1, 9)} * "${pick(WORDS)}"`, { code: 70, errors: [{ line: 1, message: "Operands must be numbers." }] });
  await check(ctx, "evaluate", `"${pick(WORDS)}" / ${rand(1, 9)}`, { code: 70, errors: [{ line: 1, message: "Operands must be numbers." }] });
  await check(ctx, "evaluate", `true - false`, { code: 70, errors: [{ line: 1, message: "Operands must be numbers." }] });
});

stage(37, "Runtime Errors: Binary Operators (2/2)", async (ctx) => {
  await check(ctx, "evaluate", `"${pick(WORDS)}" + ${rand(1, 9)}`, { code: 70, errors: [{ line: 1, message: "Operands must be two numbers or two strings." }] });
  await check(ctx, "evaluate", `true + nil`, { code: 70, errors: [{ line: 1, message: "Operands must be two numbers or two strings." }] });
  await check(ctx, "evaluate", `${rand(1, 9)} - "${pick(WORDS)}"`, { code: 70, errors: [{ line: 1, message: "Operands must be numbers." }] });
});

stage(38, "Runtime Errors: Relational Operators", async (ctx) => {
  await check(ctx, "evaluate", `"${pick(WORDS)}" < ${rand(1, 9)}`, { code: 70, errors: [{ line: 1, message: "Operands must be numbers." }] });
  await check(ctx, "evaluate", `true >= false`, { code: 70, errors: [{ line: 1, message: "Operands must be numbers." }] });
  await check(ctx, "evaluate", `"a" > "b"`, { code: 70, errors: [{ line: 1, message: "Operands must be numbers." }] });
});

// Statements & State ------------------------------------------------------------------

stage(39, "Print: Generate output", async (ctx) => {
  const word = pick(WORDS);
  await run(ctx, `print "${word}";`, [word]);
  const node = niceNum(1);
  await run(ctx, `print ${node.src};`, [stringify(node.value)]);
  await run(ctx, `print true;`, ["true"]);
  await runError(ctx, `print;`, { code: 65, line: 1, message: "Expect expression." });
});

stage(40, "Print: Multiple statements", async (ctx) => {
  const nodes = [stringConcat(), niceNum(1), comparison(0), equality()];
  await run(ctx, nodes.map((n) => `print ${n.src};`).join("\n"), nodes.map((n) => stringify(n.value)));
  await run(ctx, `print "a"; print "b";\nprint ${rand(1, 9)} == ${rand(10, 19)};`, ["a", "b", "false"]);
});

stage(41, "Expression statements", async (ctx) => {
  const word = pick(WORDS);
  await run(ctx, `${rand(1, 9)} + ${rand(1, 9)};\n"${word}" + "${word}";\nprint "${word}";\ntrue == false;`, [word]);
  await runError(ctx, `"${word}" + 1;\nprint "nunca";`, { code: 70, line: 1, message: "Operands must be two numbers or two strings." });
});

stage(42, "Variables: Declare variables", async (ctx) => {
  const [a, b, c] = names(3);
  const n = rand(10, 99);
  const word = pick(WORDS);
  await run(ctx, `var ${a} = ${n};\nprint ${a};`, [String(n)]);
  await run(ctx, `var ${a} = "${word}";\nvar ${b} = ${a};\nvar ${c} = ${a} + ${b};\nprint ${c};`, [word + word]);
  await run(ctx, `var ${a} = ${n};\nvar ${b} = ${a} * 2;\nprint ${b} - ${a};`, [String(n)]);
});

stage(43, "Variables: Runtime Errors", async (ctx) => {
  const [a, b] = names(2);
  await runError(ctx, `print ${a};`, { code: 70, line: 1, message: `Undefined variable '${a}'.` });
  await runError(ctx, `var ${a} = 1;\nprint ${a};\nprint ${a} + ${b};`, { stdout: ["1"], code: 70, line: 3, message: `Undefined variable '${b}'.` });
});

stage(44, "Variables: Initialize variables", async (ctx) => {
  const [a, b] = names(2);
  await run(ctx, `var ${a};\nprint ${a};`, ["nil"]);
  await run(ctx, `var ${a} = "x";\nvar ${b};\nprint ${b};\nprint ${a};`, ["nil", "x"]);
});

stage(45, "Variables: Redeclare variables", async (ctx) => {
  const [a] = names(1);
  const [x, y] = [rand(1, 50), rand(51, 99)];
  await run(ctx, `var ${a} = ${x};\nvar ${a} = ${y};\nprint ${a};`, [String(y)]);
  await run(ctx, `var ${a} = "${pick(WORDS)}";\nvar ${a};\nprint ${a};`, ["nil"]);
  await run(ctx, `var ${a} = ${x};\nvar ${a} = ${a} + 1;\nprint ${a};`, [String(x + 1)]);
});

stage(46, "Assignment operation", async (ctx) => {
  const [a, b, c] = names(3);
  const n = rand(10, 99);
  await run(ctx, `var ${a};\n${a} = ${n};\nprint ${a};`, [String(n)]);
  await run(ctx, `var ${a};\nvar ${b};\n${a} = ${b} = ${n};\nprint ${a};\nprint ${b};`, [String(n), String(n)]);
  await run(ctx, `var ${c} = 1;\nprint ${c} = ${n};\nprint ${c};`, [String(n), String(n)]);
  await runError(ctx, `var ${a} = 1;\n${a} + 1 = 3;`, { code: 65, line: 2, message: "Invalid assignment target." });
  await runError(ctx, `${b} = 3;`, { code: 70, line: 1, message: `Undefined variable '${b}'.` });
});

stage(47, "Block syntax", async (ctx) => {
  const [a] = names(1);
  const word = pick(WORDS);
  await run(ctx, `{\n  var ${a} = "${word}";\n  print ${a};\n}`, [word]);
  await run(ctx, `{ { print "dentro"; } print "fora"; }`, ["dentro", "fora"]);
  await runError(ctx, `{\n  var ${a} = 1;\n  print ${a};\n`, { code: 65, line: 4, message: "Expect '}' after block." });
});

stage(48, "Scopes", async (ctx) => {
  const [a, b] = names(2);
  const [g, l] = [pick(WORDS), pick(WORDS) + "2"];
  await run(ctx, `var ${a} = "${g}";\n{\n  var ${a} = "${l}";\n  print ${a};\n}\nprint ${a};`, [l, g]);
  await run(ctx, `var ${a} = 1;\n{\n  ${a} = 2;\n  var ${b} = ${a} + 1;\n  {\n    var ${a} = ${b} * 10;\n    print ${a};\n  }\n  print ${a};\n}\nprint ${a};`, ["30", "2", "2"]);
  await runError(ctx, `{\n  var ${b} = 1;\n}\nprint ${b};`, { code: 70, line: 4, message: `Undefined variable '${b}'.` });
});

// Control Flow ---------------------------------------------------------------------------

stage(49, "If statements", async (ctx) => {
  const word = pick(WORDS);
  await run(ctx, `if (true) print "${word}";\nif (false) print "nao";`, [word]);
  await run(ctx, `if (nil) print "a";\nif (0) print "zero e verdadeiro";\nif ("") print "string vazia tambem";`, ["zero e verdadeiro", "string vazia tambem"]);
  await run(ctx, `var x = ${rand(1, 9)};\nif (x > 0) {\n  print "positivo";\n  x = x * -1;\n}\nprint x < 0;`, ["positivo", "true"]);
});

stage(50, "Else statements", async (ctx) => {
  await run(ctx, `if (false) print "a"; else print "b";`, ["b"]);
  const n = rand(1, 99);
  await run(ctx, `var n = ${n};\nif (n > 50) {\n  print "grande";\n} else {\n  print "pequeno";\n}`, [n > 50 ? "grande" : "pequeno"]);
  await run(ctx, `if (nil) print "x"; else if (false) print "y"; else print "z";`, ["z"]);
});

stage(51, "Else-if statements", async (ctx) => {
  const program = (n) => `var nota = ${n};\nif (nota >= 90) print "A";\nelse if (nota >= 70) print "B";\nelse if (nota >= 50) print "C";\nelse print "D";`;
  for (const n of [rand(90, 100), rand(70, 89), rand(50, 69), rand(0, 49)]) {
    await run(ctx, program(n), [n >= 90 ? "A" : n >= 70 ? "B" : n >= 50 ? "C" : "D"]);
  }
});

stage(52, "Nested if statements", async (ctx) => {
  await run(ctx, `if (true) if (false) print "a"; else print "b";`, ["b"]);
  await run(ctx, `if (false) if (true) print "a"; else print "b";\nprint "fim";`, ["fim"]);
  const [x, y] = [rand(1, 9), rand(1, 9)];
  await run(ctx, `var x = ${x};\nvar y = ${y};\nif (x > 5) {\n  if (y > 5) print "ambos"; else print "so x";\n} else {\n  if (y > 5) print "so y"; else print "nenhum";\n}`, [
    x > 5 ? (y > 5 ? "ambos" : "so x") : y > 5 ? "so y" : "nenhum",
  ]);
});

stage(53, "Logical OR operator", async (ctx) => {
  const word = pick(WORDS);
  const n = rand(1, 9);
  await run(ctx, `print nil or "${word}";\nprint false or false;\nprint ${n} or nil;\nprint "a" or "b";`, [word, "false", String(n), "a"]);
  await run(ctx, `var chamou = false;\nvar x = true or (chamou = true);\nprint chamou;\nvar y = false or (chamou = true);\nprint chamou;`, ["false", "true"]);
});

stage(54, "Logical AND operator", async (ctx) => {
  const word = pick(WORDS);
  const n = rand(1, 9);
  await run(ctx, `print false and "${word}";\nprint ${n} and "${word}";\nprint nil and 1;\nprint true and true and false;`, ["false", word, "nil", "false"]);
  await run(ctx, `var chamou = false;\nvar x = false and (chamou = true);\nprint chamou;\nvar y = true and (chamou = true);\nprint chamou;`, ["false", "true"]);
});

stage(55, "While statements", async (ctx) => {
  const limit = rand(3, 6);
  await run(ctx, `var i = 0;\nwhile (i < ${limit}) {\n  print i;\n  i = i + 1;\n}`, Array.from({ length: limit }, (_, i) => String(i)));
  await run(ctx, `while (false) print "nunca";\nprint "fim";`, ["fim"]);
  const n = rand(5, 10);
  let fact = 1;
  for (let i = 2; i <= n; i++) fact *= i;
  await run(ctx, `var n = ${n};\nvar f = 1;\nwhile (n > 1) {\n  f = f * n;\n  n = n - 1;\n}\nprint f;`, [String(fact)]);
});

stage(56, "For statements", async (ctx) => {
  const limit = rand(3, 6);
  await run(ctx, `for (var i = 0; i < ${limit}; i = i + 1) print i;`, Array.from({ length: limit }, (_, i) => String(i)));
  await run(ctx, `var i = 10;\nfor (; i > 7;) i = i - 1;\nprint i;`, ["7"]);
  const fib = [0, 1];
  while (fib.length < 8) fib.push(fib.at(-1) + fib.at(-2));
  await run(ctx, `var a = 0;\nvar b = 1;\nfor (var k = 0; k < 8; k = k + 1) {\n  print a;\n  var t = a;\n  a = b;\n  b = t + b;\n}`, fib.map(String));
  await runError(ctx, `for (var i = 0; i < 2; i = i + 1) {}\nprint i;`, { code: 70, line: 2, message: "Undefined variable 'i'." });
});

stage(57, "Syntactic errors", async (ctx) => {
  await runError(ctx, `if (true) print "x"`, { code: 65, line: 1, message: "Expect ';' after value." });
  await runError(ctx, `\nfor (var i = 0; i < 3) print i;`, { code: 65, line: 2 });
  await runError(ctx, `while true print 1;`, { code: 65, line: 1, message: "Expect '(' after 'while'." });
  await runError(ctx, `print "ok";\nif (1 >) print 2;`, { code: 65, line: 2, message: "Expect expression." });
});

// Functions ---------------------------------------------------------------------------------

stage(58, "Native functions", async (ctx) => {
  await run(ctx, `print clock() > 0;\nvar t = clock();\nprint t >= 0;`, ["true", "true"]);
  await run(ctx, `print clock;`, ["<native fn>"]);
  await run(ctx, `var antes = clock();\nvar depois = clock();\nprint depois - antes >= 0;`, ["true"]);
});

stage(59, "Functions without arguments", async (ctx) => {
  const [f, g] = names(2);
  const word = pick(WORDS);
  await run(ctx, `fun ${f}() {\n  print "${word}";\n}\n${f}();\n${f}();`, [word, word]);
  await run(ctx, `fun ${f}() {}\nprint ${f};\nprint ${f}();`, [`<fn ${f}>`, "nil"]);
  await run(ctx, `fun ${f}() { print "f"; }\nfun ${g}() { ${f}(); print "g"; }\n${g}();`, ["f", "g"]);
});

stage(60, "Functions with arguments", async (ctx) => {
  const [f, g] = names(2);
  const [x, y, z] = [rand(1, 50), rand(1, 50), rand(1, 50)];
  await run(ctx, `fun ${f}(a, b, c) {\n  print a + b + c;\n}\n${f}(${x}, ${y}, ${z});`, [String(x + y + z)]);
  const word = pick(WORDS);
  await run(ctx, `fun ${g}(nome) { print "ola, " + nome; }\n${g}("${word}");`, [`ola, ${word}`]);
});

stage(61, "Syntax errors", async (ctx) => {
  const [f] = names(1);
  await runError(ctx, `fun ${f}(a b) {}`, { code: 65, line: 1, message: "Expect ')' after parameters." });
  await runError(ctx, `fun () {}`, { code: 65, line: 1, message: "Expect function name." });
  await runError(ctx, `fun ${f}() {}\n${f}(1,);`, { code: 65, line: 2, message: "Expect expression." });
  await runError(ctx, `fun ${f}() print 1;`, { code: 65, line: 1, message: "Expect '{' before function body." });
});

stage(62, "Return statements", async (ctx) => {
  const [f] = names(1);
  const [x, y] = [rand(1, 50), rand(1, 50)];
  await run(ctx, `fun ${f}(a, b) {\n  return a * b;\n}\nprint ${f}(${x}, ${y});`, [String(x * y)]);
  await run(ctx, `fun ${f}(n) {\n  if (n > 10) return "grande";\n  return "pequeno";\n  print "nunca";\n}\nprint ${f}(${x});\nprint ${f}(5);`, [x > 10 ? "grande" : "pequeno", "pequeno"]);
  await run(ctx, `fun ${f}() { return; }\nprint ${f}();`, ["nil"]);
  await run(ctx, `fun fib(n) {\n  if (n < 2) return n;\n  return fib(n - 1) + fib(n - 2);\n}\nprint fib(15);`, ["610"]);
});

stage(63, "Higher order functions", async (ctx) => {
  const [f, g] = names(2);
  const n = rand(2, 9);
  await run(ctx, `fun dobro(x) { return x * 2; }\nfun aplica(${f}, v) { return ${f}(${f}(v)); }\nprint aplica(dobro, ${n});`, [String(n * 4)]);
  await run(ctx, `fun ${g}() {\n  fun interna() { return "${pick(WORDS)}"; }\n  return interna;\n}\nprint ${g}();`, ["<fn interna>"]);
  await run(ctx, `fun soma(a, b) { return a + b; }\nfun mult(a, b) { return a * b; }\nfun usa(op) { return op(${n}, 3); }\nprint usa(soma);\nprint usa(mult);`, [String(n + 3), String(n * 3)]);
});

stage(64, "Runtime errors", async (ctx) => {
  const [f] = names(1);
  await runError(ctx, `var ${f} = "texto";\n${f}();`, { code: 70, line: 2, message: "Can only call functions and classes." });
  await runError(ctx, `fun ${f}(a, b) { return a + b; }\nprint ${f}(1);`, { code: 70, line: 2, message: "Expected 2 arguments but got 1." });
  await runError(ctx, `fun ${f}() { return 1; }\nprint ${f}();\nprint ${f}(1, 2, 3);`, { stdout: ["1"], code: 70, line: 3, message: "Expected 0 arguments but got 3." });
  await runError(ctx, `fun ${f}(x) { return -x; }\nprint ${f}("a");`, { code: 70, line: 1, message: "Operand must be a number." });
});

stage(65, "Function scope", async (ctx) => {
  const [a] = names(1);
  const [g, l] = [pick(WORDS), `${pick(WORDS)}_local`];
  await run(ctx, `var ${a} = "${g}";\nfun f(${a}) { print ${a}; }\nf("${l}");\nprint ${a};`, [l, g]);
  await run(ctx, `var total = 0;\nfun soma(n) { total = total + n; }\nsoma(5);\nsoma(7);\nprint total;`, ["12"]);
  await runError(ctx, `fun f() { var ${a} = 1; }\nf();\nprint ${a};`, { code: 70, line: 3, message: `Undefined variable '${a}'.` });
});

stage(66, "Closures", async (ctx) => {
  const [f] = names(1);
  await run(ctx, `fun contador() {\n  var n = 0;\n  fun inc() {\n    n = n + 1;\n    return n;\n  }\n  return inc;\n}\nvar ${f} = contador();\n${f}();\n${f}();\nprint ${f}();\nvar outro = contador();\nprint outro();`, ["3", "1"]);
  const base = rand(2, 9);
  await run(ctx, `fun somador(base) {\n  fun soma(x) { return base + x; }\n  return soma;\n}\nvar s = somador(${base});\nprint s(10);\nprint s(20);`, [String(base + 10), String(base + 20)]);
});

// Resolving & Binding -------------------------------------------------------------------------

stage(67, "Identifier Resolution", async (ctx) => {
  const [g, l] = [pick(WORDS), `${pick(WORDS)}_bloco`];
  await run(ctx, `var a = "${g}";\n{\n  fun mostra() {\n    print a;\n  }\n  mostra();\n  var a = "${l}";\n  mostra();\n  print a;\n}`, [g, g, l]);
  await run(ctx, `var x = "global";\nfun f() {\n  fun g() { print x; }\n  var x = "local";\n  g();\n}\nf();`, ["global"]);
});

stage(68, "Self Initialization", async (ctx) => {
  await runError(ctx, `var a = "x";\n{\n  var a = a;\n}`, { code: 65, line: 3, message: "Can't read local variable in its own initializer." });
  await runError(ctx, `fun f() {\n  var b = b + 1;\n}`, { code: 65, line: 2, message: "Can't read local variable in its own initializer." });
});

stage(69, "Variable Redeclaration", async (ctx) => {
  await runError(ctx, `{\n  var a = 1;\n  var a = 2;\n}`, { code: 65, line: 3, message: "Already a variable with this name in this scope." });
  await runError(ctx, `fun f(x) {\n  var x = 1;\n}`, { code: 65, line: 2, message: "Already a variable with this name in this scope." });
  await runError(ctx, `fun f(a, a) {}`, { code: 65, line: 1, message: "Already a variable with this name in this scope." });
  await run(ctx, `var a = 1;\nvar a = 2;\nprint a;`, ["2"]);
});

stage(70, "Invalid Return", async (ctx) => {
  await runError(ctx, `print "antes";\nreturn "x";`, { code: 65, line: 2, message: "Can't return from top-level code." });
  await runError(ctx, `{\n  return;\n}`, { code: 65, line: 2, message: "Can't return from top-level code." });
  await run(ctx, `fun f() { return "ok"; }\nprint f();`, ["ok"]);
});

// Classes -------------------------------------------------------------------------------------

stage(71, "Class Declarations", async (ctx) => {
  const [c] = names(1).map((n) => n[0].toUpperCase() + n.slice(1));
  await run(ctx, `class ${c} {}\nprint ${c};`, [c]);
  await run(ctx, `{\n  class ${c} {}\n  print ${c};\n}`, [c]);
  await run(ctx, `class ${c} {\n  metodo() {}\n}\nprint ${c};`, [c]);
});

stage(72, "Class Instances", async (ctx) => {
  const [c, d] = names(2).map((n) => n[0].toUpperCase() + n.slice(1));
  await run(ctx, `class ${c} {}\nprint ${c}();`, [`${c} instance`]);
  await run(ctx, `class ${c} {}\nclass ${d} {}\nvar a = ${c}();\nvar b = ${d}();\nprint a;\nprint b;`, [`${c} instance`, `${d} instance`]);
});

stage(73, "Getters & Setters", async (ctx) => {
  const [c] = names(1).map((n) => n[0].toUpperCase() + n.slice(1));
  const word = pick(WORDS);
  const n = rand(1, 99);
  await run(ctx, `class ${c} {}\nvar o = ${c}();\no.nome = "${word}";\no.idade = ${n};\nprint o.nome;\nprint o.idade + 1;`, [word, String(n + 1)]);
  await run(ctx, `class ${c} {}\nvar a = ${c}();\nvar b = ${c}();\na.v = 1;\nb.v = a.v = 2;\nprint a.v + b.v;`, ["4"]);
  await runError(ctx, `class ${c} {}\nvar o = ${c}();\nprint o.nada;`, { code: 70, line: 3, message: "Undefined property 'nada'." });
  await runError(ctx, `var s = "${word}";\nprint s.tamanho;`, { code: 70, line: 2, message: "Only instances have properties." });
  await runError(ctx, `var n = 1;\nn.x = 2;`, { code: 70, line: 2, message: "Only instances have fields." });
});

stage(74, "Instance Methods", async (ctx) => {
  const [c] = names(1).map((n) => n[0].toUpperCase() + n.slice(1));
  const word = pick(WORDS);
  await run(ctx, `class ${c} {\n  fala() {\n    print "${word}";\n  }\n}\n${c}().fala();\nvar o = ${c}();\nvar m = o.fala;\nm();\nprint m;`, [word, word, "<fn fala>"]);
  await run(ctx, `class Calc {\n  soma(a, b) { return a + b; }\n}\nprint Calc().soma(${rand(1, 9)}, 10) > 10;`, ["true"]);
});

stage(75, "The 'this' keyword", async (ctx) => {
  const word = pick(WORDS);
  await run(ctx, `class Pessoa {\n  diz() {\n    print "sou " + this.nome;\n  }\n}\nvar p = Pessoa();\np.nome = "${word}";\np.diz();`, [`sou ${word}`]);
  await run(ctx, `class Caixa {\n  pega() { return this; }\n}\nvar c = Caixa();\nprint c.pega() == c;\nvar f = c.pega;\nprint f();`, ["true", "Caixa instance"]);
  await run(ctx, `class Contador {\n  inc() {\n    this.n = this.n + 1;\n    return this;\n  }\n}\nvar c = Contador();\nc.n = 0;\nc.inc().inc().inc();\nprint c.n;`, ["3"]);
});

stage(76, "Invalid usages of 'this'", async (ctx) => {
  await runError(ctx, `print this;`, { code: 65, line: 1, message: "Can't use 'this' outside of a class." });
  await runError(ctx, `fun f() {\n  return this;\n}`, { code: 65, line: 2, message: "Can't use 'this' outside of a class." });
});

stage(77, "Constructor calls", async (ctx) => {
  const [x, y] = [rand(1, 50), rand(1, 50)];
  await run(ctx, `class Ponto {\n  init(x, y) {\n    this.x = x;\n    this.y = y;\n  }\n  soma() { return this.x + this.y; }\n}\nvar p = Ponto(${x}, ${y});\nprint p.soma();\nprint p.x;`, [String(x + y), String(x)]);
  await runError(ctx, `class Ponto {\n  init(x) { this.x = x; }\n}\nPonto();`, { code: 70, line: 4, message: "Expected 1 arguments but got 0." });
  await runError(ctx, `class Vazio {}\nVazio(1);`, { code: 70, line: 2, message: "Expected 0 arguments but got 1." });
});

stage(78, "Return within constructors", async (ctx) => {
  await run(ctx, `class Foo {\n  init() {\n    this.ok = true;\n    return;\n    this.ok = false;\n  }\n}\nprint Foo().ok;`, ["true"]);
  await run(ctx, `class Foo {\n  init() { this.n = 1; }\n}\nvar f = Foo();\nprint f.init();\nprint f.n;`, ["Foo instance", "1"]);
  await runError(ctx, `class Foo {\n  init() {\n    return "x";\n  }\n}`, { code: 65, line: 3, message: "Can't return a value from an initializer." });
});

// Inheritance -----------------------------------------------------------------------------------

stage(79, "Class Hierarchy", async (ctx) => {
  await run(ctx, `class Animal {}\nclass Gato < Animal {}\nprint Gato;\nprint Gato();`, ["Gato", "Gato instance"]);
  await run(ctx, `class A {}\nclass B < A {}\nclass C < B {}\nprint C();`, ["C instance"]);
});

stage(80, "Inheriting Methods", async (ctx) => {
  const word = pick(WORDS);
  await run(ctx, `class Animal {\n  come() { print "come ${word}"; }\n}\nclass Gato < Animal {}\nGato().come();`, [`come ${word}`]);
  await run(ctx, `class A {\n  init(n) { this.n = n; }\n  dobro() { return this.n * 2; }\n}\nclass B < A {}\nclass C < B {}\nprint C(21).dobro();`, ["42"]);
});

stage(81, "Overriding Methods", async (ctx) => {
  await run(ctx, `class Animal {\n  som() { return "..."; }\n}\nclass Cao < Animal {\n  som() { return "au"; }\n}\nprint Animal().som();\nprint Cao().som();`, ["...", "au"]);
  await run(ctx, `class A {\n  nome() { return "A"; }\n  fala() { print "sou " + this.nome(); }\n}\nclass B < A {\n  nome() { return "B"; }\n}\nB().fala();`, ["sou B"]);
});

stage(82, "Inheritance errors", async (ctx) => {
  await runError(ctx, `class A < A {}`, { code: 65, line: 1, message: "A class can't inherit from itself." });
  await runError(ctx, `var nao = "classe";\nclass B < nao {}`, { code: 70, line: 2, message: "Superclass must be a class." });
  await runError(ctx, `fun f() {}\nclass C < f {}`, { code: 70, line: 2, message: "Superclass must be a class." });
});

stage(83, "The super keyword", async (ctx) => {
  await run(ctx, `class A {\n  fala() { return "A"; }\n}\nclass B < A {\n  fala() { return super.fala() + "B"; }\n}\nclass C < B {\n  fala() { return super.fala() + "C"; }\n}\nprint C().fala();`, ["ABC"]);
  const n = rand(1, 50);
  await run(ctx, `class Base {\n  init(n) { this.n = n; }\n}\nclass Filha < Base {\n  init(n) {\n    super.init(n * 2);\n    this.extra = true;\n  }\n}\nvar f = Filha(${n});\nprint f.n;\nprint f.extra;`, [String(n * 2), "true"]);
  await run(ctx, `class A {\n  m() { print "A.m"; }\n}\nclass B < A {\n  pega() { return super.m; }\n}\nvar m = B().pega();\nm();`, ["A.m"]);
});

stage(84, "Invalid Usages of the super Keyword", async (ctx) => {
  await runError(ctx, `super.metodo();`, { code: 65, line: 1, message: "Can't use 'super' outside of a class." });
  await runError(ctx, `class A {\n  m() { super.m(); }\n}`, { code: 65, line: 2, message: "Can't use 'super' in a class with no superclass." });
  await runError(ctx, `class A {}\nclass B < A {\n  m() { return super; }\n}`, { code: 65, line: 3, message: "Expect '.' after 'super'." });
});

// ------------------------------------------------------------------------------ runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "interpreter.jar");
  logs = "";

  if (build) {
    const buildResult = spawnSync("mvn -q -B package", {
      cwd: workspaceDir,
      shell: true,
      encoding: "utf8",
      timeout: 240_000,
    });
    if (buildResult.status !== 0) {
      const output = [buildResult.stdout, buildResult.stderr].filter(Boolean).join("\n");
      const error = new Error(`falha ao compilar; veja a saída do Maven abaixo\n${output.slice(-6000)}`);
      error.compileOutput = output;
      throw error;
    }
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pw-interpreter-"));
  const results = [];
  try {
    const jarExists = await fs.access(jar).then(() => true, () => false);
    for (const test of tests) {
      onProgress({ type: "stage-start", number: test.number, title: test.title });
      const startedAt = Date.now();
      const before = logs.length;
      let result;
      try {
        if (!jarExists) throw new Error(`${jar} não encontrado — o build gerou o jar?`);
        await test.run({ jar, tmp });
        result = { number: test.number, title: test.title, ok: true, durationMs: Date.now() - startedAt };
        logs = logs.slice(0, before); // só guarda o log dos stages que falharam
      } catch (error) {
        result = { number: test.number, title: test.title, ok: false, error: error.message, durationMs: Date.now() - startedAt };
      }
      results.push(result);
      onProgress({ type: "stage-end", result });
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }

  const passed = results.filter((result) => result.ok).length;
  return { results, passed, failed: results.length - passed, logs };
}

async function main() {
  const argv = process.argv.slice(2);
  const dirIndex = argv.indexOf("--dir");
  const workspaceDir = dirIndex >= 0 && argv[dirIndex + 1] ? path.resolve(argv[dirIndex + 1]) : DEFAULT_WORKSPACE;
  const build = !argv.includes("--no-build");
  const onlyIndex = argv.indexOf("--only");
  if (onlyIndex >= 0) {
    const wanted = new Set(argv[onlyIndex + 1].split(",").map(Number));
    tests.splice(0, tests.length, ...tests.filter((test) => wanted.has(test.number)));
  }

  if (build) console.log("🔨 Compilando (mvn package)...\n");
  const result = await runStages({
    workspaceDir,
    build,
    onProgress(event) {
      if (event.type !== "stage-end") return;
      const { result: stage } = event;
      console.log(`${stage.ok ? "✅" : "❌"} Stage ${String(stage.number).padStart(2, "0")} · ${stage.title}`);
      if (!stage.ok) console.log(`   ${stage.error}`);
    },
  });

  console.log(`\n${result.passed}/${result.results.length} stages concluídos.`);
  if (result.failed > 0) {
    console.log(`\nÚltimas execuções:\n${result.logs.slice(-4000)}`);
    process.exitCode = 1;
  }
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(`\n💥 ${error.message}`);
    process.exit(1);
  });
}
