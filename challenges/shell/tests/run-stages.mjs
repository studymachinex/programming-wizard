#!/usr/bin/env node
/**
 * Tester local do desafio Shell.
 *
 * Não há pseudo-terminal: o tester conversa com o shell por pipes. Ele escreve no stdin os
 * bytes exatamente como seriam digitados (inclusive Tab = \t e seta ↑ = ESC [ A) e lê o
 * stdout+stderr mesclados num único pipe, na ordem em que foram escritos. A saída é
 * interpretada por um emulador de terminal mínimo (\r, \b, ESC[K, ...) e as verificações
 * olham para as linhas da "tela".
 *
 * Eco: num terminal de verdade quem ecoa o que você digita é o terminal (ou o readline). Aqui
 * não existe terminal, então:
 *   - nos stages de linha inteira, se o shell não ecoar a linha, o tester a "desenha" sozinho;
 *   - nos stages de teclas (autocompletar, setas), o shell precisa ecoar cada tecla.
 *
 * Os programas externos usados nos testes (cat, ls, head, wc, sleep, ...) são scripts Node
 * criados pelo tester num diretório próprio — o PATH do shell contém só diretórios do tester,
 * então o resultado é o mesmo em Linux, macOS e Windows. No Windows eles são arquivos .cmd.
 *
 * Uso:
 *   node challenges/shell/tests/run-stages.mjs
 *   node challenges/shell/tests/run-stages.mjs --dir <workspace> --no-build
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const IS_WINDOWS = process.platform === "win32";
const PROMPT = "$ ";
const UP = "\u001b[A";
const DOWN = "\u001b[B";

const WORDS = ["abacaxi", "banana", "caju", "damasco", "figo", "goiaba", "jaca", "kiwi", "limao", "manga", "pitanga", "uva"];
const COLORS = ["azul", "verde", "roxo", "laranja", "cinza", "marrom"];

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

function rand(min, max) {
  return min + crypto.randomInt(max - min + 1);
}

function token() {
  return crypto.randomBytes(3).toString("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function show(text) {
  return JSON.stringify(text).replaceAll("\\u001b", "\\e").replaceAll("\\u0007", "\\a");
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------- emulador de terminal

/** Interpreta a saída como um terminal sem limite de colunas. */
function renderScreen(text) {
  const lines = [[]];
  let row = 0;
  let col = 0;
  const ensureRow = () => {
    while (lines.length <= row) lines.push([]);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      row++;
      col = 0;
      ensureRow();
    } else if (c === "\r") {
      col = 0;
    } else if (c === "\b") {
      col = Math.max(0, col - 1);
    } else if (c === "\u001b") {
      if (text[i + 1] !== "[") {
        i++;
        continue;
      }
      let j = i + 2;
      let params = "";
      while (j < text.length && /[0-9;?]/.test(text[j])) params += text[j++];
      const final = text[j];
      i = j;
      const n = Number.parseInt(params || "1", 10) || 1;
      const line = lines[row];
      switch (final) {
        case "K": {
          const mode = Number.parseInt(params || "0", 10);
          if (mode === 0) line.length = Math.min(line.length, col);
          else if (mode === 1) for (let k = 0; k < Math.min(col, line.length); k++) line[k] = " ";
          else lines[row] = [];
          break;
        }
        case "D":
          col = Math.max(0, col - n);
          break;
        case "C":
          col += n;
          break;
        case "A":
          row = Math.max(0, row - n);
          break;
        case "B":
          row += n;
          ensureRow();
          break;
        case "G":
          col = n - 1;
          break;
        default:
          break;
      }
    } else if (c >= " ") {
      const line = lines[row];
      while (line.length < col) line.push(" ");
      line[col] = c;
      col++;
    }
  }
  return { lines: lines.map((line) => line.join("")), row, col };
}

// --------------------------------------------------------- programas auxiliares

const HELPERS = {
  cat: `
const fs = require("fs");
process.stdout.on("error", () => process.exit(0));
const files = process.argv.slice(2);
if (!files.length) process.stdin.pipe(process.stdout);
for (const file of files) {
  try { process.stdout.write(fs.readFileSync(file)); }
  catch { process.stderr.write("cat: " + file + ": No such file or directory\\n"); process.exitCode = 1; }
}`,
  ls: `
const fs = require("fs");
process.stdout.on("error", () => process.exit(0));
const targets = process.argv.slice(2).filter((a) => !a.startsWith("-"));
let out = "";
for (const target of targets.length ? targets : ["."]) {
  let stat;
  try { stat = fs.statSync(target); }
  catch { process.stderr.write("ls: " + target + ": No such file or directory\\n"); process.exitCode = 2; continue; }
  if (!stat.isDirectory()) { out += target + "\\n"; continue; }
  for (const name of fs.readdirSync(target).filter((n) => !n.startsWith(".")).sort()) out += name + "\\n";
}
process.stdout.write(out);`,
  head: `
const fs = require("fs");
process.stdout.on("error", () => process.exit(0));
const args = process.argv.slice(2);
let n = 10;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-n") n = Number(args[++i]);
  else if (/^-\\d+$/.test(args[i])) n = Number(args[i].slice(1));
  else files.push(args[i]);
}
const input = files.length ? fs.createReadStream(files[0]) : process.stdin;
let pending = "";
let printed = 0;
if (n <= 0) process.exit(0);
input.on("data", (chunk) => {
  pending += chunk.toString("utf8");
  let index;
  let out = "";
  while (printed < n && (index = pending.indexOf("\\n")) >= 0) {
    out += pending.slice(0, index + 1);
    pending = pending.slice(index + 1);
    printed++;
  }
  if (out) process.stdout.write(out);
  if (printed >= n) process.stdout.write("", () => process.exit(0));
});
input.on("end", () => { if (pending) process.stdout.write(pending); });
input.on("error", () => { process.stderr.write("head: " + files[0] + ": No such file or directory\\n"); process.exitCode = 1; });`,
  wc: `
const fs = require("fs");
const file = process.argv.slice(2).find((a) => !a.startsWith("-"));
const count = (text) => {
  text = text.replace(/\\r\\n/g, "\\n");
  const lines = (text.match(/\\n/g) || []).length;
  const words = text.split(/\\s+/).filter(Boolean).length;
  const pad = (v) => String(v).padStart(7);
  console.log(pad(lines) + " " + pad(words) + " " + pad(Buffer.byteLength(text)) + (file ? " " + file : ""));
};
if (file) {
  try { count(fs.readFileSync(file, "utf8")); }
  catch { process.stderr.write("wc: " + file + ": No such file or directory\\n"); process.exitCode = 1; }
} else {
  const chunks = [];
  process.stdin.on("data", (c) => chunks.push(c));
  process.stdin.on("end", () => count(Buffer.concat(chunks).toString("utf8")));
}`,
  sleep: `setTimeout(() => {}, Number(process.argv[2] || 0) * 1000);`,
  ticker: `
process.stdout.on("error", () => process.exit(0));
let i = 0;
setInterval(() => { i++; process.stdout.write("tick " + i + "\\n"); }, 100);`,
  delayed_echo: `setTimeout(() => console.log(process.argv.slice(3).join(" ")), Number(process.argv[2] || 0) * 1000);`,
  show_args: `
const args = process.argv.slice(2);
console.log("argc: " + args.length);
args.forEach((arg, i) => console.log((i + 1) + ": <" + arg + ">"));`,
};

