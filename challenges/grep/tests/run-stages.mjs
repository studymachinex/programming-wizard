#!/usr/bin/env node
/**
 * Tester local do desafio grep.
 *
 * Executa `java -jar target/grep.jar [flags] -E <padrão> [arquivos]` com entradas geradas e
 * compara código de saída e stdout com um oráculo em JavaScript (a sintaxe suportada no
 * desafio é um subconjunto que o RegExp do JS interpreta do mesmo jeito: backtracking
 * guloso, primeira alternativa que leva a um match).
 *
 * O desafio é escrever o próprio motor de regex: código que usa java.util.regex é recusado.
 *
 * Uso:
 *   node challenges/grep/tests/run-stages.mjs
 *   node challenges/grep/tests/run-stages.mjs --dir <workspace> --no-build
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
const COLOR_START = "\u001b[01;31m\u001b[K";
const COLOR_END = "\u001b[m\u001b[K";

const FRUITS = ["apple", "banana", "cherry", "grape", "mango", "orange", "pear", "lemon"];
const ANIMALS = ["cat", "dog", "cow", "pig", "owl", "fox", "bee", "yak"];

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function show(text) {
  return JSON.stringify(text).replaceAll("\\u001b", "\\e");
}

// --------------------------------------------------------------- oráculo

function oracle({ pattern, lines, files, onlyMatching = false, color = "never", prefix = false }) {
  const regex = new RegExp(pattern, "g");
  const out = [];
  let matched = false;
  const sources = files ?? [{ name: null, lines }];
  for (const source of sources) {
    for (const line of source.lines) {
      const matches = [...line.matchAll(regex)].filter((m) => m[0].length > 0);
      const lineMatches = new RegExp(pattern).test(line);
      if (!lineMatches) continue;
      matched = true;
      const head = prefix ? `${source.name}:` : "";
      if (onlyMatching) {
        for (const m of matches) out.push(head + (color === "always" ? COLOR_START + m[0] + COLOR_END : m[0]));
      } else if (color === "always") {
        out.push(head + line.replace(new RegExp(pattern, "g"), (m) => (m.length ? COLOR_START + m + COLOR_END : m)));
      } else {
        out.push(head + line);
      }
    }
  }
  return { code: matched ? 0 : 1, stdout: out.map((l) => `${l}\n`).join("") };
}

// --------------------------------------------------------------- execução

let logs = "";

function runGrep(ctx, args, input = "", cwd = ctx.tmp) {
  return new Promise((resolve) => {
    const child = spawn("java", ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", ctx.jar, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8").replaceAll("\r\n", "\n");
      const err = Buffer.concat(stderr).toString("utf8");
      logs += `$ ${input ? `echo ${show(input)} | ` : ""}your_program.sh ${args.map((a) => (/\s|[|*?()\\$^]/.test(a) ? `'${a}'` : a)).join(" ")}\n${out}${err}`;
      if (!logs.endsWith("\n")) logs += "\n";
      resolve({ code, stdout: out, stderr: err });
    });
    child.stdin.end(input);
  });
}

function describe(args, input) {
  const quoted = args.map((a) => (/\s|[|*?()\\$^]/.test(a) ? `'${a}'` : a)).join(" ");
  return input === undefined ? `./your_program.sh ${quoted}` : `echo ${show(input)} | ./your_program.sh ${quoted}`;
}

/** Roda um caso e compara com o oráculo. checkOutput=false confere só o código de saída. */
async function expectCase(ctx, { pattern, lines, flags = [], checkOutput = true, onlyMatching, color }) {
  const args = [...flags, "-E", pattern];
  const input = lines.join("\n") + "\n";
  const expected = oracle({ pattern, lines, onlyMatching, color });
  const result = await runGrep(ctx, args, input);
  const label = describe(args, lines.length === 1 ? lines[0] : lines.join("\\n"));
  assert(
    result.code === expected.code,
    `${label}: código de saída ${result.code}, esperava ${expected.code} (${expected.code === 0 ? "há match" : "não há match"})` +
      (result.code > 1 ? ` — ${result.stderr.trim().split("\n")[0]}` : "")
  );
  if (checkOutput) {
    assert(result.stdout === expected.stdout, `${label}: saída ${show(result.stdout)}, esperava ${show(expected.stdout)}`);
  }
}

