#!/usr/bin/env node
/**
 * Tester local do desafio SQLite.
 *
 * Gera bancos aleatórios com o SQLite embutido no Node (`node:sqlite`, Node 22.13+),
 * calcula as respostas esperadas com o próprio SQLite e compara com a saída de
 * `java -jar target/sqlite.jar <banco> <comando>`.
 *
 * No stage 9, as páginas folha da tabela que não contêm nenhuma linha do resultado são
 * zeradas: só uma busca pelo índice (seguida de busca por rowid) consegue responder.
 *
 * Uso:
 *   node challenges/sqlite/tests/run-stages.mjs
 *   node challenges/sqlite/tests/run-stages.mjs --dir <workspace> --no-build
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
const COMMAND_TIMEOUT_MS = 30_000;

const FRUITS = ["apples", "oranges", "bananas", "grapes", "melons", "cherries", "lemons", "plums", "pears", "kiwis"];
const COLORS = ["Red", "Yellow", "Green", "Purple", "Orange", "Pink"];
const WORDS = ["arcane", "crystal", "shadow", "ember", "frost", "storm", "rune", "sage", "lunar", "solar", "iron", "velvet"];
const SCHOOLS = ["Evocation", "Illusion", "Necromancy", "Abjuration", "Divination", "Conjuration", "Transmutation"];
const COUNTRIES = ["brazil", "portugal", "germany", "france", "japan", "canada", "india", "kenya", "mexico", "norway", "chile", "spain"];
const RARE_COUNTRIES = ["eritrea", "tuvalu", "andorra", "bhutan", "nauru", "palau", "comoros", "liechtenstein"];

let sqliteModule = null;
async function sqlite() {
  if (sqliteModule) return sqliteModule;
  try {
    sqliteModule = await import("node:sqlite");
  } catch {
    throw new Error(`(tester) este desafio precisa de node:sqlite (Node 22.13+); você está no Node ${process.version}`);
  }
  return sqliteModule;
}

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function phrase(words = 2) {
  return Array.from({ length: words }, () => pick(WORDS)).join(" ");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ----------------------------------------------------------------- bancos

async function createDatabase(ctx, { pageSize = 4096, setup }) {
  const { DatabaseSync } = await sqlite();
  const file = path.join(ctx.tmp, `db-${crypto.randomBytes(4).toString("hex")}.db`);
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA page_size = ${pageSize}; PRAGMA journal_mode = DELETE;`);
  db.exec("BEGIN");
  setup(db);
  db.exec("COMMIT");
  db.close();
  return file;
}

async function queryAll(file, sql, params = []) {
  const { DatabaseSync } = await sqlite();
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

function rowsToLines(rows) {
  return rows.map((row) => Object.values(row).map((value) => (value === null ? "" : String(value))).join("|"));
}

function fruitTable(db, name, count) {
  db.exec(`CREATE TABLE ${name} (id integer primary key, name text, color text)`);
  const insert = db.prepare(`INSERT INTO ${name} (name, color) VALUES (?, ?)`);
  for (let i = 0; i < count; i++) insert.run(`${phrase(2)} ${i}`, pick(COLORS));
}

// --------------------------------------------------------------- processos

let logs = "";

function program(ctx, args) {
  return new Promise((resolve) => {
    const child = spawn("java", ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", ctx.jar, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
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
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: "", stderr: error.message, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      logs += `$ your_program.sh ${path.basename(args[0])} ${JSON.stringify(args[1])}\n${out.slice(0, 1500)}${err.slice(-1500)}`;
      if (!logs.endsWith("\n")) logs += "\n";
      resolve({ code, stdout: out, stderr: err, timedOut });
    });
  });
}

async function runOk(ctx, file, command) {
  const result = await program(ctx, [file, command]);
  const label = `./your_program.sh <banco> ${JSON.stringify(command)}`;
  if (result.timedOut) throw new Error(`${label} não terminou em ${COMMAND_TIMEOUT_MS / 1000}s`);
  if (result.code !== 0) {
    const detail = result.stderr.trim().split(/\r?\n/).slice(0, 2).join(" | ");
    throw new Error(`${label} saiu com código ${result.code}${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

function outputLines(stdout) {
  return stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
}

async function expectRows(ctx, file, sql, expected) {
  const actual = outputLines(await runOk(ctx, file, sql)).sort();
  const sortedExpected = [...expected].sort();
  const missing = sortedExpected.filter((line) => !actual.includes(line));
  const extra = actual.filter((line) => !sortedExpected.includes(line));
  assert(
    missing.length === 0 && extra.length === 0 && actual.length === sortedExpected.length,
    `${sql}: esperava ${sortedExpected.length} linha(s), recebeu ${actual.length}` +
      (missing.length ? `; faltando ${JSON.stringify(missing.slice(0, 3))}` : "") +
      (extra.length ? `; sobrando ${JSON.stringify(extra.slice(0, 3))}` : "")
  );
}

// ------------------------------------------------- corrupção controlada (stage 9)

function readVarint(buf, offset) {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    const byte = buf[offset + i];
    value = (value << 7n) | BigInt(byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, i + 1];
  }
  return [(value << 8n) | BigInt(buf[offset + 8]), 9];
}

/** Zera as folhas da tabela que não têm nenhum dos rowids de `keep`. */
async function zeroUnneededLeaves(file, table, keep, pageSize) {
  const leaves = (await queryAll(file, "SELECT pageno FROM dbstat WHERE name = ? AND pagetype = 'leaf'", [table]))
    .map((row) => Number(row.pageno));
  const buf = await fs.readFile(file);
  let zeroed = 0;
  for (const pageno of leaves) {
    const start = (pageno - 1) * pageSize;
    const page = buf.subarray(start, start + pageSize);
    assert(page[0] === 0x0d, `(tester) página ${pageno} não é folha de tabela`);
    const cells = page.readUInt16BE(3);
    let needed = false;
    for (let i = 0; i < cells; i++) {
      const cell = page.readUInt16BE(8 + 2 * i);
      const [, sizeLength] = readVarint(page, cell);
      const [rowid] = readVarint(page, cell + sizeLength);
      if (keep.has(Number(rowid))) needed = true;
    }
    if (!needed) {
      page.fill(0);
      zeroed++;
    }
  }
  await fs.writeFile(file, buf);
  return { leaves: leaves.length, zeroed };
}