/** Cria um executável que roda `source` com Node. Devolve o caminho do arquivo criado. */
async function makeExe(ctx, dir, name, source) {
  await fs.mkdir(dir, { recursive: true });
  if (IS_WINDOWS) {
    const js = path.join(ctx.jsDir, `${crypto.randomUUID()}.js`);
    await fs.writeFile(js, source);
    const file = path.join(dir, `${name}.cmd`);
    await fs.writeFile(file, `@"${process.execPath}" "${js}" %*\r\n`);
    return file;
  }
  const file = path.join(dir, name);
  await fs.writeFile(file, `#!${process.execPath}\n${source}\n`, { mode: 0o755 });
  return file;
}

function programSource(name, signature) {
  return `
const args = process.argv.slice(2);
console.log(${JSON.stringify(`Programa ${name} executado com `)} + args.length + " argumento(s)");
args.forEach((arg, i) => console.log("Argumento " + (i + 1) + ": " + arg));
console.log(${JSON.stringify(`Assinatura: ${signature}`)});`;
}

function programOutput(name, signature, args) {
  return [
    `Programa ${name} executado com ${args.length} argumento(s)`,
    ...args.map((arg, i) => `Argumento ${i + 1}: ${arg}`),
    `Assinatura: ${signature}`,
  ];
}

/** Completer para `complete -C`: filtra `candidates` pela palavra atual e registra o que recebeu. */
function completerSource(candidates, logFile) {
  return `
const fs = require("fs");
const [command, current = "", previous = ""] = process.argv.slice(2);
${logFile ? `fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ args: process.argv.slice(2), line: process.env.COMP_LINE, point: process.env.COMP_POINT }) + "\\n");` : ""}
for (const candidate of ${JSON.stringify(candidates)}) if (candidate.startsWith(current)) console.log(candidate);`;
}

function findJava() {
  const exe = IS_WINDOWS ? "java.exe" : "java";
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, "bin", exe);
    if (existsSync(candidate)) return candidate;
  }
  for (const dir of (process.env.PATH || process.env.Path || "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, exe);
    if (existsSync(candidate)) return candidate;
  }
  return exe;
}

// -------------------------------------------------------------------- sessão

let logs = "";

class ShellSession {
  constructor(ctx, { cwd, path: pathDirs = [], env = {}, home }) {
    this.ctx = ctx;
    this.cwd = cwd;
    this.raw = "";
    this.echoes = [];
    this.listeners = new Set();
    this.exitCode = undefined;

    const childEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (/^(path|home|histfile|pathext|comp_line|comp_point)$/i.test(key) || key.startsWith("GIT_")) continue;
      childEnv[key] = value;
    }
    childEnv.PATH = [ctx.helpersDir, ...pathDirs].join(path.delimiter);
    childEnv.HOME = home ?? ctx.home;
    if (IS_WINDOWS) childEnv.PATHEXT = ".COM;.EXE;.BAT;.CMD";
    Object.assign(childEnv, env);