async function expectCodes(ctx, cases) {
  for (const [pattern, input] of cases) await expectCase(ctx, { pattern, lines: [input], checkOutput: false });
}

// ------------------------------------------------------------------- stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

stage(1, "Match a literal character", async (ctx) => {
  const fruit = pick(FRUITS);
  const letter = fruit[crypto.randomInt(fruit.length)];
  const missing = "zqxj".split("").find((c) => !fruit.includes(c));
  await expectCodes(ctx, [[letter, fruit], [missing, fruit]]);
});

stage(2, "Match digits", async (ctx) => {
  await expectCodes(ctx, [["\\d", `${pick(FRUITS)}${crypto.randomInt(10, 999)}`], ["\\d", pick(FRUITS)]]);
});

stage(3, "Match word characters", async (ctx) => {
  await expectCodes(ctx, [["\\w", `${pick(FRUITS)}_${crypto.randomInt(99)}`], ["\\w", "$!?-+=#"]]);
});

stage(4, "Positive Character Groups", async (ctx) => {
  const fruit = pick(FRUITS);
  await expectCodes(ctx, [[`[${fruit[0]}xz]`, fruit], ["[xyz]", "apple"], ["[abc]", pick(["dog", "fox", "owl"])]]);
});

stage(5, "Negative Character Groups", async (ctx) => {
  await expectCodes(ctx, [["[^xyz]", pick(FRUITS)], ["[^abc]", "cab"], ["[^anb]", "banana"]]);
});

stage(6, "Combining Character Classes", async (ctx) => {
  const n = crypto.randomInt(1, 9);
  const fruit = pick(FRUITS);
  await expectCodes(ctx, [
    [`\\d ${fruit}`, `sally has ${n} ${fruit}s`],
    [`\\d ${fruit}`, `sally has 1 ${pick(ANIMALS)}`],
    ["\\d\\d\\d apples", `sally has ${crypto.randomInt(100, 999)} apples`],
    ["\\d \\w\\w\\ws", "sally has 3 dogs"],
    ["\\d \\w\\w\\ws", "sally has 4 dog"],
  ]);
});

stage(7, "Start of string anchor", async (ctx) => {
  const word = pick(ANIMALS);
  await expectCodes(ctx, [[`^${word}`, `${word}_${crypto.randomInt(99)}`], [`^${word}`, `big ${word}`]]);
});

stage(8, "End of string anchor", async (ctx) => {
  const word = pick(FRUITS);
  await expectCodes(ctx, [[`${word}$`, `green_${word}`], [`${word}$`, `${word}_tree`], [`^${word}$`, word]]);
});

stage(9, "Match one or more times", async (ctx) => {
  const a = "a".repeat(crypto.randomInt(1, 5));
  await expectCodes(ctx, [["ca+t", `c${a}t`], ["ca+t", "ct"], ["^abc_\\d+_xyz$", `abc_${crypto.randomInt(1, 99999)}_xyz`], ["ca+ts", "cat"]]);
});

stage(10, "Match zero or one times", async (ctx) => {
  const animal = pick(ANIMALS);
  await expectCodes(ctx, [[`${animal}s?`, animal], [`${animal}s?`, `${animal}s`], ["ca?t", "act"], ["^ca?t$", "caat"]]);
});

stage(11, "Wildcard", async (ctx) => {
  await expectCodes(ctx, [["d.g", "dog"], ["d.g", "cog"], ["g.+gol", "goøö0Ogol"], ["^c..$", pick(["cow", "cat"])]]);
});

