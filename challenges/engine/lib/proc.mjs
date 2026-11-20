import { spawn } from "node:child_process";

function killTree(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      shell: true,
    });
    return;
  }
  child.kill("SIGKILL");
}

/**
 * Executa um processo e captura stdout/stderr.
 * Retorna { code, stdout, stderr, timedOut, durationMs }.
 */
export function run(command, args = [], options = {}) {
  const {
    cwd,
    env,
    timeoutMs = 180_000,
    input,
    shell = process.platform === "win32",
    onStdout,
    onStderr,
  } = options;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onStdout?.(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        code: -1,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
        durationMs: Date.now() - startedAt,
        error,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? -1,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Igual a run(), mas imprime a saída em tempo real no terminal. */
export function runStreaming(command, args = [], options = {}) {
  return run(command, args, {
    ...options,
    onStdout: (text) => {
      process.stdout.write(text);
      options.onStdout?.(text);
    },
    onStderr: (text) => {
      process.stderr.write(text);
      options.onStderr?.(text);
    },
  });
}

export function tail(text, max = 6000) {
  if (!text) return "";
  return text.length <= max ? text : `…${text.slice(-max)}`;
}