    const javaArgs = ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", ctx.jar];
    if (IS_WINDOWS) {
      const command = [ctx.java, ...javaArgs].map((arg) => `"${arg}"`).join(" ");
      this.child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${command} 2>&1"`], {
        cwd,
        env: childEnv,
        windowsVerbatimArguments: true,
        stdio: ["pipe", "pipe", "ignore"],
      });
    } else {
      this.child = spawn("/bin/sh", ["-c", 'exec "$@" 2>&1', "sh", ctx.java, ...javaArgs], {
        cwd,
        env: childEnv,
        detached: true,
        stdio: ["pipe", "pipe", "ignore"],
      });
    }
    const decoder = new StringDecoder("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.raw += decoder.write(chunk);
      this.notify();
    });
    this.child.stdin.on("error", () => {});
    this.child.on("error", (error) => {
      this.raw += `\n[erro ao iniciar o shell: ${error.message}]\n`;
      this.exitCode = -1;
      this.notify();
    });
    this.child.on("exit", (code) => {
      this.exitCode = code ?? -1;
      this.notify();
    });
  }

  notify() {
    for (const listener of [...this.listeners]) listener();
  }

  /** Saída do shell + as linhas que o tester desenha quando o shell não ecoa a entrada. */
  text() {
    let text = "";
    let last = 0;
    for (const echo of this.echoes) {
      text += this.raw.slice(last, echo.pos);
      const after = this.raw.slice(echo.pos);
      const expected = `${echo.text}\n`;
      const echoed =
        after.startsWith(expected) || after.startsWith(`${echo.text}\r\n`) || expected.startsWith(after) || `${echo.text}\r\n`.startsWith(after);
      if (!echoed) text += expected;
      last = echo.pos;
    }
    return text + this.raw.slice(last);
  }

  screen() {
    return renderScreen(this.text());
  }

  /** Linha do cursor; espaços em branco depois do cursor (restos de Backspace) são ignorados. */
  currentLine() {
    const screen = this.screen();
    const line = screen.lines[screen.row] ?? "";
    const rest = line.slice(screen.col);
    return rest.trim() ? line : line.slice(0, screen.col);
  }

  transcript() {
    return this.screen()
      .lines.join("\n")
      .replace(/\s+$/, "");
  }

  waitFor(check, timeoutMs, describeTimeout) {
    return new Promise((resolve, reject) => {
      let timer;
      const listener = () => {
        let value;
        try {
          value = check();
        } catch (error) {
          cleanup();
          reject(error);
          return;
        }
        if (value) {
          cleanup();
          resolve(value);
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(listener);
      };
      this.listeners.add(listener);
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(describeTimeout()));
      }, timeoutMs);
      listener();
    });
  }

  atPrompt(since) {
    if (this.raw.length <= since || !this.raw.endsWith(PROMPT)) return false;
    const screen = this.screen();
    return this.currentLine() === PROMPT && screen.col === PROMPT.length;
  }

  failIfExited(what) {
    if (this.exitCode !== undefined) {
      throw new Error(`o shell terminou (código ${this.exitCode}) ${what}`);
    }
  }

  async ready(timeoutMs = 15_000) {
    await this.waitFor(
      () => {
        if (this.atPrompt(-1)) return true;
        this.failIfExited("antes de mostrar o prompt \"$ \"");
        return false;
      },
      timeoutMs,
      () => `esperava o prompt ${show(PROMPT)}; a tela tem ${show(this.transcript())}`
    );
  }

  /** Envia bytes sem desenhar nada: o shell é quem ecoa (modo de teclas). */
  keys(bytes) {
    const mark = this.raw.length;
    this.child.stdin.write(bytes);
    return mark;
  }

  /** Envia uma linha (texto + Enter). Se o shell não ecoar, o tester desenha a linha. */
  sendLine(text) {
    const mark = this.raw.length;
    this.echoes.push({ pos: mark, text });
    this.child.stdin.write(`${text}\n`);
    return mark;
  }

  /** Digita `command`, aperta Enter e devolve as linhas impressas até o próximo prompt. */
  async run(command, { timeoutMs = 10_000 } = {}) {
    const startRow = this.screen().row;
    const mark = this.sendLine(command);
    await this.waitPrompt(mark, `depois de ${show(command)}`, timeoutMs);
    const screen = this.screen();
    return screen.lines.slice(startRow + 1, screen.row).map((line) => line.trimEnd());
  }

  async waitPrompt(mark, what, timeoutMs = 10_000) {
    await this.waitFor(
      () => {
        if (this.atPrompt(mark)) return true;
        this.failIfExited(what);
        return false;
      },
      timeoutMs,
      () => `esperava um novo prompt ${show(PROMPT)} ${what}; a tela termina com ${show(this.tail())}`
    );
  }

  /** Roda `command` e confere a saída linha a linha. */
  async expect(command, expected, options) {
    const lines = await this.run(command, options);
    assertLines(lines, expected, `$ ${command}`);
    return lines;
  }

  async expectScreenLine(expected, what, { timeoutMs = 5_000, trim = false } = {}) {
    const normalize = (line) => (trim ? line.trimEnd() : line);
    await this.waitFor(
      () => normalize(this.currentLine()) === normalize(expected),
      timeoutMs,
      () => `${what}: esperava a linha ${show(expected)}, mas a linha atual é ${show(this.currentLine())}`
    );
  }

  bellsSince(mark) {
    return this.raw.slice(mark).split("\u0007").length - 1;
  }

  async expectBell(mark, what) {
    await this.waitFor(
      () => this.bellsSince(mark) > 0,
      5_000,
      () => `${what}: esperava o sinal sonoro (o caractere BEL, \\a ou \\x07); a linha atual é ${show(this.currentLine())}`
    );
  }

  async waitExit(what, timeoutMs = 5_000) {
    return this.waitFor(
      () => this.exitCode !== undefined && { code: this.exitCode },
      timeoutMs,
      () => `${what}: o shell continuou rodando`
    );
  }

  tail() {
    const lines = this.screen().lines;
    return lines.slice(-4).join("\n");
  }

  async close() {
    if (this.exitCode === undefined && this.child.pid) {
      if (IS_WINDOWS) {
        spawnSync("taskkill", ["/pid", String(this.child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        try {
          process.kill(-this.child.pid, "SIGKILL");
        } catch {
          this.child.kill("SIGKILL");
        }
      }
      await this.waitFor(() => this.exitCode !== undefined, 5_000, () => "").catch(() => {});
    }
  }
}

function assertLines(actual, expected, label) {
  const same = actual.length === expected.length && actual.every((line, i) => line === expected[i]);
  if (same) return;
  const render = (lines) => (lines.length ? lines.map((line) => `      ${show(line)}`).join("\n") : "      (nenhuma linha)");
  throw new Error(`${label}\n   esperava:\n${render(expected)}\n   recebeu:\n${render(actual)}`);
}

/** Cria uma sessão, roda `fn` e sempre encerra o shell, guardando a tela no log. */
async function withShell(ctx, options, fn) {
  const session = new ShellSession(ctx, { cwd: ctx.dir, ...options });
  try {
    if (!options?.noReady) await session.ready();
    await fn(session);
  } finally {
    await session.close();
    logs += `--- stage ${ctx.stage} ---\n${session.transcript()}\n`;
  }
}

const native = (p) => path.resolve(p);
const slashes = (p) => p.replaceAll("\\", "/");
const exePath = (dir, name) => path.join(dir, IS_WINDOWS ? `${name}.cmd` : name);
const builtin = (name) => `${name} is a shell builtin`;
const jobLine = (number, marker, running, command) =>
  `[${number}]${marker}  ${(running ? "Running" : "Done").padEnd(24)}${command}${running ? " &" : ""}`;
const wcLine = (lines, words, bytes) => [lines, words, bytes].map((v) => String(v).padStart(7)).join(" ");

function wcOf(text) {
  return wcLine((text.match(/\n/g) || []).length, text.split(/\s+/).filter(Boolean).length, Buffer.byteLength(text));
}

async function write(ctx, relative, content) {
  const file = path.join(ctx.dir, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return file;
}

async function readFile(file) {
  return fs.readFile(file, "utf8").then(
    (text) => text.replaceAll("\r\n", "\n"),
    () => null
  );
}

async function expectFile(file, expected, label) {
  const content = await readFile(file);
  assert(content !== null, `${label}: o arquivo ${path.basename(file)} não foi criado`);
  assert(content === expected, `${label}: o arquivo ${path.basename(file)} contém ${show(content)}, esperava ${show(expected)}`);
}

/** Digita `typed`, aperta Tab e confere a linha resultante. */
async function expectCompletion(sh, typed, expectedLine) {
  sh.keys(`${typed}\t`);
  await sh.expectScreenLine(expectedLine, `digitou ${show(typed)} + Tab`);
}

/** Tab sem candidatos: toca o sinal e não muda a linha. */
async function expectNoCompletion(sh, typed) {
  const mark = sh.keys(`${typed}\t`);
  await sh.expectBell(mark, `digitou ${show(typed)} + Tab sem candidatos`);
  await delay(150);
  assert(sh.currentLine() === PROMPT + typed, `depois do Tab sem candidatos a linha deveria continuar ${show(PROMPT + typed)}, mas é ${show(sh.currentLine())}`);
}

/** Primeiro Tab toca o sinal; o segundo lista os candidatos e redesenha o prompt. */
async function expectListing(sh, typed, listing, alreadyTyped = false) {
  const line = PROMPT + typed;
  const mark = sh.keys(alreadyTyped ? "\t" : `${typed}\t`);
  await sh.expectBell(mark, `digitou ${show(typed)} + Tab com vários candidatos`);
  assert(sh.currentLine() === line, `o primeiro Tab com vários candidatos não deve mudar a linha: esperava ${show(line)}, está ${show(sh.currentLine())}`);
  sh.keys("\t");
  await sh.waitFor(
    () => {
      const screen = sh.screen();
      return sh.currentLine() === line && screen.lines[screen.row - 1]?.trimEnd() === listing;
    },
    5_000,
    () => `segundo Tab: esperava a lista ${show(listing)} numa linha e o prompt ${show(line)} na seguinte; a tela termina com ${show(sh.tail())}`
  );
}

/** Apaga a linha atual (Backspace) para seguir usando a mesma sessão. */
async function clearLine(sh) {
  const current = sh.currentLine().slice(PROMPT.length);
  sh.keys("\u007f".repeat(current.length));
  await sh.waitFor(() => sh.currentLine().trimEnd() === "$", 5_000, () => `Backspace deveria apagar a linha; ela está ${show(sh.currentLine())}`);
}

// ------------------------------------------------------------------- stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

// Core ----------------------------------------------------------------------

stage(1, "Print a prompt", async (ctx) => {
  await withShell(ctx, {}, async () => {});
});

stage(2, "Handle invalid commands", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const command = `${pick(WORDS)}_${token()}`;
    sh.sendLine(command);
    const expected = `${command}: command not found`;
    await sh.waitFor(
      () => sh.screen().lines.includes(expected),
      8_000,
      () => `$ ${command}\n   esperava a linha ${show(expected)}; a tela tem ${show(sh.transcript())}`
    );
  });
});

stage(3, "Implement a REPL", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    for (let i = 0; i < 3; i++) {
      const command = `${pick(WORDS)}_${token()}`;
      await sh.expect(command, [`${command}: command not found`]);
    }
  });
});

stage(4, "Implement exit", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const command = `${pick(WORDS)}_${token()}`;
    await sh.expect(command, [`${command}: command not found`]);
    sh.sendLine("exit");
    const { code } = await sh.waitExit("$ exit");
    assert(code === 0, `$ exit: o shell terminou com código ${code}, esperava 0`);
  });
});

stage(5, "Implement echo", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const words = [pick(WORDS), pick(COLORS), pick(WORDS)].join(" ");
    await sh.expect(`echo ${words}`, [words]);
    const single = pick(COLORS);
    await sh.expect(`echo ${single}`, [single]);
  });
});

stage(6, "Implement type", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    for (const name of ["echo", "exit", "type"]) await sh.expect(`type ${name}`, [builtin(name)]);
    const missing = `${pick(WORDS)}_${token()}`;
    await sh.expect(`type ${missing}`, [`${missing}: not found`]);
  });
});

