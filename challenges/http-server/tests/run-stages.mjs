#!/usr/bin/env node
/**
 * Tester local do desafio HTTP Server.
 *
 * Sobe o servidor compilado, executa os 14 stages via TCP cru e imprime
 * um checklist. É o protótipo do runner que a plataforma vai usar para
 * validar submissões.
 *
 * Uso:
 *   node challenges/http-server/tests/run-stages.mjs
 *   node challenges/http-server/tests/run-stages.mjs --no-build
 */
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const DEFAULT_PORT = 4221;
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

class HttpConnection {
  static open(port) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      const connection = new HttpConnection(socket);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`timeout conectando na porta ${port}`));
      }, 3000);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve(connection);
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.error = null;
    this.waiters = [];
    this.closeWaiters = [];

    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.#notify();
    });
    socket.on("close", () => {
      this.closed = true;
      this.#notify();
      for (const waiter of this.closeWaiters.splice(0)) waiter();
    });
    socket.on("error", (error) => {
      this.error = error;
      this.#notify();
    });
  }

  #notify() {
    for (const waiter of this.waiters.splice(0)) waiter();
  }

  async #waitForData(deadline) {
    if (this.buffer.length > 0 || this.closed || this.error) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter !== onData);
        reject(new Error("timeout esperando resposta do servidor"));
      }, Math.max(1, deadline - Date.now()));
      const onData = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(onData);
    });
  }

  async readResponse(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      if (this.error) throw this.error;
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd >= 0) {
        const head = this.buffer.subarray(0, headerEnd).toString("latin1");
        const lines = head.split("\r\n");
        const statusMatch = lines[0].match(/^HTTP\/1\.[01] (\d{3})(?: .*)?$/);
        if (!statusMatch) throw new Error(`status line inválida: ${lines[0]}`);
        const headers = {};
        for (const line of lines.slice(1)) {
          const colon = line.indexOf(":");
          if (colon <= 0) continue;
          const name = line.slice(0, colon).trim().toLowerCase();
          const value = line.slice(colon + 1).trim();
          headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
        }
        const contentLength = Number(headers["content-length"] ?? 0);
        const bodyStart = headerEnd + 4;
        if (this.buffer.length >= bodyStart + contentLength) {
          const body = Buffer.from(
            this.buffer.subarray(bodyStart, bodyStart + contentLength)
          );
          this.buffer = this.buffer.subarray(bodyStart + contentLength);
          return { status: Number(statusMatch[1]), headers, body };
        }
      }
      if (this.closed) {
        throw new Error("conexão fechada antes de completar a resposta");
      }
      await this.#waitForData(deadline);
    }
  }

  send(raw) {
    this.socket.write(raw);
  }

  waitForClose(timeoutMs = 2000) {
    if (this.closed) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("timeout esperando o servidor fechar a conexão")),
        timeoutMs
      );
      this.closeWaiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  close() {
    this.socket.destroy();
  }
}

function requestLine(method, target, extraHeaders = "") {
  return `${method} ${target} HTTP/1.1\r\nHost: localhost\r\n${extraHeaders}\r\n`;
}

