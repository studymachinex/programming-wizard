import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Runner de exercícios Java: compila o código do aluno junto com os testes e executa com o
 * PwTestRunner (runner/PwTestRunner.java), que roda os @Test por reflexão.
 *
 * O código roda na própria máquina, como os testes dos desafios CodeCrafters. A plataforma é
 * local e de usuário único; não exponha este endpoint na internet sem um sandbox.
 */

export type TestResult = {
  name: string;
  display: string;
  status: "passed" | "failed" | "error" | "timeout";
  ms: number;
  message: string | null;
  output: string;
};

export type Diagnostic = { file: "solution" | "tests"; line: number; message: string };

export type RunResult =
  | { status: "passed" | "failed"; tests: TestResult[]; durationMs: number; compileMs: number }
  | { status: "compile_error"; diagnostics: Diagnostic[]; raw: string; durationMs: number }
  | { status: "error"; message: string; durationMs: number };

const ROOT = process.cwd();
const RUNNER_SRC = path.join(ROOT, "runner");
const CACHE = path.join(ROOT, ".runner");
const LIB = path.join(CACHE, "lib");
const CLASSES = path.join(CACHE, "classes");

const PER_TEST_TIMEOUT_MS = 6_000;
const PROCESS_TIMEOUT_MS = 45_000;
const MAX_PARALLEL = 2;

function bin(name: "java" | "javac"): string {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  if (process.env.JAVA_HOME) {
    const candidate = path.join(process.env.JAVA_HOME, "bin", exe);
    if (existsSync(candidate)) return candidate;
  }
  return name;
}

type Proc = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs: number; shell?: boolean }): Promise<Proc> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, shell: opts.shell ?? false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const limit = 2_000_000;
    child.stdout.on("data", (d) => {
      if (stdout.length < limit) stdout += d;
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < limit) stderr += d;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + error.message, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

// ------------------------------------------------------------------ preparação

let ready: Promise<void> | null = null;

/** Baixa (via Maven, do cache local se existir) as asserções do JUnit e compila o runner. */
export function ensureRunner(): Promise<void> {
  ready ??= (async () => {
    const jars = existsSync(LIB) ? (await fs.readdir(LIB)).filter((f) => f.endsWith(".jar")) : [];
    if (!jars.some((j) => j.startsWith("junit-jupiter-api"))) {
      await fs.mkdir(LIB, { recursive: true });
      const pom = path.join(RUNNER_SRC, "pom.xml");
      const mvn = await run(`mvn -q -B -f "${pom}" dependency:copy-dependencies "-DoutputDirectory=${LIB}"`, [], { timeoutMs: 180_000, shell: true });
      if (mvn.code !== 0) throw new Error(`Não consegui baixar as dependências do runner com o Maven.\n${(mvn.stdout + mvn.stderr).slice(-2000)}`);
    }
    const source = path.join(RUNNER_SRC, "PwTestRunner.java");
    const compiled = path.join(CLASSES, "PwTestRunner.class");
    const stale = !existsSync(compiled) || (await fs.stat(source)).mtimeMs > (await fs.stat(compiled)).mtimeMs;
    if (stale) {
      await fs.mkdir(CLASSES, { recursive: true });
      const javac = await run(bin("javac"), ["-encoding", "UTF-8", "-d", CLASSES, "-cp", path.join(LIB, "*"), source], { timeoutMs: 60_000 });
      if (javac.code !== 0) throw new Error(`Falha ao compilar o PwTestRunner:\n${javac.stderr}`);
    }
  })().catch((error) => {
    ready = null; // permite tentar de novo
    throw error;
  });
  return ready;
}

// ------------------------------------------------------------------ fila

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// ------------------------------------------------------------------ execução

const classNameOf = (code: string, fallback: string) =>
  code.match(/^\s*public\s+(?:final\s+|abstract\s+|sealed\s+)*(?:class|record|interface|enum)\s+(\w+)/m)?.[1] ??
  code.match(/^\s*(?:final\s+)?class\s+(\w+)/m)?.[1] ??
  fallback;

function parseDiagnostics(stderr: string, solutionFile: string, testFile: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const re = /^(.*?([A-Za-z0-9_]+\.java)):(\d+): error: (.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr))) {
    const file = m[2] === path.basename(testFile) ? "tests" : m[2] === path.basename(solutionFile) ? "solution" : "solution";
    out.push({ file, line: Number(m[3]), message: m[4] });
  }
  return out;
}

/** Compila `code` + `tests` e roda os testes. Nunca lança: erros viram `status: "error"`. */
export async function runJavaTests({ code, tests }: { code: string; tests: string }): Promise<RunResult> {
  const started = Date.now();
  try {
    await ensureRunner();
  } catch (error) {
    return { status: "error", message: (error as Error).message, durationMs: Date.now() - started };
  }
  return withSlot(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pw-run-"));
    try {
      const solutionClass = classNameOf(code, "Solution");
      const testClass = classNameOf(tests, "SolutionTest");
      const solutionFile = path.join(dir, `${solutionClass}.java`);
      const testFile = path.join(dir, `${testClass}.java`);
      await fs.writeFile(solutionFile, code);
      await fs.writeFile(testFile, tests);
      const out = path.join(dir, "out");
      const cp = path.join(LIB, "*");

      const compileStart = Date.now();
      const javac = await run(bin("javac"), ["-encoding", "UTF-8", "-nowarn", "-d", out, "-cp", cp, solutionFile, testFile], { cwd: dir, timeoutMs: 60_000 });
      const compileMs = Date.now() - compileStart;
      if (javac.code !== 0) {
        if (javac.timedOut) return { status: "error", message: "A compilação passou de 60 s.", durationMs: Date.now() - started };
        const raw = (javac.stderr || javac.stdout).replaceAll(dir + path.sep, "");
        return { status: "compile_error", diagnostics: parseDiagnostics(javac.stderr, solutionFile, testFile), raw: raw.slice(0, 8000), durationMs: Date.now() - started };
      }

      const java = await run(
        bin("java"),
        ["-Xmx256m", "-Xss16m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-Dfile.encoding=UTF-8", "-Dstdout.encoding=UTF-8", "-cp", [out, cp, CLASSES].join(path.delimiter), "PwTestRunner", testClass, String(PER_TEST_TIMEOUT_MS)],
        { cwd: dir, timeoutMs: PROCESS_TIMEOUT_MS },
      );
      const results: TestResult[] = [];
      for (const line of java.stdout.split(/\r?\n/)) {
        if (!line.startsWith("@@PW ")) continue;
        const event = JSON.parse(line.slice(5));
        if (event.type === "test") results.push(event as TestResult);
      }
      if (!results.length) {
        const why = java.timedOut ? `A execução passou de ${PROCESS_TIMEOUT_MS / 1000} s.` : (java.stderr || java.stdout || "a JVM terminou sem rodar nenhum teste").slice(-3000);
        return { status: "error", message: why, durationMs: Date.now() - started };
      }
      return {
        status: results.every((r) => r.status === "passed") ? "passed" : "failed",
        tests: results,
        durationMs: Date.now() - started,
        compileMs,
      };
    } finally {
      fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    }
  });
}