stage(7, "Locate executable files", async (ctx) => {
  const first = path.join(ctx.dir, "sem-permissao");
  const second = path.join(ctx.dir, "ferramentas");
  const name = `tool_${token()}`;
  await fs.mkdir(first, { recursive: true });
  // No Unix: arquivo sem permissão de execução. No Windows: arquivo sem extensão do PATHEXT.
  await fs.writeFile(path.join(first, name), "não sou executável\n", { mode: 0o644 });
  const real = await makeExe(ctx, second, name, programSource(name, 1));
  await withShell(ctx, { path: [first, second] }, async (sh) => {
    await sh.expect("type cat", [`cat is ${exePath(ctx.helpersDir, "cat")}`]);
    await sh.expect(`type ${name}`, [`${name} is ${real}`]);
    const missing = `missing_${token()}`;
    await sh.expect(`type ${missing}`, [`${missing}: not found`]);
  });
});

stage(8, "Run a program", async (ctx) => {
  const bin = path.join(ctx.dir, "bin");
  const name = `custom_exe_${rand(1000, 9999)}`;
  const signature = rand(100000, 999999);
  await makeExe(ctx, bin, name, programSource(name, signature));
  await withShell(ctx, { path: [bin] }, async (sh) => {
    const args = [pick(WORDS), pick(COLORS)];
    await sh.expect(`${name} ${args.join(" ")}`, programOutput(name, signature, args));
    const one = [pick(WORDS)];
    await sh.expect(`${name} ${one[0]}`, programOutput(name, signature, one));
  });
});

// Navigation ------------------------------------------------------------------

stage(9, "The pwd builtin", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("type pwd", [builtin("pwd")]);
    await sh.expect("pwd", [ctx.dir]);
  });
});

stage(10, "The cd builtin: Absolute paths", async (ctx) => {
  const target = path.join(ctx.dir, pick(WORDS), pick(COLORS));
  await fs.mkdir(target, { recursive: true });
  await withShell(ctx, { cwd: ctx.home }, async (sh) => {
    await sh.expect(`cd ${slashes(target)}`, []);
    await sh.expect("pwd", [native(target)]);
    const missing = `${slashes(ctx.dir)}/nao_existe_${token()}`;
    await sh.expect(`cd ${missing}`, [`cd: ${missing}: No such file or directory`]);
    await sh.expect("pwd", [native(target)]);
  });
});

stage(11, "The cd builtin: Relative paths", async (ctx) => {
  const [a, b, c] = [pick(WORDS), pick(COLORS), `d${token()}`];
  await fs.mkdir(path.join(ctx.dir, a, b, c), { recursive: true });
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`cd ./${a}`, []);
    await sh.expect("pwd", [path.join(ctx.dir, a)]);
    await sh.expect(`cd ${b}/${c}`, []);
    await sh.expect("pwd", [path.join(ctx.dir, a, b, c)]);
    await sh.expect("cd ../..", []);
    await sh.expect("pwd", [path.join(ctx.dir, a)]);
    await sh.expect(`cd ../${a}/./${b}`, []);
    await sh.expect("pwd", [path.join(ctx.dir, a, b)]);
  });
});

stage(12, "The cd builtin: Home directory", async (ctx) => {
  const sub = pick(WORDS);
  await fs.mkdir(path.join(ctx.home, sub), { recursive: true });
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("cd ~", []);
    await sh.expect("pwd", [ctx.home]);
    await sh.expect(`cd ${slashes(ctx.dir)}`, []);
    await sh.expect(`cd ~/${sub}`, []);
    await sh.expect("pwd", [path.join(ctx.home, sub)]);
  });
});

// Quoting -----------------------------------------------------------------------

stage(13, "Single quotes", async (ctx) => {
  const [w1, w2] = [pick(WORDS), pick(COLORS)];
  const files = [`meu ${w1}`, `nota  ${w2}  final`];
  await write(ctx, files[0], `primeiro ${w1}\n`);
  await write(ctx, files[1], `segundo ${w2}\n`);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`echo '${w1}     ${w2}'`, [`${w1}     ${w2}`]);
    await sh.expect(`echo '${w1}''${w2}' ${w1}''${w2}`, [`${w1}${w2} ${w1}${w2}`]);
    await sh.expect(`echo ${w1}     ${w2}`, [`${w1} ${w2}`]);
    await sh.expect(`echo '"${w2}"  \\n'`, [`"${w2}"  \\n`]);
    await sh.expect(`cat '${files[0]}' '${files[1]}'`, [`primeiro ${w1}`, `segundo ${w2}`]);
  });
});

stage(14, "Double quotes", async (ctx) => {
  const [w1, w2] = [pick(WORDS), pick(COLORS)];
  const files = [`it's ${w1}`, `${w2}   copia`];
  await write(ctx, files[0], `conteudo ${w1}\n`);
  await write(ctx, files[1], `conteudo ${w2}\n`);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`echo "${w1}    ${w2}"`, [`${w1}    ${w2}`]);
    await sh.expect(`echo "it's" "${w2}'s"`, [`it's ${w2}'s`]);
    await sh.expect(`echo "${w1}"${w2}'x'`, [`${w1}${w2}x`]);
    await sh.expect(`echo "${w1}"  "${w2}"`, [`${w1} ${w2}`]);
    await sh.expect(`cat "${files[0]}" "${files[1]}"`, [`conteudo ${w1}`, `conteudo ${w2}`]);
  });
});

stage(15, "Backslash outside quotes", async (ctx) => {
  const [w1, w2] = [pick(WORDS), pick(COLORS)];
  const file = `${w1} com espacos`;
  await write(ctx, file, `achou ${w1}\n`);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`echo ${w1}\\ \\ \\ ${w2}`, [`${w1}   ${w2}`]);
    await sh.expect(`echo \\'${w1}\\' \\"${w2}\\"`, [`'${w1}' "${w2}"`]);
    await sh.expect(`echo ${w1}\\n${w2}`, [`${w1}n${w2}`]);
    await sh.expect(`echo \\\\${w2}`, [`\\${w2}`]);
    await sh.expect(`cat ${file.replaceAll(" ", "\\ ")}`, [`achou ${w1}`]);
  });
});

stage(16, "Backslash within single quotes", async (ctx) => {
  const [w1, w2] = [pick(WORDS), pick(COLORS)];
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`echo '${w1}\\n${w2}'`, [`${w1}\\n${w2}`]);
    await sh.expect(`echo '${w1}\\\\${w2}'`, [`${w1}\\\\${w2}`]);
    await sh.expect(`echo 'c:\\${w1}\\"${w2}\\"'`, [`c:\\${w1}\\"${w2}\\"`]);
  });
});

stage(17, "Backslash within double quotes", async (ctx) => {
  const [w1, w2] = [pick(WORDS), pick(COLORS)];
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`echo "${w1}\\"${w2}\\""`, [`${w1}"${w2}"`]);
    await sh.expect(`echo "${w1}\\\\${w2}"`, [`${w1}\\${w2}`]);
    await sh.expect(`echo "${w1}\\n${w2}"`, [`${w1}\\n${w2}`]);
    await sh.expect(`echo "${w1}\\'${w2}"`, [`${w1}\\'${w2}`]);
    await sh.expect(`echo "\\$${w2}"`, [`$${w2}`]);
  });
});

stage(18, "Executing a quoted executable", async (ctx) => {
  const bin = path.join(ctx.dir, "bin");
  const spaced = `meu programa ${token()}`;
  const quoted = `it's ${token()}`;
  const [s1, s2] = [rand(100000, 999999), rand(100000, 999999)];
  await makeExe(ctx, bin, spaced, programSource(spaced, s1));
  await makeExe(ctx, bin, quoted, programSource(quoted, s2));
  await withShell(ctx, { path: [bin] }, async (sh) => {
    const a1 = pick(WORDS);
    await sh.expect(`'${spaced}' ${a1}`, programOutput(spaced, s1, [a1]));
    const a2 = pick(COLORS);
    await sh.expect(`"${quoted}" ${a2}`, programOutput(quoted, s2, [a2]));
    await sh.expect(`${spaced.replaceAll(" ", "\\ ")}`, programOutput(spaced, s1, []));
  });
});

