#!/usr/bin/env node
/**
 * Tester local do desafio DNS Server.
 *
 * Sobe um resolver DNS falso (UDP, porta aleatória), inicia o servidor do usuário com
 * `--resolver 127.0.0.1:<porta>` e executa os 8 stages enviando pacotes DNS crus.
 *
 * Os stages 2–7 conferem apenas a estrutura da resposta (nunca o IP), então tanto uma
 * resposta fixa (stage 4) quanto uma resposta encaminhada (stage 8) passam neles.
 *
 * Uso:
 *   node challenges/dns-server/tests/run-stages.mjs
 *   node challenges/dns-server/tests/run-stages.mjs --dir <workspace> --no-build
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import dgram from "node:dgram";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const DEFAULT_PORT = 2053;
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const FIXED_NAME = "programming.wizard";

const WORDS = [
  "apple", "banana", "mango", "orange", "pear", "monkey", "donkey", "scooby",
  "wizard", "spell", "potion", "scroll", "dragon", "castle", "tower", "raven",
];

function randomWord() {
  return WORDS[crypto.randomInt(WORDS.length)];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --------------------------------------------------------------- DNS codec

function encodeName(name) {
  const parts = name.split(".").filter(Boolean);
  const chunks = parts.map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label, "ascii")]));
  return Buffer.concat([...chunks, Buffer.from([0])]);
}

function header({ id, qr = 0, opcode = 0, aa = 0, tc = 0, rd = 0, ra = 0, rcode = 0, qd = 0, an = 0 }) {
  const buf = Buffer.alloc(12);
  buf.writeUInt16BE(id, 0);
  buf.writeUInt16BE((qr << 15) | (opcode << 11) | (aa << 10) | (tc << 9) | (rd << 8) | (ra << 7) | rcode, 2);
  buf.writeUInt16BE(qd, 4);
  buf.writeUInt16BE(an, 6);
  return buf;
}

function question(name, type = 1, klass = 1) {
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(type, 0);
  tail.writeUInt16BE(klass, 2);
  return Buffer.concat([encodeName(name), tail]);
}

function buildQuery({ id, opcode = 0, rd = 0, names }) {
  return Buffer.concat([header({ id, opcode, rd, qd: names.length }), ...names.map((name) => question(name))]);
}

function readName(buf, offset) {
  const labels = [];
  let cursor = offset;
  let end = null;
  let jumps = 0;
  while (true) {
    if (cursor >= buf.length) throw new Error("nome DNS ultrapassa o fim do pacote");
    const length = buf[cursor];
    if ((length & 0xc0) === 0xc0) {
      if (end === null) end = cursor + 2;
      if (++jumps > 32) throw new Error("loop de ponteiros de compressão");
      cursor = ((length & 0x3f) << 8) | buf[cursor + 1];
      continue;
    }
    if (length === 0) {
      if (end === null) end = cursor + 1;
      break;
    }
    labels.push(buf.subarray(cursor + 1, cursor + 1 + length).toString("ascii"));
    cursor += 1 + length;
  }
  return { name: labels.join("."), next: end };
}

function parseMessage(buf) {
  if (buf.length < 12) throw new Error(`resposta com ${buf.length} bytes — o header DNS tem 12`);
  const flags = buf.readUInt16BE(2);
  const message = {
    id: buf.readUInt16BE(0),
    qr: (flags >> 15) & 1,
    opcode: (flags >> 11) & 0xf,
    aa: (flags >> 10) & 1,
    tc: (flags >> 9) & 1,
    rd: (flags >> 8) & 1,
    ra: (flags >> 7) & 1,
    z: (flags >> 4) & 7,
    rcode: flags & 0xf,
    qdcount: buf.readUInt16BE(4),
    ancount: buf.readUInt16BE(6),
    questions: [],
    answers: [],
  };
  let offset = 12;
  try {
    for (let i = 0; i < message.qdcount; i++) {
      const { name, next } = readName(buf, offset);
      message.questions.push({ name, type: buf.readUInt16BE(next), class: buf.readUInt16BE(next + 2) });
      offset = next + 4;
    }
    for (let i = 0; i < message.ancount; i++) {
      const { name, next } = readName(buf, offset);
      const length = buf.readUInt16BE(next + 8);
      message.answers.push({
        name,
        type: buf.readUInt16BE(next),
        class: buf.readUInt16BE(next + 2),
        ttl: buf.readUInt32BE(next + 4),
        length,
        data: buf.subarray(next + 10, next + 10 + length),
      });
      offset = next + 10 + length;
      if (offset > buf.length) throw new Error("RDATA ultrapassa o fim do pacote");
    }
  } catch (error) {
    if (error instanceof RangeError) throw new Error("pacote terminou antes do esperado pelos contadores do header");
    throw error;
  }
  return message;
}

// ----------------------------------------------------------- rede UDP

function exchange(port, packet, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`sem resposta UDP em 127.0.0.1:${port} após ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once("message", (message) => {
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.send(packet, port, "127.0.0.1");
  });
}

async function ask(ctx, packet) {
  return parseMessage(await exchange(ctx.port, packet));
}

function ipFor(name) {
  const digest = crypto.createHash("sha1").update(name).digest();
  return [10, digest[0], digest[1], Math.max(1, digest[2])];
}

/** Resolver falso: só aceita uma pergunta por pacote e responde A com um IP derivado do nome. */
async function startResolver() {
  const socket = dgram.createSocket("udp4");
  const resolver = { socket, received: 0, rejected: 0, port: 0 };
  socket.on("message", (packet, remote) => {
    let query;
    try {
      query = parseMessage(packet);
    } catch {
      return;
    }
    resolver.received += 1;
    if (query.qdcount !== 1) {
      resolver.rejected += 1;
      const reply = header({ id: query.id, qr: 1, opcode: query.opcode, rd: query.rd, ra: 1, rcode: 1 });
      socket.send(reply, remote.port, remote.address);
      return;
    }
    const q = query.questions[0];
    const answer = Buffer.alloc(10);
    answer.writeUInt16BE(1, 0);
    answer.writeUInt16BE(1, 2);
    answer.writeUInt32BE(120, 4);
    answer.writeUInt16BE(4, 8);
    const reply = Buffer.concat([
      header({ id: query.id, qr: 1, rd: query.rd, ra: 1, qd: 1, an: 1 }),
      question(q.name),
      encodeName(q.name),
      answer,
      Buffer.from(ipFor(q.name)),
    ]);
    socket.send(reply, remote.port, remote.address);
  });
  await new Promise((resolve) => socket.bind(0, "127.0.0.1", resolve));
  resolver.port = socket.address().port;
  return resolver;
}