stage(12, "Alternation", async (ctx) => {
  const [a, b] = [pick(ANIMALS), pick(FRUITS)];
  await expectCodes(ctx, [[`(${a}|${b})`, `a ${b} tree`], [`(${a}|${b})`, "nothing here"], [`^I see \\d+ (cat|dog)s?$`, `I see ${crypto.randomInt(1, 20)} dogs`]]);
});

stage(13, "Print a single matching line", async (ctx) => {
  const fruit = pick(FRUITS);
  await expectCase(ctx, { pattern: `${fruit}$`, lines: [`I like ${fruit}`] });
  await expectCase(ctx, { pattern: "\\d", lines: [`no digits ${fruit}`] });
});

stage(14, "Print multiple matching lines", async (ctx) => {
  const lines = [`${pick(FRUITS)}_pie`, `${pick(ANIMALS)}_food`, `${pick(FRUITS)}_pie`, "nothing", `${pick(FRUITS)}_juice`];
  await expectCase(ctx, { pattern: "_(pie|juice)$", lines });
});

stage(15, "Print single match", async (ctx) => {
  const n = crypto.randomInt(1, 9);
  await expectCase(ctx, { pattern: "\\d", lines: [`sally has ${n} apples`], flags: ["-o"], onlyMatching: true });
});

stage(16, "Print multiple matches", async (ctx) => {
  await expectCase(ctx, {
    pattern: "\\d+",
    lines: [`a${crypto.randomInt(1, 99)}b${crypto.randomInt(100, 999)}c${crypto.randomInt(1, 9)}`],
    flags: ["-o"],
    onlyMatching: true,
  });
});

stage(17, "Process multiple input lines", async (ctx) => {
  const lines = [`I see ${crypto.randomInt(1, 9)} cats`, "no pets", `there are ${crypto.randomInt(10, 99)} dogs and 2 owls`];
  await expectCase(ctx, { pattern: "\\d+ \\w+", lines, flags: ["-o"], onlyMatching: true });
});

stage(18, "Highlight a single match", async (ctx) => {
  await expectCase(ctx, { pattern: "\\d", lines: [`sally has ${crypto.randomInt(1, 9)} apples`], flags: ["--color=always"], color: "always" });
});

stage(19, "Highlight multiple matches", async (ctx) => {
  await expectCase(ctx, { pattern: `(${pick(ANIMALS)}|${pick(FRUITS)})`, lines: ["cat and pear and dog and apple, owl, mango"], flags: ["--color=always"], color: "always" });
});

stage(20, "Highlight matches in multiple lines", async (ctx) => {
  const lines = [`${pick(FRUITS)} ${crypto.randomInt(10, 99)}`, "no numbers", `${crypto.randomInt(1, 9)} and ${crypto.randomInt(100, 999)}`];
  await expectCase(ctx, { pattern: "\\d+", lines, flags: ["--color=always"], color: "always" });
  await expectCase(ctx, { pattern: "\\d+", lines, flags: ["-o", "--color=always"], onlyMatching: true, color: "always" });
});

stage(21, "Disable highlighting", async (ctx) => {
  await expectCase(ctx, { pattern: "\\d+", lines: [`${pick(FRUITS)} ${crypto.randomInt(10, 99)}`], flags: ["--color=never"], color: "never" });
});

stage(22, "Implement the auto color option", async (ctx) => {
  // A saída do programa é um pipe para o tester, não um terminal: auto não colore.
  await expectCase(ctx, { pattern: "\\d+", lines: [`${pick(FRUITS)} ${crypto.randomInt(10, 99)}`], flags: ["--color=auto"], color: "never" });
});

async function writeFiles(ctx, files) {
  const dir = path.join(ctx.tmp, crypto.randomBytes(4).toString("hex"));
  for (const [name, lines] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), lines.join("\n") + "\n");
  }
  return dir;
}