// Redirection ---------------------------------------------------------------------

stage(19, "Redirect stdout", async (ctx) => {
  const names = [pick(WORDS), pick(COLORS), `z${token()}`].sort();
  for (const name of names) await write(ctx, `pasta/${name}`, `${name}\n`);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("ls pasta > lista.txt", []);
    await expectFile(path.join(ctx.dir, "lista.txt"), names.map((n) => `${n}\n`).join(""), "$ ls pasta > lista.txt");
    const word = pick(WORDS);
    await sh.expect(`echo ${word} 1> eco.txt`, []);
    await expectFile(path.join(ctx.dir, "eco.txt"), `${word}\n`, `$ echo ${word} 1> eco.txt`);
    await sh.expect(`cat pasta/${names[0]} faltando 1> saida.txt`, ["cat: faltando: No such file or directory"]);
    await expectFile(path.join(ctx.dir, "saida.txt"), `${names[0]}\n`, `$ cat pasta/${names[0]} faltando 1> saida.txt`);
    await sh.expect("cat eco.txt", [word]);
  });
});

stage(20, "Redirect stderr", async (ctx) => {
  const word = pick(WORDS);
  await write(ctx, "fruta.txt", `${word}\n`);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("ls nao_existe 2> erros.txt", []);
    await expectFile(path.join(ctx.dir, "erros.txt"), "ls: nao_existe: No such file or directory\n", "$ ls nao_existe 2> erros.txt");
    const color = pick(COLORS);
    await sh.expect(`echo '${color}' 2> vazio.txt`, [color]);
    await expectFile(path.join(ctx.dir, "vazio.txt"), "", `$ echo '${color}' 2> vazio.txt`);
    await sh.expect("cat fruta.txt sumiu 2> erros2.txt", [word]);
    await expectFile(path.join(ctx.dir, "erros2.txt"), "cat: sumiu: No such file or directory\n", "$ cat fruta.txt sumiu 2> erros2.txt");
  });
});

stage(21, "Append stdout", async (ctx) => {
  const names = [pick(WORDS), `y${token()}`].sort();
  for (const name of names) await write(ctx, `pasta/${name}`, "x\n");
  await withShell(ctx, {}, async (sh) => {
    const [a, b] = [pick(WORDS), pick(COLORS)];
    await sh.expect(`echo ${a} >> log.txt`, []);
    await sh.expect(`echo ${b} 1>> log.txt`, []);
    await sh.expect("ls pasta >> log.txt", []);
    await expectFile(path.join(ctx.dir, "log.txt"), [a, b, ...names].map((n) => `${n}\n`).join(""), "depois de três >>");
    await sh.expect("cat log.txt", [a, b, ...names]);
  });
});

stage(22, "Append stderr", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const [a, b] = [`nada_${token()}`, `vazio_${token()}`];
    await sh.expect(`ls ${a} 2>> erros.txt`, []);
    await sh.expect(`cat ${b} 2>> erros.txt`, []);
    const word = pick(WORDS);
    await sh.expect(`echo ${word} 2>> erros.txt`, [word]);
    await expectFile(
      path.join(ctx.dir, "erros.txt"),
      `ls: ${a}: No such file or directory\ncat: ${b}: No such file or directory\n`,
      "depois de dois 2>>"
    );
  });
});

// Command Completion ---------------------------------------------------------------

stage(23, "Builtin completion", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await expectCompletion(sh, "ech", "$ echo ");
    const word = pick(WORDS);
    await sh.expect(word, [word]);
    await expectCompletion(sh, "exi", "$ exit ");
    sh.sendLine("");
    await sh.waitExit("exit completado com Tab");
  });
});

stage(24, "Completion with arguments", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await expectCompletion(sh, "ech", "$ echo ");
    const words = `${pick(WORDS)} ${pick(COLORS)}`;
    await sh.expect(words, [words]);
    await expectCompletion(sh, "typ", "$ type ");
    await sh.expect("echo", [builtin("echo")]);
  });
});

stage(25, "Missing completions", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const typed = `xyz_${token()}`;
    await expectNoCompletion(sh, typed);
    await sh.expect("", [`${typed}: command not found`]);
  });
});

stage(26, "Executable completion", async (ctx) => {
  const bin = path.join(ctx.dir, "bin");
  const name = `custom_${token()}`;
  const signature = rand(100000, 999999);
  await makeExe(ctx, bin, name, programSource(name, signature));
  await withShell(ctx, { path: [bin] }, async (sh) => {
    await expectCompletion(sh, "custo", `$ ${name} `);
    await sh.expect("", programOutput(name, signature, []));
  });
});

stage(27, "Multiple completions", async (ctx) => {
  const bin = path.join(ctx.dir, "bin");
  const prefix = `xyz${token()}`;
  const names = [`${prefix}_quz`, `${prefix}_bar`, `${prefix}_baz`];
  for (const name of names) await makeExe(ctx, bin, name, programSource(name, 1));
  await withShell(ctx, { path: [bin] }, async (sh) => {
    await expectListing(sh, `${prefix}_`, [...names].sort().join("  "));
  });
});

stage(28, "Partial completions", async (ctx) => {
  const bin = path.join(ctx.dir, "bin");
  const prefix = `p${token()}`;
  const names = [`${prefix}_foo`, `${prefix}_foo_bar`, `${prefix}_foo_bar_baz`];
  for (const name of names) await makeExe(ctx, bin, name, programSource(name, 1));
  await withShell(ctx, { path: [bin] }, async (sh) => {
    await expectCompletion(sh, `${prefix}_`, `$ ${prefix}_foo`);
    await expectCompletion(sh, "_", `$ ${prefix}_foo_bar`);
    await expectCompletion(sh, "_", `$ ${prefix}_foo_bar_baz `);
  });
});

// Filename Completion ----------------------------------------------------------------

stage(29, "File completion", async (ctx) => {
  const name = `apple_${token()}.txt`;
  const content = pick(WORDS);
  await write(ctx, name, `${content}\n`);
  await write(ctx, "banana.txt", "banana\n");
  await withShell(ctx, {}, async (sh) => {
    await expectCompletion(sh, "cat ap", `$ cat ${name} `);
    await sh.expect("", [content]);
  });
});

stage(30, "Nested file completion", async (ctx) => {
  const name = `notes_${token()}.md`;
  const deep = `fundo_${token()}.txt`;
  await write(ctx, `docs/${name}`, "notas\n");
  await write(ctx, "docs/outro.txt", "outro\n");
  await write(ctx, `docs/sub/dir/${deep}`, "fundo\n");
  await withShell(ctx, {}, async (sh) => {
    await expectCompletion(sh, "cat docs/no", `$ cat docs/${name} `);
    await sh.expect("", ["notas"]);
    await expectCompletion(sh, "cat docs/sub/dir/fu", `$ cat docs/sub/dir/${deep} `);
    await sh.expect("", ["fundo"]);
  });
});

stage(31, "Directory completion", async (ctx) => {
  const dir = `src_${token()}`;
  await fs.mkdir(path.join(ctx.dir, dir, "main", "java"), { recursive: true });
  await withShell(ctx, {}, async (sh) => {
    await expectCompletion(sh, "cd sr", `$ cd ${dir}/`);
    await expectCompletion(sh, "ma", `$ cd ${dir}/main/`);
    await expectCompletion(sh, "j", `$ cd ${dir}/main/java/`);
    await sh.expect("", []);
    await sh.expect("pwd", [path.join(ctx.dir, dir, "main", "java")]);
  });
});