async function waitForPort(port, timeoutMs = 15000, hasExited = () => false) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasExited()) {
      throw new Error(`o programa encerrou antes de abrir a porta ${port}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: "127.0.0.1", port });
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error("timeout"));
        }, 400);
        socket.once("connect", () => {
          clearTimeout(timer);
          socket.destroy();
          resolve();
        });
        socket.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`servidor não abriu a porta ${port} em ${timeoutMs}ms`);
}

async function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

stage(1, "Bind to a port", async (ctx) => {
  const connection = await HttpConnection.open(ctx.port);
  connection.close();
});

stage(2, "Respond with 200", async (ctx) => {
  const connection = await HttpConnection.open(ctx.port);
  connection.send(requestLine("GET", "/"));
  const response = await connection.readResponse();
  assert(response.status === 200, `esperava 200, recebeu ${response.status}`);
  connection.close();
});

stage(3, "Extract URL path", async (ctx) => {
  const connection = await HttpConnection.open(ctx.port);
  connection.send(requestLine("GET", "/"));
  const root = await connection.readResponse();
  assert(root.status === 200, `GET / deveria ser 200, foi ${root.status}`);
  connection.send(requestLine("GET", "/abc"));
  const missing = await connection.readResponse();
  assert(missing.status === 404, `GET /abc deveria ser 404, foi ${missing.status}`);
  connection.close();
});

stage(4, "Respond with body", async (ctx) => {
  const connection = await HttpConnection.open(ctx.port);
  connection.send(requestLine("GET", "/echo/abc"));
  const response = await connection.readResponse();
  assert(response.status === 200, `esperava 200, recebeu ${response.status}`);
  assert(response.body.toString() === "abc", `body deveria ser "abc", foi "${response.body}"`);
  assert(
    (response.headers["content-type"] ?? "").startsWith("text/plain"),
    `Content-Type deveria ser text/plain, foi "${response.headers["content-type"]}"`
  );
  assert(response.headers["content-length"] === "3", "Content-Length deveria ser 3");
  connection.close();
});

stage(5, "Read header", async (ctx) => {
  const connection = await HttpConnection.open(ctx.port);
  connection.send(requestLine("GET", "/user-agent", "User-Agent: foobar/1.0\r\n"));
  const response = await connection.readResponse();
  assert(response.status === 200, `esperava 200, recebeu ${response.status}`);
  assert(
    response.body.toString() === "foobar/1.0",
    `body deveria ecoar o User-Agent, foi "${response.body}"`
  );
  connection.close();
});

stage(6, "Concurrent connections", async (ctx) => {
  const first = await HttpConnection.open(ctx.port);
  const second = await HttpConnection.open(ctx.port);
  first.send(requestLine("GET", "/echo/first"));
  second.send(requestLine("GET", "/echo/second"));
  const secondResponse = await second.readResponse(2000);
  assert(secondResponse.body.toString() === "second", "segunda conexão não foi atendida");
  const firstResponse = await first.readResponse(2000);
  assert(firstResponse.body.toString() === "first", "primeira conexão não foi atendida");
  first.close();
  second.close();
});

stage(7, "Return a file", async (ctx) => {
  const fileName = "hello.txt";
  const contents = "Hello, World!";
  await fs.writeFile(path.join(ctx.directory, fileName), contents);
  const connection = await HttpConnection.open(ctx.port);
  connection.send(requestLine("GET", `/files/${fileName}`));
  const response = await connection.readResponse();
  assert(response.status === 200, `esperava 200, recebeu ${response.status}`);
  assert(response.body.toString() === contents, "conteúdo do arquivo não confere");
  connection.send(requestLine("GET", "/files/does-not-exist.txt"));
  const missing = await connection.readResponse();
  assert(missing.status === 404, `arquivo inexistente deveria ser 404, foi ${missing.status}`);
  connection.close();
});

stage(8, "Read request body", async (ctx) => {
  const fileName = "new-file.txt";
  const contents = "body from POST";
  const connection = await HttpConnection.open(ctx.port);
  const request =
    `POST /files/${fileName} HTTP/1.1\r\nHost: localhost\r\n` +
    `Content-Type: application/octet-stream\r\nContent-Length: ${Buffer.byteLength(contents)}\r\n\r\n${contents}`;
  connection.send(request);
  const response = await connection.readResponse();
  assert(response.status === 201, `esperava 201, recebeu ${response.status}`);
  const saved = await fs.readFile(path.join(ctx.directory, fileName), "utf8");
  assert(saved === contents, "arquivo salvo não confere com o body enviado");
  connection.send(requestLine("GET", `/files/${fileName}`));
  const readBack = await connection.readResponse();
  assert(readBack.body.toString() === contents, "GET após POST não devolveu o conteúdo");
  connection.close();
});

stage(9, "Compression headers", async (ctx) => {
  const connection = await HttpConnection.open(ctx.port);
  connection.send(requestLine("GET", "/echo/abc", "Accept-Encoding: gzip\r\n"));
  const response = await connection.readResponse();
  assert(
    response.headers["content-encoding"] === "gzip",
    `esperava Content-Encoding: gzip, recebeu "${response.headers["content-encoding"]}"`
  );
  connection.close();
});

stage(10, "Multiple compression schemes", async (ctx) => {
  const unsupported = await HttpConnection.open(ctx.port);
  unsupported.send(requestLine("GET", "/echo/abc", "Accept-Encoding: br\r\n"));
  const withoutGzip = await unsupported.readResponse();
  assert(
    !withoutGzip.headers["content-encoding"],
    "não deveria comprimir quando o cliente não aceita gzip"
  );
  unsupported.close();

  const supported = await HttpConnection.open(ctx.port);
  supported.send(requestLine("GET", "/echo/abc", "Accept-Encoding: br, gzip\r\n"));
  const withGzip = await supported.readResponse();
  assert(
    withGzip.headers["content-encoding"] === "gzip",
    "deveria escolher gzip quando ele está na lista"
  );
  supported.close();

  const refused = await HttpConnection.open(ctx.port);
  refused.send(requestLine("GET", "/echo/abc", "Accept-Encoding: gzip;q=0\r\n"));
  const qZero = await refused.readResponse();
  assert(
    !qZero.headers["content-encoding"],
    "gzip com q=0 não deveria ser usado"
  );
  refused.close();
});

stage(11, "Gzip compression", async (ctx) => {
  const connection = await HttpConnection.open(ctx.port);
  connection.send(requestLine("GET", "/echo/compressed", "Accept-Encoding: gzip\r\n"));
  const response = await connection.readResponse();
  assert(response.headers["content-encoding"] === "gzip", "resposta não veio comprimida");
  const decompressed = zlib.gunzipSync(response.body).toString();
  assert(decompressed === "compressed", `conteúdo descomprimido inesperado: "${decompressed}"`);
  assert(
    Number(response.headers["content-length"]) === response.body.length,
    "Content-Length deveria ser o tamanho comprimido"
  );
  connection.close();
});

stage(12, "Persistent connections", async (ctx) => {
  const connection = await HttpConnection.open(ctx.port);
  for (const value of ["first", "second", "third"]) {
    connection.send(requestLine("GET", `/echo/${value}`));
    const response = await connection.readResponse();
    assert(response.body.toString() === value, `resposta inesperada para ${value}`);
    assert(
      response.headers["connection"] === "keep-alive",
      "servidor deveria manter a conexão aberta por padrão em HTTP/1.1"
    );
  }
  connection.close();
});

stage(13, "Concurrent persistent connections", async (ctx) => {
  const first = await HttpConnection.open(ctx.port);
  const second = await HttpConnection.open(ctx.port);
  const rounds = [
    ["a1", "b1"],
    ["a2", "b2"],
    ["a3", "b3"],
  ];
  for (const [firstValue, secondValue] of rounds) {
    first.send(requestLine("GET", `/echo/${firstValue}`));
    second.send(requestLine("GET", `/echo/${secondValue}`));
    const [firstResponse, secondResponse] = await Promise.all([
      first.readResponse(),
      second.readResponse(),
    ]);
    assert(firstResponse.body.toString() === firstValue, "resposta errada na conexão 1");
    assert(secondResponse.body.toString() === secondValue, "resposta errada na conexão 2");
  }
  first.close();
  second.close();
});

stage(14, "Connection closure", async (ctx) => {
  const closing = await HttpConnection.open(ctx.port);
  closing.send(requestLine("GET", "/", "Connection: close\r\n"));
  const response = await closing.readResponse();
  assert(response.status === 200, `esperava 200, recebeu ${response.status}`);
  assert(
    response.headers["connection"] === "close",
    "resposta deveria declarar Connection: close"
  );
  await closing.waitForClose();

  const persistent = await HttpConnection.open(ctx.port);
  persistent.send(requestLine("GET", "/"));
  const first = await persistent.readResponse();
  assert(first.status === 200, "primeira resposta da conexão persistente falhou");
  persistent.send(requestLine("GET", "/echo/still-open"));
  const second = await persistent.readResponse();
  assert(
    second.body.toString() === "still-open",
    "conexão não deveria ter sido fechada sem Connection: close"
  );
  persistent.close();
});

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  port,
  onProgress = () => {},
  onLog = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "http-server.jar");

  if (build) {
    const buildResult = spawnSync("mvn -q -B package", {
      cwd: workspaceDir,
      shell: true,
      encoding: "utf8",
      timeout: 240_000,
    });
    if (buildResult.status !== 0) {
      const output = [buildResult.stdout, buildResult.stderr].filter(Boolean).join("\n");
      const error = new Error(
        `falha ao compilar; veja a saída do Maven abaixo\n${output.slice(-6000)}`
      );
      error.compileOutput = output;
      throw error;
    }
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pw-http-server-"));
  let preferredPort;
  if (port && (await portIsFree(port))) preferredPort = port;
  else if (await portIsFree(DEFAULT_PORT)) preferredPort = DEFAULT_PORT;
  else preferredPort = await findFreePort();

  const args = ["-jar", jar, "--directory", directory];
  if (preferredPort !== DEFAULT_PORT) args.push("--port", String(preferredPort));
  const server = spawn("java", args, { stdio: ["ignore", "pipe", "pipe"] });
  let serverLogs = "";
  let serverExited = false;
  server.stdout.on("data", (chunk) => {
    serverLogs += chunk.toString();
    onLog(chunk.toString());
  });
  server.stderr.on("data", (chunk) => {
    serverLogs += chunk.toString();
    onLog(chunk.toString());
  });
  server.once("exit", () => {
    serverExited = true;
  });

  const results = [];
  try {
    try {
      await waitForPort(preferredPort, 15000, () => serverExited);
    } catch (startupError) {
      onProgress({ type: "server-error", error: startupError.message });
      for (const test of tests) {
        const result = {
          number: test.number,
          title: test.title,
          ok: false,
          error: startupError.message,
          durationMs: 0,
        };
        results.push(result);
        onProgress({ type: "stage-end", result });
      }
      return {
        results,
        passed: 0,
        failed: results.length,
        logs: serverLogs,
        port: preferredPort,
      };
    }
    onProgress({ type: "server-ready", port: preferredPort, directory });

    const ctx = { port: preferredPort, directory };

    for (const test of tests) {
      onProgress({ type: "stage-start", number: test.number, title: test.title });
      const startedAt = Date.now();
      try {
        await test.run(ctx);
        const result = {
          number: test.number,
          title: test.title,
          ok: true,
          durationMs: Date.now() - startedAt,
        };
        results.push(result);
        onProgress({ type: "stage-end", result });
      } catch (error) {
        const result = {
          number: test.number,
          title: test.title,
          ok: false,
          error: error.message,
          durationMs: Date.now() - startedAt,
        };
        results.push(result);
        onProgress({ type: "stage-end", result });
      }
    }
  } finally {
    server.kill();
    setTimeout(() => server.kill("SIGKILL"), 500).unref();
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  return {
    results,
    passed,
    failed,
    logs: serverLogs,
    port: preferredPort,
  };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const dirIndex = argv.indexOf("--dir");
  const workspaceDir = dirIndex >= 0 && argv[dirIndex + 1]
    ? path.resolve(argv[dirIndex + 1])
    : DEFAULT_WORKSPACE;
  const build = !argv.includes("--no-build");
  const jsonIndex = argv.indexOf("--json");
  const jsonFile = jsonIndex >= 0 ? argv[jsonIndex + 1] : null;

  if (build) console.log("🔨 Compilando o servidor (mvn package)...\n");

  const result = await runStages({
    workspaceDir,
    build,
    onProgress(event) {
      if (event.type === "server-ready") {
        console.log(`🚀 Servidor no ar na porta ${event.port}`);
        console.log(`📁 Diretório de arquivos: ${event.directory}\n`);
      }
      if (event.type === "stage-end") {
        const { result: stage } = event;
        console.log(`${stage.ok ? "✅" : "❌"} Stage ${String(stage.number).padStart(2, "0")} · ${stage.title}`);
        if (!stage.ok) console.log(`   ${stage.error}`);
      }
    },
  });

  console.log(`\n${result.passed}/${result.results.length} stages concluídos.`);
  if (result.failed > 0) {
    console.log("\nLogs do servidor:\n" + result.logs.slice(-4000));
    process.exitCode = 1;
  }
  if (jsonFile) {
    await fs.writeFile(jsonFile, JSON.stringify(result, null, 2));
  }
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(`\n💥 ${error.message}`);
    process.exit(1);
  });
}

