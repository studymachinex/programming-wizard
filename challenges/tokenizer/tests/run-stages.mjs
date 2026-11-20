#!/usr/bin/env node
/**
 * Tester local do desafio Tokenizer.
 *
 * Cada stage executa `java -jar target/tokenizer.jar <comando>` com a entrada no stdin e
 * compara a saída com uma implementação de referência em JavaScript (abaixo). O stage 8
 * usa o vocabulário real do GPT-2 (data/gpt2/vocab.bpe), versionado no repositório.
 *
 * Uso:
 *   node challenges/tokenizer/tests/run-stages.mjs
 *   node challenges/tokenizer/tests/run-stages.mjs --dir <workspace> --no-build
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const VOCAB_FILE = path.resolve(HERE, "..", "data", "gpt2", "vocab.bpe");
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const COMMAND_TIMEOUT_MS = 30_000;

const WORDS = [
  "the", "wizard", "casts", "a", "spell", "on", "tokens", "and", "bytes", "merge",
  "into", "longer", "pieces", "while", "learning", "patterns", "from", "text", "every",
  "pair", "counts", "frequency", "encoding", "decoding", "magic", "is", "just", "statistics",
];

const UNICODE_SAMPLES = ["café", "naïve", "coração", "ação", "東京", "🧙", "✨", "Ω", "über", "ñandú"];

function randomText(words, { unicode = false } = {}) {
  const out = [];
  for (let i = 0; i < words; i++) {
    let word = WORDS[crypto.randomInt(WORDS.length)];
    if (unicode && crypto.randomInt(6) === 0) word = UNICODE_SAMPLES[crypto.randomInt(UNICODE_SAMPLES.length)];
    out.push(word);
  }
  return `${out.join(" ")}.`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function preview(text, max = 60) {
  const json = JSON.stringify(text);
  return json.length > max ? `${json.slice(0, max)}…"` : json;
}

function diffIds(actual, expected) {
  const index = actual.findIndex((value, i) => value !== expected[i]);
  const at = index < 0 ? Math.min(actual.length, expected.length) : index;
  return `primeira diferença na posição ${at}: recebeu ${actual[at] ?? "(fim)"}, esperava ${expected[at] ?? "(fim)"} ` +
    `(${actual.length} ids recebidos, ${expected.length} esperados)`;
}

// ------------------------------------------------- implementação de referência

function utf8Ids(text) {
  return [...Buffer.from(text, "utf8")];
}

function mostFrequentPair(ids) {
  const counts = new Map();
  for (let i = 0; i + 1 < ids.length; i++) {
    const key = `${ids[i]},${ids[i + 1]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best ? best.split(",").map(Number) : null;
}

function mergeIds(ids, a, b, id) {
  const out = [];
  for (let i = 0; i < ids.length; ) {
    if (i + 1 < ids.length && ids[i] === a && ids[i + 1] === b) {
      out.push(id);
      i += 2;
    } else {
      out.push(ids[i]);
      i += 1;
    }
  }
  return out;
}

function train(ids, vocabSize) {
  const merges = [];
  for (let id = 256; id < vocabSize && ids.length >= 2; id++) {
    const [a, b] = mostFrequentPair(ids);
    ids = mergeIds(ids, a, b, id);
    merges.push([a, b, id]);
  }
  return merges;
}

function encodeWithRanks(ids, ranks) {
  while (ids.length >= 2) {
    let best = null;
    for (let i = 0; i + 1 < ids.length; i++) {
      const id = ranks.get(`${ids[i]},${ids[i + 1]}`);
      if (id !== undefined && (best === null || id < best[2])) best = [ids[i], ids[i + 1], id];
    }
    if (!best) break;
    ids = mergeIds(ids, ...best);
  }
  return ids;
}

function encode(ids, merges) {
  return encodeWithRanks(ids, new Map(merges.map(([a, b, id]) => [`${a},${b}`, id])));
}

const GPT2_SPLIT = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

function split(text) {
  return text.match(GPT2_SPLIT) ?? [];
}

let gpt2Cache = null;
async function gpt2() {
  if (gpt2Cache) return gpt2Cache;
  const bs = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 0xa1; b <= 0xac; b++) bs.push(b);
  for (let b = 0xae; b <= 0xff; b++) bs.push(b);
  const unicodeOf = new Map(bs.map((b) => [b, b]));
  let extra = 0;
  for (let b = 0; b < 256; b++) {
    if (!unicodeOf.has(b)) {
      bs.push(b);
      unicodeOf.set(b, 256 + extra++);
    }
  }
  const idOfByte = new Array(256);
  bs.forEach((b, i) => {
    idOfByte[b] = i;
  });
  const tokenIds = new Map();
  for (let b = 0; b < 256; b++) tokenIds.set(String.fromCodePoint(unicodeOf.get(b)), idOfByte[b]);

  const ranks = new Map();
  const lines = (await fs.readFile(VOCAB_FILE, "utf8")).split(/\r?\n/);
  let rank = 0;
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#version")) continue;
    const [a, b] = line.split(" ");
    const id = 256 + rank++;
    ranks.set(`${tokenIds.get(a)},${tokenIds.get(b)}`, id);
    tokenIds.set(a + b, id);
  }
  gpt2Cache = { idOfByte, ranks };
  return gpt2Cache;
}

async function gpt2Encode(text) {
  const { idOfByte, ranks } = await gpt2();
  return split(text).flatMap((chunk) => encodeWithRanks(utf8Ids(chunk).map((b) => idOfByte[b]), ranks));
}

// ---------------------------------------------------------------- processos

let logs = "";

function program(ctx, args, input) {
  return new Promise((resolve) => {
    const child = spawn("java", ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", ctx.jar, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, COMMAND_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, raw: Buffer.alloc(0), stdout: "", stderr: error.message, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const raw = Buffer.concat(stdout);
      const err = Buffer.concat(stderr).toString("utf8");
      logs += `$ your_program.sh ${args.join(" ")} < ${preview(input.toString())}\n${raw.toString("utf8").slice(0, 2000)}${err}`;
      if (!logs.endsWith("\n")) logs += "\n";
      resolve({ code, raw, stdout: raw.toString("utf8"), stderr: err, timedOut });
    });
    child.stdin.end(input);
  });
}

async function runOk(ctx, args, input) {
  const result = await program(ctx, args, Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8"));
  const command = `./your_program.sh ${args.join(" ")}`;
  if (result.timedOut) throw new Error(`${command} não terminou em ${COMMAND_TIMEOUT_MS / 1000}s`);
  if (result.code !== 0) {
    const detail = result.stderr.trim().split(/\r?\n/).slice(-3).join(" | ");
    throw new Error(`${command} saiu com código ${result.code}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function parseIdLine(stdout, command) {
  const text = stdout.trim();
  assert(/^[\d\s]*$/.test(text), `${command} deveria imprimir só números separados por espaço, imprimiu ${preview(text)}`);
  return text ? text.split(/\s+/).map(Number) : [];
}

async function expectIds(ctx, args, input, expected) {
  const command = args.join(" ");
  const { stdout } = await runOk(ctx, args, input);
  const actual = parseIdLine(stdout, command);
  assert(
    actual.length === expected.length && actual.every((value, i) => value === expected[i]),
    `${command} com entrada ${preview(String(input))}: ${diffIds(actual, expected)}`
  );
}

async function writeMerges(ctx, merges) {
  const file = path.join(ctx.tmp, `merges-${crypto.randomBytes(3).toString("hex")}.txt`);
  await fs.writeFile(file, merges.map(([a, b, id]) => `${a} ${b} -> ${id}`).join("\n") + "\n");
  return file;
}

// ------------------------------------------------------------------- stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

stage(1, "UTF-8 bytes", async (ctx) => {
  for (const text of ["hello", "Olá, mundo!", "🧙 wizard ✨", randomText(5, { unicode: true })]) {
    await expectIds(ctx, ["bytes"], text, utf8Ids(text));
  }
});

stage(2, "Most frequent pair", async (ctx) => {
  const cases = [
    [1, 2, 3, 1, 2],
    [5, 6, 7, 8, 7, 8, 5, 6], // empate: (5,6) aparece primeiro
    [9, 9, 9, 1],             // pares sobrepostos contam: (9,9) = 2
    Array.from({ length: 40 }, () => crypto.randomInt(6)),
  ];
  for (const ids of cases) {
    const input = ids.join(" ");
    const { stdout } = await runOk(ctx, ["pair"], input);
    const expected = mostFrequentPair(ids).join(" ");
    assert(stdout.trim() === expected, `pair com entrada "${input}": esperava "${expected}", recebeu ${preview(stdout.trim())}`);
  }
});

stage(3, "Merge a pair", async (ctx) => {
  const cases = [
    { ids: [1, 2, 3, 1, 2], pair: [1, 2], id: 256 },
    { ids: [7, 7, 7, 7, 7], pair: [7, 7], id: 300 }, // sem sobreposição: 300 300 7
    { ids: [4, 5, 4, 4, 5, 5], pair: [4, 5], id: 260 },
  ];
  const random = Array.from({ length: 50 }, () => crypto.randomInt(4));
  cases.push({ ids: random, pair: mostFrequentPair(random), id: 256 + crypto.randomInt(100) });
  for (const { ids, pair, id } of cases) {
    await expectIds(ctx, ["merge", String(pair[0]), String(pair[1]), String(id)], ids.join(" "), mergeIds(ids, pair[0], pair[1], id));
  }
});

stage(4, "Learn merges", async (ctx) => {
  const text = `${randomText(120)} ${randomText(60, { unicode: true })}`;
  const vocabSize = 256 + 40;
  const expected = train(utf8Ids(text), vocabSize).map(([a, b, id]) => `${a} ${b} -> ${id}`);
  const { stdout } = await runOk(ctx, ["train", String(vocabSize)], text);
  const actual = stdout.trim().split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, " "));
  assert(actual.length === expected.length, `train ${vocabSize}: esperava ${expected.length} merges, recebeu ${actual.length}`);
  const index = actual.findIndex((line, i) => line !== expected[i]);
  assert(index < 0, `merge #${index + 1}: esperava "${expected[index]}", recebeu "${actual[index]}"`);
});

stage(5, "Encode", async (ctx) => {
  const training = `${randomText(150)} ${randomText(80, { unicode: true })}`;
  const merges = train(utf8Ids(training), 256 + 60);
  const file = await writeMerges(ctx, merges);
  for (const text of [randomText(25), randomText(20, { unicode: true }), "the wizard the wizard"]) {
    await expectIds(ctx, ["encode", file], text, encode(utf8Ids(text), merges));
  }
});

stage(6, "Decode", async (ctx) => {
  const training = `${randomText(150, { unicode: true })}`;
  const merges = train(utf8Ids(training), 256 + 60);
  const file = await writeMerges(ctx, merges);
  for (const text of [randomText(25, { unicode: true }), "café 🧙 東京"]) {
    const ids = encode(utf8Ids(text), merges);
    const { raw } = await runOk(ctx, ["decode", file], ids.join(" "));
    assert(
      raw.equals(Buffer.from(text, "utf8")),
      `decode: esperava os bytes de ${preview(text)}, recebeu ${preview(raw.toString("utf8"))} (não imprima quebra de linha extra)`
    );
  }
});

stage(7, "Split like GPT-2", async (ctx) => {
  const texts = [
    "Hello world, I'm a wizard!",
    "They've said it'll work... 2024 tokens?",
    "  espaços   múltiplos\n\nnova linha\ttab",
    `${randomText(12, { unicode: true })} 123 4567 ${randomText(6)}!!`,
  ];
  for (const text of texts) {
    const expected = split(text);
    const { stdout } = await runOk(ctx, ["split"], text);
    const lines = stdout.replace(/\r?\n$/, "").split(/\r?\n/);
    let actual;
    try {
      actual = lines.map((line) => JSON.parse(line));
    } catch {
      throw new Error(`split: cada linha deve ser uma string JSON; recebeu ${preview(stdout)}`);
    }
    const index = actual.findIndex((chunk, i) => chunk !== expected[i]);
    assert(
      actual.length === expected.length && index < 0,
      `split ${preview(text)}: chunk #${(index < 0 ? Math.min(actual.length, expected.length) : index) + 1} ` +
        `recebeu ${JSON.stringify(actual[index < 0 ? actual.length : index] ?? "(fim)")}, ` +
        `esperava ${JSON.stringify(expected[index < 0 ? actual.length : index] ?? "(fim)")}`
    );
  }
});

stage(8, "Match GPT-2", async (ctx) => {
  const sanity = await gpt2Encode("Hello world");
  assert(sanity.join(" ") === "15496 995", "(tester) referência GPT-2 inconsistente — vocab.bpe corrompido?");
  const texts = [
    "Hello world",
    "The quick brown fox jumps over the lazy dog. I'm sure it's fine!",
    "Tokenização em português também funciona: coração, ação, você.",
    `${randomText(40, { unicode: true })}\n\n  ${randomText(10)} 31415 🧙✨`,
  ];
  for (const text of texts) {
    await expectIds(ctx, ["gpt2", VOCAB_FILE], text, await gpt2Encode(text));
  }
});

// ------------------------------------------------------------------- runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "tokenizer.jar");
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

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pw-tokenizer-"));
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