stage(32, "Missing completions", async (ctx) => {
  await write(ctx, "arquivo.txt", "x\n");
  await withShell(ctx, {}, async (sh) => {
    await expectNoCompletion(sh, `cat zz${token()}`);
    await clearLine(sh);
    await expectNoCompletion(sh, `cat pasta_${token()}/a`);
  });
});

stage(33, "Multiple matches", async (ctx) => {
  const prefix = `n${token()}`;
  await write(ctx, `${prefix}_b.log`, "b\n");
  await write(ctx, `${prefix}_a.txt`, "a\n");
  await fs.mkdir(path.join(ctx.dir, `${prefix}_c`));
  await withShell(ctx, {}, async (sh) => {
    await expectListing(sh, `cat ${prefix}_`, `${prefix}_a.txt  ${prefix}_b.log  ${prefix}_c/`);
  });
});

stage(34, "Partial completions", async (ctx) => {
  const base = `data_${token()}`;
  await write(ctx, `${base}.csv`, "csv\n");
  await write(ctx, `${base}.csv.bak`, "bak\n");
  await withShell(ctx, {}, async (sh) => {
    await expectCompletion(sh, "cat da", `$ cat ${base}.csv`);
    await expectListing(sh, `cat ${base}.csv`, `${base}.csv  ${base}.csv.bak`, true);
    await expectCompletion(sh, ".b", `$ cat ${base}.csv.bak `);
    await sh.expect("", ["bak"]);
  });
});

stage(35, "Multi-argument completions", async (ctx) => {
  const first = `apple_${token()}.txt`;
  const second = `banana_${token()}.txt`;
  await write(ctx, first, "maçã\n");
  await write(ctx, second, "banana\n");
  await withShell(ctx, {}, async (sh) => {
    await expectCompletion(sh, "cat ap", `$ cat ${first} `);
    await expectCompletion(sh, "ban", `$ cat ${first} ${second} `);
    await sh.expect("", ["maçã", "banana"]);
  });
});

// Programmable Completion ------------------------------------------------------------

async function makeCompleter(ctx, candidates, log) {
  return makeExe(ctx, path.join(ctx.dir, "completers"), `comp_${token()}`, completerSource(candidates, log));
}

stage(36, "Register complete builtin", async (ctx) => {
  const completer = await makeCompleter(ctx, ["staging"]);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("type complete", [builtin("complete")]);
    await sh.expect(`complete -C '${completer}' deploy`, []);
  });
});

stage(37, "Printing missing specifications", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const name = `${pick(WORDS)}_${token()}`;
    await sh.expect(`complete -p ${name}`, [`complete: ${name}: no completion specification`]);
  });
});

stage(38, "Displaying registered specifications", async (ctx) => {
  const a = await makeCompleter(ctx, ["x"]);
  const b = await makeCompleter(ctx, ["y"]);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`complete -C '${a}' deploy`, []);
    await sh.expect(`complete -C '${b}' backup`, []);
    await sh.expect("complete -p deploy", [`complete -C '${a}' deploy`]);
    await sh.expect("complete -p backup", [`complete -C '${b}' backup`]);
    await sh.expect("complete -p restore", ["complete: restore: no completion specification"]);
  });
});

stage(39, "Single completion", async (ctx) => {
  const completer = await makeCompleter(ctx, ["staging", "production", "preview"]);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`complete -C '${completer}' deploy`, []);
    await expectCompletion(sh, "deploy st", "$ deploy staging ");
    await clearLine(sh);
    await expectCompletion(sh, "deploy --env pro", "$ deploy --env production ");
  });
});

stage(40, "Handling no completions", async (ctx) => {
  const completer = await makeCompleter(ctx, ["staging", "production"]);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`complete -C '${completer}' deploy`, []);
    await expectNoCompletion(sh, "deploy zz");
  });
});

async function completerLog(log, count) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const text = await readFile(log);
    const entries = (text ?? "").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    if (entries.length >= count) return entries;
    await delay(50);
  }
  throw new Error(`o completer não foi executado depois do Tab (nenhum registro em ${path.basename(log)})`);
}

stage(41, "Passing command-line arguments", async (ctx) => {
  const log = path.join(ctx.dir, "completer.log");
  const completer = await makeCompleter(ctx, ["staging", "production"], log);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`complete -C '${completer}' deploy`, []);
    await expectCompletion(sh, "deploy --env st", "$ deploy --env staging ");
    let [entry] = await completerLog(log, 1);
    assertLines(entry.args, ["deploy", "st", "--env"], "argumentos recebidos pelo completer em \"deploy --env st\" + Tab");
    await clearLine(sh);
    await expectCompletion(sh, "deploy pr", "$ deploy production ");
    entry = (await completerLog(log, 2))[1];
    assertLines(entry.args, ["deploy", "pr", "deploy"], "argumentos recebidos pelo completer em \"deploy pr\" + Tab");
  });
});

stage(42, "Passing environment variables", async (ctx) => {
  const log = path.join(ctx.dir, "completer.log");
  const completer = await makeCompleter(ctx, ["staging", "production"], log);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`complete -C '${completer}' deploy`, []);
    const typed = "deploy --env pr";
    await expectCompletion(sh, typed, "$ deploy --env production ");
    const [entry] = await completerLog(log, 1);
    assert(entry.line === typed, `COMP_LINE deveria ser ${show(typed)}, o completer recebeu ${show(entry.line)}`);
    assert(entry.point === String(typed.length), `COMP_POINT deveria ser ${show(String(typed.length))}, o completer recebeu ${show(entry.point)}`);
  });
});

stage(43, "Multiple completer candidates", async (ctx) => {
  const completer = await makeCompleter(ctx, ["sync", "staging", "sandbox", "production"]);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`complete -C '${completer}' deploy`, []);
    await expectListing(sh, "deploy s", "sandbox  staging  sync");
  });
});

stage(44, "Longest common prefix", async (ctx) => {
  const completer = await makeCompleter(ctx, ["release-beta", "release-alpha", "rollback"]);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`complete -C '${completer}' deploy`, []);
    await expectCompletion(sh, "deploy rel", "$ deploy release-");
    await expectCompletion(sh, "b", "$ deploy release-beta ");
  });
});

stage(45, "Unregister a completion", async (ctx) => {
  const completer = await makeCompleter(ctx, ["staging"]);
  const file = `status_${token()}.txt`;
  await write(ctx, file, "ok\n");
  await withShell(ctx, {}, async (sh) => {
    await sh.expect(`complete -C '${completer}' deploy`, []);
    await sh.expect("complete -r deploy", []);
    await sh.expect("complete -p deploy", ["complete: deploy: no completion specification"]);
    await expectCompletion(sh, "deploy st", `$ deploy ${file} `);
  });
});

// Background Jobs ----------------------------------------------------------------------

const JOB_STARTED = /^\[(\d+)\] \d+$/;

async function startJob(sh, command, number) {
  const lines = await sh.run(command, { timeoutMs: 4_000 });
  assert(lines.length === 1 && JOB_STARTED.test(lines[0]), `$ ${command}\n   esperava uma linha no formato "[${number}] <pid>", recebeu ${show(lines.join("\n"))}`);
  const got = Number(lines[0].match(JOB_STARTED)[1]);
  assert(got === number, `$ ${command}\n   esperava o job número ${number}, recebeu [${got}]`);
}

stage(46, "The jobs builtin", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("type jobs", [builtin("jobs")]);
    await sh.expect("jobs", []);
  });
});

stage(47, "Starting background jobs", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await startJob(sh, "sleep 20 &", 1);
    await startJob(sh, "sleep 21 &", 2);
    const word = pick(WORDS);
    await sh.expect(`echo ${word}`, [word]);
  });
});