async function expectFiles(ctx, { pattern, files, args, prefix, cwd, sources }) {
  const expected = oracle({ pattern, files: sources, prefix });
  const result = await runGrep(ctx, args, "", cwd);
  const label = describe(args);
  assert(result.code === expected.code, `${label}: código de saída ${result.code}, esperava ${expected.code}${result.code > 1 ? ` — ${result.stderr.trim().split("\n")[0]}` : ""}`);
  const sort = (text) => text.split("\n").filter(Boolean).sort().join("\n");
  assert(sort(result.stdout) === sort(expected.stdout), `${label}: saída ${show(result.stdout)}, esperava (em qualquer ordem) ${show(expected.stdout)}`);
}

stage(23, "Search a single-line file", async (ctx) => {
  const fruit = pick(FRUITS);
  const files = { "fruits.txt": [fruit] };
  const cwd = await writeFiles(ctx, files);
  await expectFiles(ctx, { pattern: `^${fruit.slice(0, 3)}`, args: ["-E", `^${fruit.slice(0, 3)}`, "fruits.txt"], cwd, sources: [{ name: "fruits.txt", lines: files["fruits.txt"] }] });
  await expectFiles(ctx, { pattern: "\\d", args: ["-E", "\\d", "fruits.txt"], cwd, sources: [{ name: "fruits.txt", lines: files["fruits.txt"] }] });
});

stage(24, "Search a multi-line file", async (ctx) => {
  const lines = [pick(FRUITS), `${pick(FRUITS)}_tree`, pick(ANIMALS), `${pick(ANIMALS)}_house`];
  const cwd = await writeFiles(ctx, { "things.txt": lines });
  await expectFiles(ctx, { pattern: "_\\w+$", args: ["-E", "_\\w+$", "things.txt"], cwd, sources: [{ name: "things.txt", lines }] });
});

stage(25, "Search multiple files", async (ctx) => {
  const files = { "fruits.txt": [pick(FRUITS), `${pick(FRUITS)}s`], "animals.txt": [pick(ANIMALS), `${pick(ANIMALS)}s`], "empty.txt": ["nothing"] };
  const cwd = await writeFiles(ctx, files);
  const names = Object.keys(files);
  await expectFiles(ctx, {
    pattern: "s$",
    args: ["-E", "s$", ...names],
    cwd,
    prefix: true,
    sources: names.map((name) => ({ name, lines: files[name] })),
  });
});

stage(26, "Recursive search", async (ctx) => {
  const files = {
    "dir/fruits.txt": [pick(FRUITS), `${pick(FRUITS)} pie`],
    "dir/sub/animals.txt": [`${pick(ANIMALS)} pie`, pick(ANIMALS)],
    "dir/sub/deep/notes.txt": ["pie chart", "nothing"],
  };
  const cwd = await writeFiles(ctx, files);
  await expectFiles(ctx, {
    pattern: "pie",
    args: ["-r", "-E", "pie", "dir/"],
    cwd,
    prefix: true,
    sources: Object.entries(files).map(([name, lines]) => ({ name, lines })),
  });
});

stage(27, "Match zero or more times", async (ctx) => {
  await expectCodes(ctx, [["ca*t", "ct"], ["ca*t", `c${"a".repeat(crypto.randomInt(1, 6))}t`], ["^ca*t$", "cart"], ["k\\d*t", "k42t"]]);
  await expectCase(ctx, { pattern: "ba*", lines: ["b baa baaaa"], flags: ["-o"], onlyMatching: true });
});

stage(28, "Match exactly n times", async (ctx) => {
  const n = crypto.randomInt(2, 5);
  await expectCodes(ctx, [[`^ca{${n}}t$`, `c${"a".repeat(n)}t`], [`^ca{${n}}t$`, `c${"a".repeat(n + 1)}t`], ["\\d{3}-\\d{4}", "call 555-1234"]]);
});