// ------------------------------------------------------------------- stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

stage(1, "Print page size", async (ctx) => {
  for (const pageSize of shuffled([1024, 2048, 4096, 8192, 16384]).slice(0, 3)) {
    const file = await createDatabase(ctx, { pageSize, setup: (db) => fruitTable(db, "apples", 3) });
    const stdout = await runOk(ctx, file, ".dbinfo");
    const match = stdout.match(/^database page size:\s*(\d+)\s*$/m);
    assert(match, `.dbinfo deveria imprimir "database page size: ${pageSize}", imprimiu ${JSON.stringify(stdout.trim())}`);
    assert(Number(match[1]) === pageSize, `database page size: ${match[1]}, esperava ${pageSize}`);
  }
});

stage(2, "Print number of tables", async (ctx) => {
  for (const count of [2 + crypto.randomInt(2), 4 + crypto.randomInt(3)]) {
    const names = shuffled(FRUITS).slice(0, count);
    const file = await createDatabase(ctx, { setup: (db) => names.forEach((name) => fruitTable(db, name, 2)) });
    const stdout = await runOk(ctx, file, ".dbinfo");
    const match = stdout.match(/^number of tables:\s*(\d+)\s*$/m);
    assert(match, `.dbinfo deveria imprimir "number of tables: ${count}", imprimiu ${JSON.stringify(stdout.trim())}`);
    assert(Number(match[1]) === count, `number of tables: ${match[1]}, esperava ${count}`);
  }
});

stage(3, "Print table names", async (ctx) => {
  const names = shuffled(FRUITS).slice(0, 3 + crypto.randomInt(4));
  const file = await createDatabase(ctx, { setup: (db) => names.forEach((name) => fruitTable(db, name, 2)) });
  const actual = (await runOk(ctx, file, ".tables")).trim().split(/\s+/).filter(Boolean).sort();
  const expected = [...names].sort();
  assert(
    actual.join(" ") === expected.join(" "),
    `.tables: esperava ${expected.join(" ")} (em qualquer ordem), recebeu ${actual.join(" ") || "(nada)"}`
  );
});

stage(4, "Count rows in a table", async (ctx) => {
  const counts = { apples: 3 + crypto.randomInt(10), oranges: 10 + crypto.randomInt(20) };
  const file = await createDatabase(ctx, {
    setup: (db) => Object.entries(counts).forEach(([name, count]) => fruitTable(db, name, count)),
  });
  for (const [name, count] of Object.entries(counts)) {
    const stdout = (await runOk(ctx, file, `SELECT COUNT(*) FROM ${name}`)).trim();
    assert(stdout === String(count), `SELECT COUNT(*) FROM ${name}: esperava ${count}, recebeu ${JSON.stringify(stdout)}`);
  }
});