stage(48, "Printing background job output", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const word = `${pick(WORDS)}_${token()}`;
    await startJob(sh, `delayed_echo 0.5 ${word} &`, 1);
    await sh.waitFor(
      () => sh.screen().lines.some((line) => line.includes(word)),
      6_000,
      () => `a saída do job em background (${show(word)}) não apareceu na tela`
    );
  });
});

stage(49, "List a single job", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await startJob(sh, "sleep 20 &", 1);
    await sh.expect("jobs", [jobLine(1, "+", true, "sleep 20")]);
  });
});

stage(50, "List multiple jobs", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await startJob(sh, "sleep 20 &", 1);
    await startJob(sh, "sleep 21 &", 2);
    await sh.expect("jobs", [jobLine(1, "-", true, "sleep 20"), jobLine(2, "+", true, "sleep 21")]);
    await startJob(sh, "sleep 22 &", 3);
    await sh.expect("jobs", [jobLine(1, " ", true, "sleep 20"), jobLine(2, "-", true, "sleep 21"), jobLine(3, "+", true, "sleep 22")]);
  });
});

stage(51, "Reap one job", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await startJob(sh, "sleep 20 &", 1);
    await startJob(sh, "sleep 0.2 &", 2);
    await delay(2_000);
    await sh.expect("jobs", [jobLine(1, "-", true, "sleep 20"), jobLine(2, "+", false, "sleep 0.2")]);
    await sh.expect("jobs", [jobLine(1, "+", true, "sleep 20")]);
  });
});

stage(52, "Reap multiple jobs", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await startJob(sh, "sleep 0.2 &", 1);
    await startJob(sh, "sleep 0.3 &", 2);
    await startJob(sh, "sleep 20 &", 3);
    await delay(2_000);
    await sh.expect("jobs", [jobLine(1, " ", false, "sleep 0.2"), jobLine(2, "-", false, "sleep 0.3"), jobLine(3, "+", true, "sleep 20")]);
    await sh.expect("jobs", [jobLine(3, "+", true, "sleep 20")]);
  });
});

stage(53, "Reap before the next prompt", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await startJob(sh, "sleep 0.2 &", 1);
    await delay(2_000);
    const word = pick(WORDS);
    await sh.expect(`echo ${word}`, [word, jobLine(1, "+", false, "sleep 0.2")]);
    await sh.expect(`echo ${word}`, [word]);
    await sh.expect("jobs", []);
  });
});

stage(54, "Recycle job numbers", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await startJob(sh, "sleep 20 &", 1);
    await startJob(sh, "sleep 0.2 &", 2);
    await delay(2_000);
    await sh.expect("jobs", [jobLine(1, "-", true, "sleep 20"), jobLine(2, "+", false, "sleep 0.2")]);
    await startJob(sh, "sleep 21 &", 2);
    await sh.expect("jobs", [jobLine(1, "-", true, "sleep 20"), jobLine(2, "+", true, "sleep 21")]);
  });
  await withShell(ctx, {}, async (sh) => {
    await startJob(sh, "sleep 0.2 &", 1);
    await delay(2_000);
    await sh.expect("echo ok", ["ok", jobLine(1, "+", false, "sleep 0.2")]);
    await startJob(sh, "sleep 0.3 &", 1);
  });
});

// Pipelines -------------------------------------------------------------------------------

stage(55, "Dual-command pipeline", async (ctx) => {
  const lines = [pick(WORDS), `${pick(COLORS)} ${pick(WORDS)}`, `${token()} ${token()} ${token()}`];
  const text = lines.map((l) => `${l}\n`).join("");
  await write(ctx, "dados.txt", text);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("cat dados.txt | wc", [wcOf(text)]);
    await sh.expect("ticker | head -n 3", ["tick 1", "tick 2", "tick 3"], { timeoutMs: 8_000 });
  });
});

stage(56, "Pipelines with built-ins", async (ctx) => {
  const names = [pick(WORDS), `q${token()}`].sort();
  for (const name of names) await write(ctx, `pasta/${name}`, "x\n");
  await withShell(ctx, {}, async (sh) => {
    const words = `${pick(WORDS)} ${pick(COLORS)} ${pick(WORDS)}`;
    await sh.expect(`echo ${words} | wc`, [wcOf(`${words}\n`)]);
    await sh.expect("ls pasta | type exit", [builtin("exit")]);
    await sh.expect(`echo ${words} | cat`, [words]);
  });
});

stage(57, "Multi-command pipelines", async (ctx) => {
  const lines = Array.from({ length: 5 }, (_, i) => `${i + 1} ${pick(WORDS)}`);
  const text = lines.map((l) => `${l}\n`).join("");
  await write(ctx, "dados.txt", text);
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("cat dados.txt | head -n 3 | wc", [wcOf(lines.slice(0, 3).map((l) => `${l}\n`).join(""))]);
    await sh.expect("ticker | head -n 5 | head -n 2", ["tick 1", "tick 2"], { timeoutMs: 8_000 });
    await sh.expect("cat dados.txt | cat | head -n 2", lines.slice(0, 2));
  });
});

// History -----------------------------------------------------------------------------------

const historyLines = (entries, start = 1) => entries.map((entry, i) => `${String(start + i).padStart(5)}  ${entry}`);

stage(58, "The history builtin", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("type history", [builtin("history")]);
  });
});

stage(59, "Listing history", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const commands = [`echo ${pick(WORDS)}`, `echo ${pick(COLORS)}`, `invalido_${token()}`];
    for (const command of commands) await sh.run(command);
    await sh.expect("history", historyLines([...commands, "history"]));
  });
});

stage(60, "Limiting history entries", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const commands = [`echo ${pick(WORDS)}`, `echo ${pick(COLORS)}`, `echo ${token()}`, "pwd"];
    for (const command of commands) await sh.run(command);
    await sh.expect("history 2", historyLines([commands[3], "history 2"], 4));
    await sh.expect("history 3", historyLines([commands[3], "history 2", "history 3"], 4));
  });
});

stage(61, "Up-arrow navigation", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const [a, b] = [`echo ${pick(WORDS)}`, `echo ${pick(COLORS)}`];
    await sh.run(a);
    await sh.run(b);
    sh.keys(UP);
    await sh.expectScreenLine(`$ ${b}`, "depois de ↑", { trim: true });
    sh.keys(UP);
    await sh.expectScreenLine(`$ ${a}`, "depois de ↑ ↑", { trim: true });
  });
});

stage(62, "Down-arrow navigation", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const [a, b] = [`echo ${pick(WORDS)}`, `echo ${pick(COLORS)}_${token()}`];
    await sh.run(a);
    await sh.run(b);
    sh.keys(UP + UP);
    await sh.expectScreenLine(`$ ${a}`, "depois de ↑ ↑", { trim: true });
    sh.keys(DOWN);
    await sh.expectScreenLine(`$ ${b}`, "depois de ↑ ↑ ↓", { trim: true });
    sh.keys(DOWN);
    await sh.expectScreenLine("$", "depois de ↑ ↑ ↓ ↓ (volta para a linha vazia)", { trim: true });
  });
});

stage(63, "Executing commands from history", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const word = `${pick(WORDS)}_${token()}`;
    await sh.run(`echo ${word}`);
    await sh.run("pwd");
    sh.keys(UP + UP);
    await sh.expectScreenLine(`$ echo ${word}`, "depois de ↑ ↑", { trim: true });
    await sh.expect("", [word]);
    await sh.expect("history", historyLines([`echo ${word}`, "pwd", `echo ${word}`, "history"]));
  });
});

// History Persistence -----------------------------------------------------------------------

stage(64, "Read history from file", async (ctx) => {
  const entries = [`echo ${pick(WORDS)}`, `echo ${pick(COLORS)}`, "pwd"];
  await write(ctx, "historico.txt", entries.map((e) => `${e}\n`).join(""));
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("history -r historico.txt", []);
    await sh.expect("history", historyLines(["history -r historico.txt", ...entries, "history"]));
  });
});