stage(29, "Match at least n times", async (ctx) => {
  const n = crypto.randomInt(2, 4);
  await expectCodes(ctx, [[`^ca{${n},}t$`, `c${"a".repeat(n + crypto.randomInt(3))}t`], [`^ca{${n},}t$`, `c${"a".repeat(n - 1)}t`]]);
  await expectCase(ctx, { pattern: "\\d{2,}", lines: ["1 22 333 4"], flags: ["-o"], onlyMatching: true });
});

stage(30, "Match between n and m times", async (ctx) => {
  await expectCodes(ctx, [["^ca{2,4}t$", "caaat"], ["^ca{2,4}t$", "caaaaat"], ["^ca{2,4}t$", "cat"]]);
  await expectCase(ctx, { pattern: "x{1,3}", lines: ["xxxxx"], flags: ["-o"], onlyMatching: true });
});

stage(31, "Single Backreference", async (ctx) => {
  const animal = pick(ANIMALS);
  await expectCodes(ctx, [[`(${animal}) and \\1`, `${animal} and ${animal}`], [`(${animal}) and \\1`, `${animal} and owlish`], ["^(\\w+) is \\1$", "pear is pear"], ["^(\\w+) is \\1$", "pear is plum"]]);
});

stage(32, "Multiple Backreferences", async (ctx) => {
  const n = crypto.randomInt(2, 9);
  await expectCodes(ctx, [
    ["(\\d+) (\\w+) squares and \\1 \\2 circles", `${n} red squares and ${n} red circles`],
    ["(\\d+) (\\w+) squares and \\1 \\2 circles", `${n} red squares and ${n + 1} red circles`],
    ["^(\\w+) (\\w+), \\2 \\1$", "hello world, world hello"],
  ]);
});

stage(33, "Nested Backreferences", async (ctx) => {
  const animal = pick(ANIMALS);
  await expectCodes(ctx, [
    [`('(${animal}) and \\2') is the same as \\1`, `'${animal} and ${animal}' is the same as '${animal} and ${animal}'`],
    [`('(${animal}) and \\2') is the same as \\1`, `'${animal} and ${animal}' is the same as '${animal} and fish'`],
    ["((\\w\\w\\w\\w) (\\d\\d\\d)) is doing \\2 \\3 times, and again \\1 times", "grep 101 is doing grep 101 times, and again grep 101 times"],
  ]);
});

// ------------------------------------------------------------------- runner

/** Remove comentários Java, para não acusar menções em texto. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

async function usesBuiltInRegex(workspaceDir) {
  const root = path.join(workspaceDir, "src");
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".java") && /\bjava\.util\.regex\s*\./.test(withoutComments(await fs.readFile(full, "utf8")))) {
        offenders.push(path.relative(workspaceDir, full));
      }
    }
  };
  await walk(root);
  return offenders;
}

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "grep.jar");
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

  const offenders = await usesBuiltInRegex(workspaceDir);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pw-grep-"));
  const results = [];
  try {
    const jarExists = await fs.access(jar).then(() => true, () => false);
    const ctx = { jar, tmp };
    for (const test of tests) {
      onProgress({ type: "stage-start", number: test.number, title: test.title });
      const startedAt = Date.now();
      let result;
      try {
        if (!jarExists) throw new Error(`${jar} não encontrado — o build gerou o jar?`);
        if (offenders.length) {
          throw new Error(`o desafio é escrever o próprio motor de regex: remova java.util.regex de ${offenders.join(", ")}`);
        }
        await test.run(ctx);
        result = { number: test.number, title: test.title, ok: true, durationMs: Date.now() - startedAt };
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
    console.log(`\nSaída do programa:\n${result.logs.slice(-4000)}`);
    process.exitCode = 1;
  }
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(`\n💥 ${error.message}`);
    process.exit(1);
  });
}