stage(5, "Read data from a single column", async (ctx) => {
  const file = await createDatabase(ctx, {
    setup: (db) => {
      fruitTable(db, "apples", 4 + crypto.randomInt(6));
      fruitTable(db, "grapes", 4 + crypto.randomInt(6));
    },
  });
  for (const sql of ["SELECT name FROM apples", "SELECT color FROM grapes"]) {
    await expectRows(ctx, file, sql, rowsToLines(await queryAll(file, sql)));
  }
});

stage(6, "Read data from multiple columns", async (ctx) => {
  const file = await createDatabase(ctx, { setup: (db) => fruitTable(db, "apples", 5 + crypto.randomInt(6)) });
  for (const sql of ["SELECT name, color FROM apples", "SELECT color, name FROM apples"]) {
    await expectRows(ctx, file, sql, rowsToLines(await queryAll(file, sql)));
  }
});

stage(7, "Filter data with a WHERE clause", async (ctx) => {
  const file = await createDatabase(ctx, { setup: (db) => fruitTable(db, "apples", 12 + crypto.randomInt(8)) });
  const colors = (await queryAll(file, "SELECT DISTINCT color FROM apples")).map((row) => row.color);
  const color = pick(colors);
  const sql = `SELECT name, color FROM apples WHERE color = '${color}'`;
  await expectRows(ctx, file, sql, rowsToLines(await queryAll(file, sql)));
  const none = "SELECT name FROM apples WHERE color = 'Transparent'";
  await expectRows(ctx, file, none, []);
});

stage(8, "Retrieve data using a full-table scan", async (ctx) => {
  const rows = 2500 + crypto.randomInt(1500);
  const file = await createDatabase(ctx, {
    pageSize: 1024,
    setup: (db) => {
      db.exec("CREATE TABLE spells\n(\n\tid integer primary key,\n\tname text,\n\tschool text,\n\tlevel integer\n)");
      const insert = db.prepare("INSERT INTO spells (name, school, level) VALUES (?, ?, ?)");
      for (let i = 0; i < rows; i++) insert.run(`${phrase(3)} ${i}`, pick(SCHOOLS), crypto.randomInt(10));
    },
  });
  const depth = await queryAll(file, "SELECT COUNT(*) AS n FROM dbstat WHERE name = 'spells' AND pagetype = 'internal'");
  assert(Number(depth[0].n) > 0, "(tester) a tabela deveria ocupar várias páginas");

  const count = (await runOk(ctx, file, "SELECT COUNT(*) FROM spells")).trim();
  assert(count === String(rows), `SELECT COUNT(*) FROM spells: esperava ${rows}, recebeu ${JSON.stringify(count)}`);

  const school = pick(SCHOOLS);
  const sql = `SELECT id, name, level FROM spells WHERE school = '${school}'`;
  await expectRows(ctx, file, sql, rowsToLines(await queryAll(file, sql)));
});

stage(9, "Retrieve data using an index", async (ctx) => {
  const pageSize = 1024;
  const rows = 5000 + crypto.randomInt(2000);
  const target = pick(RARE_COUNTRIES);
  const targetRows = new Set(Array.from({ length: 6 }, () => 1 + crypto.randomInt(rows)));
  const file = await createDatabase(ctx, {
    pageSize,
    setup: (db) => {
      db.exec("CREATE TABLE companies\n(\n\tid integer primary key,\n\tname text,\n\tcountry text,\n\tsize_range text\n)");
      db.exec("CREATE INDEX idx_companies_country\n\ton companies (country)");
      const insert = db.prepare("INSERT INTO companies (name, country, size_range) VALUES (?, ?, ?)");
      for (let i = 1; i <= rows; i++) {
        const country = targetRows.has(i) ? target : pick(COUNTRIES);
        insert.run(`${phrase(2)} labs ${i}`, country, pick(["1-10", "11-50", "51-200", "201-500"]));
      }
    },
  });

  const sql = `SELECT id, name FROM companies WHERE country = '${target}'`;
  const expected = rowsToLines(await queryAll(file, sql));
  const keep = new Set((await queryAll(file, `SELECT id FROM companies WHERE country = '${target}'`)).map((row) => Number(row.id)));
  const { leaves, zeroed } = await zeroUnneededLeaves(file, "companies", keep, pageSize);
  assert(zeroed > leaves / 2, "(tester) a corrupção controlada deveria atingir a maioria das folhas");

  try {
    await expectRows(ctx, file, sql, expected);
  } catch (error) {
    throw new Error(
      `${error.message}. Dica: ${zeroed} de ${leaves} páginas folha da tabela foram zeradas — ` +
        "use o índice idx_companies_country e busque cada linha pelo rowid, sem varrer a tabela"
    );
  }
});

// ------------------------------------------------------------------- runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "sqlite.jar");
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

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pw-sqlite-"));
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