async function udpPortIsFree(port) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    socket.once("error", () => resolve(false));
    socket.bind(port, "127.0.0.1", () => socket.close(() => resolve(true)));
  });
}

async function findFreeUdpPort() {
  const socket = dgram.createSocket("udp4");
  await new Promise((resolve) => socket.bind(0, "127.0.0.1", resolve));
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

/** UDP não tem "conectar": espera o servidor responder a uma consulta qualquer. */
async function waitForServer(port, timeoutMs, hasExited) {
  const deadline = Date.now() + timeoutMs;
  const probe = buildQuery({ id: 1, names: [FIXED_NAME] });
  while (Date.now() < deadline) {
    if (hasExited()) throw new Error("o servidor encerrou antes de responder");
    try {
      await exchange(port, probe, 400);
      return;
    } catch {
      // ainda subindo
    }
  }
  throw new Error(`o servidor não respondeu a nenhum pacote UDP em 127.0.0.1:${port} em ${timeoutMs / 1000}s`);
}

// ------------------------------------------------------------------ stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

function checkAnswer(answer, name) {
  assert(answer.name === name, `answer com nome "${answer.name}", esperava "${name}"`);
  assert(answer.type === 1, `answer com TYPE ${answer.type}, esperava 1 (A)`);
  assert(answer.class === 1, `answer com CLASS ${answer.class}, esperava 1 (IN)`);
  assert(answer.length === 4, `answer com RDLENGTH ${answer.length}, esperava 4 (IPv4)`);
}

stage(1, "Setup UDP server", async (ctx) => {
  const raw = await exchange(ctx.port, buildQuery({ id: 1234, names: [FIXED_NAME] }));
  assert(raw.length >= 12, `a resposta tem ${raw.length} bytes; um pacote DNS tem pelo menos 12 (header)`);
});

stage(2, "Write header section", async (ctx) => {
  const reply = await ask(ctx, buildQuery({ id: 1234, names: [FIXED_NAME] }));
  assert(reply.id === 1234, `ID ${reply.id}, esperava 1234`);
  assert(reply.qr === 1, "QR deveria ser 1 (resposta)");
  assert(reply.opcode === 0, `OPCODE ${reply.opcode}, esperava 0`);
  assert(reply.aa === 0, "AA deveria ser 0");
  assert(reply.tc === 0, "TC deveria ser 0");
  assert(reply.z === 0, "Z deveria ser 0");
  assert(reply.rcode === 0, `RCODE ${reply.rcode}, esperava 0`);
});

stage(3, "Write question section", async (ctx) => {
  const reply = await ask(ctx, buildQuery({ id: 1234, names: [FIXED_NAME] }));
  assert(reply.qdcount === 1, `QDCOUNT ${reply.qdcount}, esperava 1`);
  const [q] = reply.questions;
  assert(q.name === FIXED_NAME, `question com nome "${q.name}", esperava "${FIXED_NAME}"`);
  assert(q.type === 1, `question com TYPE ${q.type}, esperava 1 (A)`);
  assert(q.class === 1, `question com CLASS ${q.class}, esperava 1 (IN)`);
});

stage(4, "Write answer section", async (ctx) => {
  const reply = await ask(ctx, buildQuery({ id: 1234, names: [FIXED_NAME] }));
  assert(reply.ancount === 1, `ANCOUNT ${reply.ancount}, esperava 1`);
  checkAnswer(reply.answers[0], FIXED_NAME);
});

stage(5, "Parse header section", async (ctx) => {
  const id = crypto.randomInt(1, 65535);
  const reply = await ask(ctx, buildQuery({ id, rd: 1, names: [FIXED_NAME] }));
  assert(reply.id === id, `ID ${reply.id}, esperava ${id} (copie o ID do request)`);
  assert(reply.rd === 1, "RD deveria ser copiado do request (1)");
  assert(reply.opcode === 0, `OPCODE ${reply.opcode}, esperava 0`);
  assert(reply.rcode === 0, `RCODE ${reply.rcode} para OPCODE 0, esperava 0`);

  const otherId = crypto.randomInt(1, 65535);
  const status = await ask(ctx, buildQuery({ id: otherId, opcode: 2, rd: 0, names: [FIXED_NAME] }));
  assert(status.id === otherId, `ID ${status.id}, esperava ${otherId}`);
  assert(status.opcode === 2, `OPCODE ${status.opcode}, esperava 2 (copie o OPCODE do request)`);
  assert(status.rd === 0, "RD deveria ser copiado do request (0)");
  assert(status.rcode === 4, `RCODE ${status.rcode} para OPCODE 2, esperava 4 (not implemented)`);
});

stage(6, "Parse question section", async (ctx) => {
  const name = `${randomWord()}.${randomWord()}.com`;
  const reply = await ask(ctx, buildQuery({ id: crypto.randomInt(1, 65535), names: [name] }));
  assert(reply.qdcount === 1, `QDCOUNT ${reply.qdcount}, esperava 1`);
  assert(reply.questions[0].name === name, `question "${reply.questions[0].name}", esperava "${name}"`);
  assert(reply.ancount === 1, `ANCOUNT ${reply.ancount}, esperava 1`);
  checkAnswer(reply.answers[0], name);
});

/** Duas perguntas; a segunda usa um ponteiro de compressão para o sufixo da primeira. */
function compressedQuery(id, rd = 0) {
  const suffix = `${randomWord()}${crypto.randomInt(1000)}.com`;
  const first = `${randomWord()}.${suffix}`;
  const secondLabel = `${randomWord()}x`;
  const firstLabelLength = first.split(".")[0].length;
  const pointerTarget = 12 + 1 + firstLabelLength; // header + byte de tamanho + primeiro label
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(1, 0);
  tail.writeUInt16BE(1, 2);
  const packet = Buffer.concat([
    header({ id, rd, qd: 2 }),
    question(first),
    Buffer.from([secondLabel.length]),
    Buffer.from(secondLabel, "ascii"),
    Buffer.from([0xc0 | (pointerTarget >> 8), pointerTarget & 0xff]),
    tail,
  ]);
  return { packet, names: [first, `${secondLabel}.${suffix}`] };
}

stage(7, "Parse compressed packet", async (ctx) => {
  const { packet, names } = compressedQuery(crypto.randomInt(1, 65535));
  const reply = await ask(ctx, packet);
  assert(reply.qdcount === 2, `QDCOUNT ${reply.qdcount}, esperava 2`);
  assert(
    reply.questions.map((q) => q.name).join(",") === names.join(","),
    `questions [${reply.questions.map((q) => q.name).join(", ")}], esperava [${names.join(", ")}]`
  );
  assert(reply.ancount === 2, `ANCOUNT ${reply.ancount}, esperava 2 (uma resposta por pergunta)`);
  reply.answers.forEach((answer, i) => checkAnswer(answer, names[i]));
});

stage(8, "Forwarding Server", async (ctx) => {
  const before = ctx.resolver.received;
  const single = `${randomWord()}.${randomWord()}.org`;
  const id = crypto.randomInt(1, 65535);
  const reply = await ask(ctx, buildQuery({ id, rd: 1, names: [single] }));
  assert(ctx.resolver.received > before, "o resolver não recebeu nenhuma consulta — encaminhe para o endereço de --resolver");
  assert(reply.id === id, `ID ${reply.id}, esperava ${id}`);
  assert(reply.ancount === 1, `ANCOUNT ${reply.ancount}, esperava 1`);
  checkAnswer(reply.answers[0], single);
  assert(
    reply.answers[0].data.join(".") === ipFor(single).join("."),
    `IP ${reply.answers[0].data.join(".")} para ${single}; o resolver respondeu ${ipFor(single).join(".")}`
  );

  const { packet, names } = compressedQuery(crypto.randomInt(1, 65535), 1);
  const multi = await ask(ctx, packet);
  assert(multi.ancount === 2, `ANCOUNT ${multi.ancount} para 2 perguntas, esperava 2 (o resolver só aceita uma pergunta por pacote)`);
  multi.answers.forEach((answer, i) => {
    checkAnswer(answer, names[i]);
    assert(
      answer.data.join(".") === ipFor(names[i]).join("."),
      `IP ${answer.data.join(".")} para ${names[i]}; o resolver respondeu ${ipFor(names[i]).join(".")}`
    );
  });
});

// ------------------------------------------------------------------- runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  port,
  onProgress = () => {},
  onLog = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "dns-server.jar");

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

  let serverPort;
  if (port && (await udpPortIsFree(port))) serverPort = port;
  else if (await udpPortIsFree(DEFAULT_PORT)) serverPort = DEFAULT_PORT;
  else serverPort = await findFreeUdpPort();

  const resolver = await startResolver();
  const args = ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", jar, "--resolver", `127.0.0.1:${resolver.port}`];
  if (serverPort !== DEFAULT_PORT) args.push("--port", String(serverPort));
  const server = spawn("java", args, { stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  let exited = false;
  const collect = (chunk) => {
    logs += chunk.toString();
    onLog(chunk.toString());
  };
  server.stdout.on("data", collect);
  server.stderr.on("data", collect);
  server.once("exit", () => {
    exited = true;
  });
  server.once("error", (error) => {
    exited = true;
    logs += `${error.message}\n`;
  });

  const results = [];
  try {
    try {
      await waitForServer(serverPort, 15_000, () => exited);
    } catch (startupError) {
      onProgress({ type: "server-error", error: startupError.message });
      for (const test of tests) {
        const result = { number: test.number, title: test.title, ok: false, error: startupError.message, durationMs: 0 };
        results.push(result);
        onProgress({ type: "stage-end", result });
      }
      return { results, passed: 0, failed: results.length, logs, port: serverPort };
    }
    onProgress({ type: "server-ready", port: serverPort, resolver: resolver.port });

    const ctx = { port: serverPort, resolver };
    for (const test of tests) {
      onProgress({ type: "stage-start", number: test.number, title: test.title });
      const startedAt = Date.now();
      let result;
      try {
        await test.run(ctx);
        result = { number: test.number, title: test.title, ok: true, durationMs: Date.now() - startedAt };
      } catch (error) {
        result = { number: test.number, title: test.title, ok: false, error: error.message, durationMs: Date.now() - startedAt };
      }
      results.push(result);
      onProgress({ type: "stage-end", result });
    }
  } finally {
    server.kill();
    setTimeout(() => server.kill("SIGKILL"), 500).unref();
    resolver.socket.close();
  }

  const passed = results.filter((result) => result.ok).length;
  return { results, passed, failed: results.length - passed, logs, port: serverPort };
}

async function main() {
  const argv = process.argv.slice(2);
  const dirIndex = argv.indexOf("--dir");
  const workspaceDir = dirIndex >= 0 && argv[dirIndex + 1] ? path.resolve(argv[dirIndex + 1]) : DEFAULT_WORKSPACE;
  const build = !argv.includes("--no-build");

  if (build) console.log("🔨 Compilando o servidor (mvn package)...\n");
  const result = await runStages({
    workspaceDir,
    build,
    onProgress(event) {
      if (event.type === "server-ready") {
        console.log(`🚀 Servidor DNS respondendo em 127.0.0.1:${event.port} (resolver falso em :${event.resolver})\n`);
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
    console.log(`\nLogs do servidor:\n${result.logs.slice(-4000)}`);
    process.exitCode = 1;
  }
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(`\n💥 ${error.message}`);
    process.exit(1);
  });
}