stage(65, "Write history to file", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const commands = [`echo ${pick(WORDS)}`, `echo ${pick(COLORS)}`];
    for (const command of commands) await sh.run(command);
    await sh.expect("history -w salvo.txt", []);
    await expectFile(path.join(ctx.dir, "salvo.txt"), [...commands, "history -w salvo.txt"].map((e) => `${e}\n`).join(""), "$ history -w salvo.txt");
  });
});

stage(66, "Append history to file", async (ctx) => {
  await write(ctx, "anexo.txt", "echo antigo\n");
  await withShell(ctx, {}, async (sh) => {
    const first = `echo ${pick(WORDS)}`;
    await sh.run(first);
    await sh.expect("history -a anexo.txt", []);
    await expectFile(path.join(ctx.dir, "anexo.txt"), `echo antigo\n${first}\nhistory -a anexo.txt\n`, "primeiro history -a");
    const second = `echo ${pick(COLORS)}`;
    await sh.run(second);
    await sh.expect("history -a anexo.txt", []);
    await expectFile(
      path.join(ctx.dir, "anexo.txt"),
      `echo antigo\n${first}\nhistory -a anexo.txt\n${second}\nhistory -a anexo.txt\n`,
      "segundo history -a (só as entradas novas)"
    );
  });
});

stage(67, "Read history on startup", async (ctx) => {
  const entries = [`echo ${pick(WORDS)}`, `echo ${pick(COLORS)}`];
  const file = await write(ctx, "hist.txt", entries.map((e) => `${e}\n`).join(""));
  await withShell(ctx, { env: { HISTFILE: file } }, async (sh) => {
    await sh.expect("history", historyLines([...entries, "history"]));
  });
});

stage(68, "Write history on exit", async (ctx) => {
  const file = path.join(ctx.dir, "novo_hist.txt");
  await withShell(ctx, { env: { HISTFILE: file } }, async (sh) => {
    const commands = [`echo ${pick(WORDS)}`, `echo ${pick(COLORS)}`];
    for (const command of commands) await sh.run(command);
    sh.sendLine("exit");
    await sh.waitExit("$ exit");
    await expectFile(file, [...commands, "exit"].map((e) => `${e}\n`).join(""), "HISTFILE depois do exit");
  });
});

stage(69, "Append history on exit", async (ctx) => {
  const old = [`echo ${pick(WORDS)}`, "pwd"];
  const file = await write(ctx, "hist.txt", old.map((e) => `${e}\n`).join(""));
  await withShell(ctx, { env: { HISTFILE: file } }, async (sh) => {
    const command = `echo ${pick(COLORS)}`;
    await sh.run(command);
    sh.sendLine("exit");
    await sh.waitExit("$ exit");
    await expectFile(file, [...old, command, "exit"].map((e) => `${e}\n`).join(""), "HISTFILE depois do exit");
  });
});

// Parameter Expansion -----------------------------------------------------------------------

stage(70, "The declare builtin", async (ctx) => {
  const value = `${pick(WORDS)} ${pick(COLORS)}`;
  await withShell(ctx, { env: { PW_FRUTA: value } }, async (sh) => {
    await sh.expect("type declare", [builtin("declare")]);
    await sh.expect("declare -p PW_FRUTA", [`declare -x PW_FRUTA="${value}"`]);
  });
});

stage(71, "Printing missing variables", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const name = `NADA_${token().toUpperCase()}`;
    await sh.expect(`declare -p ${name}`, [`declare: ${name}: not found`]);
  });
});

stage(72, "Storing shell variables", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const color = pick(COLORS);
    await sh.expect(`declare cor=${color}`, []);
    await sh.expect("declare -p cor", [`declare -- cor="${color}"`]);
    const phrase = `${pick(WORDS)}  ${pick(WORDS)}`;
    await sh.expect(`declare frase='${phrase}'`, []);
    await sh.expect("declare -p frase", [`declare -- frase="${phrase}"`]);
    await sh.expect("declare cor=nova", []);
    await sh.expect("declare -p cor", ['declare -- cor="nova"']);
  });
});

stage(73, "Validating variable names", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("declare 1abc=x", ["declare: '1abc=x': not a valid identifier"]);
    await sh.expect("declare a-b=1", ["declare: 'a-b=1': not a valid identifier"]);
    await sh.expect("declare _ok9=sim", []);
    await sh.expect("declare -p _ok9", ['declare -- _ok9="sim"']);
  });
});

stage(74, "Expanding variables", async (ctx) => {
  const env = pick(WORDS);
  await withShell(ctx, { env: { PW_FRUTA: env } }, async (sh) => {
    const value = pick(COLORS);
    await sh.expect(`declare cor=${value}`, []);
    await sh.expect("echo minha cor: $cor", [`minha cor: ${value}`]);
    await sh.expect('echo "cor=$cor fruta=$PW_FRUTA"', [`cor=${value} fruta=${env}`]);
    await sh.expect("echo '$cor'", ["$cor"]);
    await sh.expect("echo \\$cor custa $", ["$cor custa $"]);
  });
});

stage(75, "Expansion with braces", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    const value = pick(WORDS);
    await sh.expect(`declare item=${value}`, []);
    await sh.expect("echo ${item}s", [`${value}s`]);
    await sh.expect('echo "pre_${item}_pos"', [`pre_${value}_pos`]);
    await sh.expect("echo '${item}'", ["${item}"]);
  });
});

stage(76, "Expanding empty variables", async (ctx) => {
  await withShell(ctx, {}, async (sh) => {
    await sh.expect("echo a $NAO_EXISTE b", ["a b"]);
    await sh.expect("declare vazio=", []);
    await sh.expect("echo [$vazio]", ["[]"]);
    await sh.expect("show_args x $vazio y", ["argc: 2", "1: <x>", "2: <y>"]);
    await sh.expect('show_args x "$vazio" y', ["argc: 3", "1: <x>", "2: <>", "3: <y>"]);
  });
});

// --------------------------------------------------------------------- runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "shell.jar");
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

  const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pw-shell-")));
  const results = [];
  try {
    const jarExists = await fs.access(jar).then(() => true, () => false);
    const ctx = { jar, java: findJava(), tmp, jsDir: path.join(tmp, "js"), helpersDir: path.join(tmp, "helpers") };
    await fs.mkdir(ctx.jsDir, { recursive: true });
    for (const [name, source] of Object.entries(HELPERS)) await makeExe(ctx, ctx.helpersDir, name, source);

    for (const test of tests) {
      onProgress({ type: "stage-start", number: test.number, title: test.title });
      const startedAt = Date.now();
      let result;
      try {
        if (!jarExists) throw new Error(`${jar} não encontrado — o build gerou o jar?`);
        const dir = path.join(tmp, `stage-${String(test.number).padStart(2, "0")}`);
        await fs.mkdir(path.join(dir, "work"), { recursive: true });
        await fs.mkdir(path.join(dir, "home"), { recursive: true });
        await test.run({ ...ctx, stage: test.number, dir: path.join(dir, "work"), home: path.join(dir, "home") });
        result = { number: test.number, title: test.title, ok: true, durationMs: Date.now() - startedAt };
      } catch (error) {
        result = { number: test.number, title: test.title, ok: false, error: error.message, durationMs: Date.now() - startedAt };
      }
      results.push(result);
      onProgress({ type: "stage-end", result });
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
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
    console.log(`\nTela do shell:\n${result.logs.slice(-4000)}`);
    process.exitCode = 1;
  }
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(`\n💥 ${error.message}`);
    process.exit(1);
  });
}
