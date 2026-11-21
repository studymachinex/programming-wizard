#!/usr/bin/env node
/**
 * Tester local do desafio Redis.
 *
 * Sobe `java -jar target/redis.jar --port <porta livre> ...` e conversa com ele em RESP, como um
 * cliente comum. Nos stages de replicação o tester também faz o papel de master (para testar o
 * lado réplica) ou de réplica (para testar o lado master). Os arquivos RDB e AOF usados nos
 * testes são gerados aqui.
 *
 * O servidor sempre recebe `--port`: assim o teste não briga com um Redis que já esteja rodando
 * na 6379.
 *
 * Uso:
 *   node challenges/redis/tests/run-stages.mjs
 *   node challenges/redis/tests/run-stages.mjs --dir <workspace> --no-build [--only 1,2]
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const WORDS = ["abacaxi", "banana", "caju", "damasco", "figo", "goiaba", "jaca", "kiwi", "limao", "manga", "pitanga", "uva"];

const pick = (list) => list[crypto.randomInt(list.length)];
const rand = (min, max) => min + crypto.randomInt(max - min + 1);
const token = () => crypto.randomBytes(3).toString("hex");
const key = (prefix = pick(WORDS)) => `${prefix}:${token()}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ------------------------------------------------------------------ RESP

/** Respostas: {t:"+",v} {t:"-",v} {t:":",v} {t:"$",v|null} {t:"*",v|null}. */
const S = (v) => ({ t: "+", v });
const E = (v) => ({ t: "-", v }); // compara por prefixo
const I = (v) => ({ t: ":", v });
const B = (v) => ({ t: "$", v });
const NB = { t: "$", v: null };
const A = (...v) => ({ t: "*", v });
const NA = { t: "*", v: null };
const BA = (...values) => A(...values.map(B));

function encode(args) {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    const buf = Buffer.from(String(arg), "latin1");
    parts.push(`$${buf.length}\r\n`, buf.toString("latin1"), "\r\n");
  }
  return Buffer.from(parts.join(""), "latin1");
}

/** Lê uma resposta de buf a partir de offset; null se ainda faltam bytes. */
function parse(buf, offset = 0) {
  if (offset >= buf.length) return null;
  const end = buf.indexOf("\r\n", offset, "latin1");
  if (end < 0) return null;
  const type = String.fromCharCode(buf[offset]);
  const line = buf.toString("latin1", offset + 1, end);
  const next = end + 2;
  switch (type) {
    case "+":
    case "-":
      return { value: { t: type, v: line }, next };
    case ":":
      return { value: { t: ":", v: Number(line) }, next };
    case "$": {
      const len = Number(line);
      if (len < 0) return { value: NB, next };
      if (buf.length < next + len + 2) return null;
      return { value: B(buf.toString("latin1", next, next + len)), next: next + len + 2 };
    }
    case "*": {
      const count = Number(line);
      if (count < 0) return { value: NA, next };
      const items = [];
      let pos = next;
      for (let i = 0; i < count; i++) {
        const item = parse(buf, pos);
        if (!item) return null;
        items.push(item.value);
        pos = item.next;
      }
      return { value: { t: "*", v: items }, next: pos };
    }
    default:
      throw new Error(`resposta RESP inválida começando com ${JSON.stringify(buf.toString("latin1", offset, offset + 20))}`);
  }
}

function show(value) {
  if (value === undefined) return "(nada)";
  switch (value.t) {
    case "+":
      return `+${value.v}`;
    case "-":
      return `-${value.v}`;
    case ":":
      return `:${value.v}`;
    case "$":
      return value.v === null ? "(nil)" : JSON.stringify(value.v);
    case "*":
      return value.v === null ? "(nil array)" : `[${value.v.map(show).join(", ")}]`;
    default:
      return JSON.stringify(value);
  }
}

function matches(actual, expected) {
  if (!actual || actual.t !== expected.t) return false;
  if (expected.t === "-") return actual.v.startsWith(expected.v);
  if (expected.t === "*") {
    if (expected.v === null || actual.v === null) return expected.v === actual.v;
    return actual.v.length === expected.v.length && actual.v.every((item, i) => matches(item, expected.v[i]));
  }
  return actual.v === expected.v;
}

const describe = (args) => args.map((a) => (/\s/.test(String(a)) || a === "" ? JSON.stringify(String(a)) : a)).join(" ");

let logs = "";

/** Uma conexão TCP com leitura incremental de respostas RESP. */
class Conn {
  constructor(socket, name) {
    this.socket = socket;
    this.name = name;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.closed = false;
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flush();
    });
    socket.on("close", () => {
      this.closed = true;
      this.flush();
    });
    socket.on("error", () => {});
  }

  static connect(port, name = "cliente") {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.setNoDelay(true);
      socket.once("connect", () => resolve(new Conn(socket, name)));
      socket.once("error", reject);
    });
  }

  flush() {
    for (const waiter of [...this.waiters]) waiter();
  }

  write(data) {
    this.socket.write(data);
  }

  send(...args) {
    logs += `${this.name} → ${describe(args)}\n`;
    this.write(encode(args));
  }

  /** Espera até `fn(buffer)` devolver algo (ou o tempo acabar). */
  waitFor(fn, timeoutMs, describeTimeout) {
    return new Promise((resolve, reject) => {
      let timer;
      const check = () => {
        let result;
        try {
          result = fn();
        } catch (error) {
          done();
          reject(error);
          return;
        }
        if (result !== undefined && result !== null) {
          done();
          resolve(result);
        } else if (this.closed) {
          done();
          reject(new Error(`${describeTimeout()} — a conexão foi fechada pelo servidor`));
        }
      };
      const done = () => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== check);
      };
      this.waiters.push(check);
      timer = setTimeout(() => {
        done();
        reject(new Error(describeTimeout()));
      }, timeoutMs);
      check();
    });
  }

  async reply(timeoutMs = 3_000, what = "resposta") {
    const value = await this.waitFor(
      () => {
        const parsed = parse(this.buffer);
        if (!parsed) return null;
        this.buffer = this.buffer.subarray(parsed.next);
        return parsed.value;
      },
      timeoutMs,
      () => `${this.name}: esperava uma ${what} em até ${timeoutMs} ms, recebeu ${JSON.stringify(this.buffer.toString("latin1").slice(0, 200)) || "nada"}`
    );
    logs += `${this.name} ← ${show(value)}\n`;
    return value;
  }

  async call(...args) {
    this.send(...args);
    return this.reply(3_000, `resposta para ${describe(args)}`);
  }

  async expect(args, expected, timeoutMs = 3_000) {
    this.send(...args);
    const actual = await this.reply(timeoutMs, `resposta para ${describe(args)}`);
    assert(matches(actual, expected), `${this.name}: ${describe(args)}\n   esperava ${show(expected)}${expected.t === "-" ? "..." : ""}\n   recebeu  ${show(actual)}`);
    return actual;
  }

  /** Confere que nenhuma resposta chega em `ms`. */
  async expectSilence(ms, what) {
    await delay(ms);
    assert(this.buffer.length === 0, `${this.name}: ${what}, mas chegou ${JSON.stringify(this.buffer.toString("latin1").slice(0, 120))}`);
  }

  async readBytes(count, timeoutMs = 3_000) {
    return this.waitFor(
      () => {
        if (this.buffer.length < count) return null;
        const data = this.buffer.subarray(0, count);
        this.buffer = this.buffer.subarray(count);
        return data;
      },
      timeoutMs,
      () => `${this.name}: esperava ${count} bytes, recebeu ${this.buffer.length}`
    );
  }

  async readLine(timeoutMs = 3_000, what = "linha") {
    return this.waitFor(
      () => {
        const end = this.buffer.indexOf("\r\n");
        if (end < 0) return null;
        const line = this.buffer.toString("latin1", 0, end);
        this.buffer = this.buffer.subarray(end + 2);
        return line;
      },
      timeoutMs,
      () => `${this.name}: esperava ${what}, recebeu ${JSON.stringify(this.buffer.toString("latin1").slice(0, 120)) || "nada"}`
    );
  }

  close() {
    this.socket.destroy();
  }
}

// --------------------------------------------------------------- servidor

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startServer(ctx, args = [], { port } = {}) {
  port ??= await freePort();
  const child = spawn("java", ["-jar", ctx.jar, "--port", String(port), ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  let exited = false;
  child.on("exit", () => (exited = true));
  ctx.cleanup.push(async () => {
    if (!exited) child.kill("SIGKILL");
    if (output.trim()) logs += `[saída do servidor na porta ${port}]\n${output.trim().slice(-1500)}\n`;
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`o servidor terminou ao iniciar (${["--port", port, ...args].join(" ")})\n${output.trim().slice(-800)}`);
    try {
      const conn = await Conn.connect(port, "sonda");
      conn.close();
      logs += `[servidor ouvindo na porta ${port} ${args.join(" ")}]\n`;
      return { port, child, output: () => output };
    } catch {
      await delay(100);
    }
  }
  throw new Error(`o servidor não aceitou conexões na porta ${port} em 15 s (ele lê --port?)`);
}

async function client(ctx, port, name = "cliente") {
  const conn = await Conn.connect(port, name);
  ctx.cleanup.push(async () => conn.close());
  return conn;
}

/** Servidor + um cliente: o caso mais comum. */
async function setup(ctx, args = []) {
  const server = await startServer(ctx, args);
  return { server, c: await client(ctx, server.port) };
}

// ------------------------------------------------------------- replicação

/** O tester se passa por réplica: faz o handshake e recebe o RDB. */
async function fakeReplica(ctx, port, name = "réplica") {
  const r = await client(ctx, port, name);
  await r.expect(["PING"], S("PONG"));
  await r.expect(["REPLCONF", "listening-port", String(rand(7000, 7999))], S("OK"));
  await r.expect(["REPLCONF", "capa", "psync2"], S("OK"));
  r.send("PSYNC", "?", "-1");
  const line = await r.readLine(3_000, "+FULLRESYNC <replid> 0");
  assert(/^\+FULLRESYNC [0-9a-zA-Z]{40} 0$/.test(line), `${name}: PSYNC ? -1 devolveu ${JSON.stringify(line)}, esperava "+FULLRESYNC <id de 40 caracteres> 0"`);
  const header = await r.readLine(3_000, "$<tamanho do RDB>");
  assert(/^\$\d+$/.test(header), `${name}: depois do FULLRESYNC esperava "$<tamanho>", recebeu ${JSON.stringify(header)}`);
  const rdb = await r.readBytes(Number(header.slice(1)));
  r.received = 0; // bytes de comandos propagados recebidos depois do RDB
  return { r, rdb, replid: line.split(" ")[1] };
}

/** Lê o próximo comando propagado (um array RESP) e conta os bytes. */
async function readPropagated(r, timeoutMs = 3_000) {
  return r.waitFor(
    () => {
      const parsed = parse(r.buffer);
      if (!parsed) return null;
      const bytes = parsed.next;
      r.buffer = r.buffer.subarray(parsed.next);
      const args = parsed.value.v.map((item) => item.v);
      logs += `${r.name} ← ${describe(args)}\n`;
      return { args, bytes };
    },
    timeoutMs,
    () => `${r.name}: esperava receber um comando propagado em até ${timeoutMs} ms`
  );
}

/** O tester se passa por master: aceita a conexão da réplica e confere o handshake. */
async function fakeMaster(ctx) {
  const port = await freePort();
  const pending = [];
  let resolveConn;
  const connected = new Promise((resolve) => (resolveConn = resolve));
  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    resolveConn(new Conn(socket, "master (tester)"));
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  ctx.cleanup.push(async () => {
    server.close();
    for (const p of pending) p.socket?.destroy();
  });
  return {
    port,
    async accept() {
      const conn = await Promise.race([
        connected,
        delay(10_000).then(() => {
          throw new Error("a réplica não conectou no master em 10 s (ela lê --replicaof \"host porta\"?)");
        }),
      ]);
      pending.push(conn);
      return conn;
    },
  };
}

async function readCommand(conn, what) {
  const value = await conn.reply(5_000, what);
  assert(value.t === "*", `${conn.name}: esperava ${what} como array RESP, recebeu ${show(value)}`);
  const args = value.v.map((item) => item.v);
  return args;
}

/** Faz o handshake completo do lado do master e manda um RDB vazio. */
async function acceptReplica(master, { replicaPort } = {}) {
  const m = await master.accept();
  let args = await readCommand(m, "PING");
  assert(args[0]?.toUpperCase() === "PING", `primeiro comando do handshake deveria ser PING, veio ${describe(args)}`);
  m.write(Buffer.from("+PONG\r\n"));
  args = await readCommand(m, "REPLCONF listening-port <porta>");
  assert(args[0]?.toUpperCase() === "REPLCONF" && args[1] === "listening-port" && (!replicaPort || args[2] === String(replicaPort)),
    `esperava REPLCONF listening-port ${replicaPort ?? "<porta>"}, veio ${describe(args)}`);
  m.write(Buffer.from("+OK\r\n"));
  args = await readCommand(m, "REPLCONF capa psync2");
  assert(args[0]?.toUpperCase() === "REPLCONF" && args[1] === "capa" && args[2] === "psync2", `esperava REPLCONF capa psync2, veio ${describe(args)}`);
  m.write(Buffer.from("+OK\r\n"));
  args = await readCommand(m, "PSYNC ? -1");
  assert(args[0]?.toUpperCase() === "PSYNC" && args[1] === "?" && args[2] === "-1", `esperava PSYNC ? -1, veio ${describe(args)}`);
  const rdb = emptyRdb();
  m.write(Buffer.concat([Buffer.from(`+FULLRESYNC ${"a".repeat(40)} 0\r\n$${rdb.length}\r\n`), rdb]));
  return m;
}

// ------------------------------------------------------------------ RDB

function rdbLength(n) {
  if (n < 64) return Buffer.from([n]);
  if (n < 16384) return Buffer.from([0x40 | (n >> 8), n & 0xff]);
  const b = Buffer.alloc(5);
  b[0] = 0x80;
  b.writeUInt32BE(n, 1);
  return b;
}

function rdbString(text) {
  const data = Buffer.from(text, "latin1");
  return Buffer.concat([rdbLength(data.length), data]);
}

function emptyRdb() {
  return Buffer.concat([Buffer.from("REDIS0011"), Buffer.from([0xff]), Buffer.alloc(8)]);
}

/** entries: [{key, value, expiresMs?, expiresSec?}] */
function buildRdb(entries) {
  const parts = [Buffer.from("REDIS0011")];
  parts.push(Buffer.from([0xfa]), rdbString("redis-ver"), rdbString("7.2.0"));
  parts.push(Buffer.from([0xfa]), rdbString("redis-bits"), Buffer.from([0xc0, 64]));
  parts.push(Buffer.from([0xfe, 0x00]), Buffer.from([0xfb]), rdbLength(entries.length), rdbLength(entries.filter((e) => e.expiresMs || e.expiresSec).length));
  for (const entry of entries) {
    if (entry.expiresMs !== undefined) {
      const b = Buffer.alloc(9);
      b[0] = 0xfc;
      b.writeBigUInt64LE(BigInt(entry.expiresMs), 1);
      parts.push(b);
    } else if (entry.expiresSec !== undefined) {
      const b = Buffer.alloc(5);
      b[0] = 0xfd;
      b.writeUInt32LE(entry.expiresSec, 1);
      parts.push(b);
    }
    parts.push(Buffer.from([0x00]), rdbString(entry.key), rdbString(entry.value));
  }
  parts.push(Buffer.from([0xff]), Buffer.alloc(8));
  return Buffer.concat(parts);
}

// -------------------------------------------------------------------- geo

const LAT_MIN = -85.05112878;
const LAT_MAX = 85.05112878;
const STEP = 26n;

function geoEncode(lon, lat) {
  const latBits = BigInt(Math.floor(((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * 2 ** 26));
  const lonBits = BigInt(Math.floor(((lon + 180) / 360) * 2 ** 26));
  let result = 0n;
  for (let i = 0n; i < STEP; i++) {
    result |= ((latBits >> i) & 1n) << (2n * i);
    result |= ((lonBits >> i) & 1n) << (2n * i + 1n);
  }
  return Number(result);
}

function geoDecode(score) {
  const hash = BigInt(score);
  let latBits = 0n;
  let lonBits = 0n;
  for (let i = 0n; i < STEP; i++) {
    latBits |= ((hash >> (2n * i)) & 1n) << i;
    lonBits |= ((hash >> (2n * i + 1n)) & 1n) << i;
  }
  const cell = (bits, min, max) => {
    const lo = min + (Number(bits) / 2 ** 26) * (max - min);
    const hi = min + ((Number(bits) + 1) / 2 ** 26) * (max - min);
    return (lo + hi) / 2;
  };
  return [cell(lonBits, -180, 180), cell(latBits, LAT_MIN, LAT_MAX)];
}

function geoDistance(lon1, lat1, lon2, lat2) {
  const rad = (d) => (d * Math.PI) / 180;
  const u = Math.sin((rad(lat2) - rad(lat1)) / 2);
  const v = Math.sin(rad(lon2 - lon1) / 2);
  return 2 * 6372797.560856 * Math.asin(Math.sqrt(u * u + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * v * v));
}

const PLACES = [
  ["Sao Paulo", -46.6333, -23.5505],
  ["Rio", -43.1729, -22.9068],
  ["Lisboa", -9.1393, 38.7223],
  ["Paris", 2.3522, 48.8566],
  ["Londres", -0.1278, 51.5074],
  ["Toquio", 139.6917, 35.6895],
  ["Sydney", 151.2093, -33.8688],
  ["Nairobi", 36.8219, -1.2921],
];

// ------------------------------------------------------------------ stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

// Core ------------------------------------------------------------------------------

stage(1, "Bind to a port", async (ctx) => {
  await startServer(ctx);
});

stage(2, "Respond to PING", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["PING"], S("PONG"));
});

stage(3, "Respond to multiple PINGs", async (ctx) => {
  const { c } = await setup(ctx);
  for (let i = 0; i < 3; i++) await c.expect(["PING"], S("PONG"));
  c.write(Buffer.concat([encode(["PING"]), encode(["PING"])]));
  for (let i = 0; i < 2; i++) assert(matches(await c.reply(), S("PONG")), "dois PINGs na mesma escrita devem gerar duas respostas +PONG");
});

stage(4, "Handle concurrent clients", async (ctx) => {
  const { server, c } = await setup(ctx);
  const others = [await client(ctx, server.port, "cliente 2"), await client(ctx, server.port, "cliente 3")];
  for (const conn of shuffle([c, ...others, c, ...others])) await conn.expect(["PING"], S("PONG"));
});

stage(5, "Implement the ECHO command", async (ctx) => {
  const { c } = await setup(ctx);
  const word = pick(WORDS);
  await c.expect(["ECHO", word], B(word));
  const phrase = `${pick(WORDS)} ${pick(WORDS)}`;
  await c.expect(["ECHO", phrase], B(phrase));
});

stage(6, "Implement the SET & GET commands", async (ctx) => {
  const { c } = await setup(ctx);
  const [k, v] = [key(), pick(WORDS)];
  await c.expect(["SET", k, v], S("OK"));
  await c.expect(["GET", k], B(v));
  await c.expect(["SET", k, "outro"], S("OK"));
  await c.expect(["GET", k], B("outro"));
  await c.expect(["GET", key("faltando")], NB);
});

stage(7, "Expiry", async (ctx) => {
  const { c } = await setup(ctx);
  const [k, v] = [key(), pick(WORDS)];
  await c.expect(["SET", k, v, "PX", "150"], S("OK"));
  await c.expect(["GET", k], B(v));
  await delay(250);
  await c.expect(["GET", k], NB);
  const k2 = key();
  await c.expect(["SET", k2, v, "px", "5000"], S("OK"));
  await c.expect(["GET", k2], B(v));
});

// Lists ------------------------------------------------------------------------------

stage(8, "Create a list", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["RPUSH", key("lista"), pick(WORDS)], I(1));
});

stage(9, "Append an element", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("lista");
  await c.expect(["RPUSH", k, "a"], I(1));
  await c.expect(["RPUSH", k, "b"], I(2));
  await c.expect(["RPUSH", k, "c"], I(3));
});

stage(10, "Append multiple elements", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("lista");
  await c.expect(["RPUSH", k, ...shuffle(WORDS).slice(0, 3)], I(3));
  await c.expect(["RPUSH", k, "x", "y"], I(5));
});

async function filledList(c, n = 5) {
  const k = key("lista");
  const items = shuffle(WORDS).slice(0, n);
  await c.expect(["RPUSH", k, ...items], I(n));
  return { k, items };
}

stage(11, "List elements (positive indexes)", async (ctx) => {
  const { c } = await setup(ctx);
  const { k, items } = await filledList(c);
  await c.expect(["LRANGE", k, "0", "1"], BA(...items.slice(0, 2)));
  await c.expect(["LRANGE", k, "2", "4"], BA(...items.slice(2, 5)));
  await c.expect(["LRANGE", k, "1", "10"], BA(...items.slice(1)));
  await c.expect(["LRANGE", k, "3", "1"], A());
  await c.expect(["LRANGE", k, "7", "9"], A());
  await c.expect(["LRANGE", key("nada"), "0", "1"], A());
});

stage(12, "List elements (negative indexes)", async (ctx) => {
  const { c } = await setup(ctx);
  const { k, items } = await filledList(c);
  await c.expect(["LRANGE", k, "-2", "-1"], BA(...items.slice(3)));
  await c.expect(["LRANGE", k, "0", "-3"], BA(...items.slice(0, 3)));
  await c.expect(["LRANGE", k, "-10", "1"], BA(...items.slice(0, 2)));
  await c.expect(["LRANGE", k, "0", "-1"], BA(...items));
});

stage(13, "Prepend elements", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("lista");
  await c.expect(["LPUSH", k, "c"], I(1));
  await c.expect(["LPUSH", k, "a", "b"], I(3));
  await c.expect(["LRANGE", k, "0", "-1"], BA("b", "a", "c"));
});

stage(14, "Query list length", async (ctx) => {
  const { c } = await setup(ctx);
  const { k } = await filledList(c, 4);
  await c.expect(["LLEN", k], I(4));
  await c.expect(["LLEN", key("nada")], I(0));
});

stage(15, "Remove an element", async (ctx) => {
  const { c } = await setup(ctx);
  const { k, items } = await filledList(c, 3);
  await c.expect(["LPOP", k], B(items[0]));
  await c.expect(["LRANGE", k, "0", "-1"], BA(...items.slice(1)));
  await c.expect(["LPOP", key("nada")], NB);
});

stage(16, "Remove multiple elements", async (ctx) => {
  const { c } = await setup(ctx);
  const { k, items } = await filledList(c, 5);
  await c.expect(["LPOP", k, "2"], BA(...items.slice(0, 2)));
  await c.expect(["LPOP", k, "10"], BA(...items.slice(2)));
  await c.expect(["LLEN", k], I(0));
});

stage(17, "Blocking retrieval", async (ctx) => {
  const { server, c } = await setup(ctx);
  const k = key("fila");
  const c2 = await client(ctx, server.port, "cliente 2");
  const c3 = await client(ctx, server.port, "cliente 3");
  c2.send("BLPOP", k, "0");
  await delay(150);
  c3.send("BLPOP", k, "0");
  await delay(150);
  await c2.expectSilence(50, "BLPOP numa lista vazia deveria bloquear");
  await c.expect(["RPUSH", k, "primeiro"], I(1));
  const got = await c2.reply(3_000, "resposta do BLPOP");
  assert(matches(got, BA(k, "primeiro")), `o cliente que bloqueou primeiro deveria receber [${k}, primeiro]; recebeu ${show(got)}`);
  await c3.expectSilence(150, "o segundo cliente bloqueado não deveria receber nada ainda");
  await c.expect(["RPUSH", k, "segundo"], I(1));
  const got3 = await c3.reply(3_000, "resposta do BLPOP");
  assert(matches(got3, BA(k, "segundo")), `o segundo cliente deveria receber [${k}, segundo]; recebeu ${show(got3)}`);
});

stage(18, "Blocking retrieval with timeout", async (ctx) => {
  const { server, c } = await setup(ctx);
  const k = key("fila");
  const started = Date.now();
  await c.expect(["BLPOP", k, "0.2"], NA);
  const elapsed = Date.now() - started;
  assert(elapsed >= 150, `BLPOP com timeout 0.2 respondeu em ${elapsed} ms — deveria esperar ~200 ms`);
  const c2 = await client(ctx, server.port, "cliente 2");
  c2.send("BLPOP", k, "2");
  await delay(150);
  await c.expect(["RPUSH", k, "chegou"], I(1));
  const got = await c2.reply(3_000, "resposta do BLPOP");
  assert(matches(got, BA(k, "chegou")), `BLPOP com timeout deveria receber o elemento antes do prazo; recebeu ${show(got)}`);
});

// Streams ---------------------------------------------------------------------------

stage(19, "The TYPE command", async (ctx) => {
  const { c } = await setup(ctx);
  const [s, l] = [key("texto"), key("lista")];
  await c.expect(["SET", s, "x"], S("OK"));
  await c.expect(["RPUSH", l, "x"], I(1));
  await c.expect(["TYPE", s], S("string"));
  await c.expect(["TYPE", l], S("list"));
  await c.expect(["TYPE", key("nada")], S("none"));
});

stage(20, "Create a stream", async (ctx) => {
  const { c } = await setup(ctx);
  const s = key("stream");
  await c.expect(["XADD", s, "1-1", "temperatura", "21"], B("1-1"));
  await c.expect(["XADD", s, "1-2", "temperatura", "22", "umidade", "60"], B("1-2"));
  await c.expect(["TYPE", s], S("stream"));
});

stage(21, "Validating entry IDs", async (ctx) => {
  const { c } = await setup(ctx);
  const s = key("stream");
  await c.expect(["XADD", s, "1-1", "a", "1"], B("1-1"));
  await c.expect(["XADD", s, "1-2", "a", "2"], B("1-2"));
  const smaller = "ERR The ID specified in XADD is equal or smaller than the target stream top item";
  await c.expect(["XADD", s, "1-2", "a", "3"], E(smaller));
  await c.expect(["XADD", s, "0-3", "a", "3"], E(smaller));
  await c.expect(["XADD", s, "0-0", "a", "3"], E("ERR The ID specified in XADD must be greater than 0-0"));
});

stage(22, "Partially auto-generated IDs", async (ctx) => {
  const { c } = await setup(ctx);
  const s = key("stream");
  await c.expect(["XADD", s, "0-*", "a", "1"], B("0-1"));
  const ms = rand(5, 99);
  await c.expect(["XADD", s, `${ms}-*`, "a", "2"], B(`${ms}-0`));
  await c.expect(["XADD", s, `${ms}-*`, "a", "3"], B(`${ms}-1`));
  await c.expect(["XADD", key("outro"), `${ms}-*`, "a", "1"], B(`${ms}-0`));
});

stage(23, "Fully auto-generated IDs", async (ctx) => {
  const { c } = await setup(ctx);
  const s = key("stream");
  const before = Date.now();
  const reply = await c.call("XADD", s, "*", "a", "1");
  assert(reply.t === "$" && /^\d+-\d+$/.test(reply.v ?? ""), `XADD com * deveria devolver um ID "<ms>-<seq>"; recebeu ${show(reply)}`);
  const [ms, seq] = reply.v.split("-").map(Number);
  assert(Math.abs(ms - before) < 10_000, `o tempo do ID (${ms}) deveria ser o horário atual em ms (~${before})`);
  assert(seq === 0, `o primeiro ID gerado num milissegundo deveria ter sequência 0; veio ${reply.v}`);
});

async function filledStream(c, s = key("stream")) {
  const entries = [];
  for (const id of ["0-1", "0-2", "0-3", "1-0", "1-5"]) {
    const value = pick(WORDS);
    await c.expect(["XADD", s, id, "fruta", value], B(id));
    entries.push({ id, fields: ["fruta", value] });
  }
  return { s, entries };
}

const entriesReply = (entries) => A(...entries.map((e) => A(B(e.id), BA(...e.fields))));

stage(24, "Query entries from stream", async (ctx) => {
  const { c } = await setup(ctx);
  const { s, entries } = await filledStream(c);
  await c.expect(["XRANGE", s, "0-2", "0-3"], entriesReply(entries.slice(1, 3)));
  await c.expect(["XRANGE", s, "0-2", "1"], entriesReply(entries.slice(1)));
  await c.expect(["XRANGE", s, "1", "1"], entriesReply(entries.slice(3)));
});

stage(25, "Query with -", async (ctx) => {
  const { c } = await setup(ctx);
  const { s, entries } = await filledStream(c);
  await c.expect(["XRANGE", s, "-", "0-2"], entriesReply(entries.slice(0, 2)));
});

stage(26, "Query with +", async (ctx) => {
  const { c } = await setup(ctx);
  const { s, entries } = await filledStream(c);
  await c.expect(["XRANGE", s, "0-3", "+"], entriesReply(entries.slice(2)));
  await c.expect(["XRANGE", s, "-", "+"], entriesReply(entries));
});

stage(27, "Query single stream using XREAD", async (ctx) => {
  const { c } = await setup(ctx);
  const { s, entries } = await filledStream(c);
  await c.expect(["XREAD", "streams", s, "0-2"], A(A(B(s), entriesReply(entries.slice(2)))));
  await c.expect(["XREAD", "STREAMS", s, "0-0"], A(A(B(s), entriesReply(entries))));
});

stage(28, "Query multiple streams using XREAD", async (ctx) => {
  const { c } = await setup(ctx);
  const a = await filledStream(c, key("sensor-a"));
  const b = await filledStream(c, key("sensor-b"));
  await c.expect(["XREAD", "streams", a.s, b.s, "0-3", "0-1"], A(A(B(a.s), entriesReply(a.entries.slice(3))), A(B(b.s), entriesReply(b.entries.slice(1)))));
});

stage(29, "Blocking reads", async (ctx) => {
  const { server, c } = await setup(ctx);
  const { s } = await filledStream(c);
  const c2 = await client(ctx, server.port, "cliente 2");
  c2.send("XREAD", "block", "2000", "streams", s, "1-5");
  await delay(200);
  await c.expect(["XADD", s, "2-0", "fruta", "nova"], B("2-0"));
  const got = await c2.reply(3_000, "resposta do XREAD BLOCK");
  assert(matches(got, A(A(B(s), entriesReply([{ id: "2-0", fields: ["fruta", "nova"] }])))), `XREAD BLOCK deveria receber a entrada nova; recebeu ${show(got)}`);
  await c2.expect(["XREAD", "block", "200", "streams", s, "2-0"], NA);
});

stage(30, "Blocking reads without timeout", async (ctx) => {
  const { server, c } = await setup(ctx);
  const s = key("stream");
  await c.expect(["XADD", s, "0-1", "a", "1"], B("0-1"));
  const c2 = await client(ctx, server.port, "cliente 2");
  c2.send("XREAD", "block", "0", "streams", s, "0-1");
  await c2.expectSilence(600, "XREAD BLOCK 0 deveria esperar indefinidamente");
  await c.expect(["XADD", s, "0-2", "a", "2"], B("0-2"));
  const got = await c2.reply(3_000, "resposta do XREAD BLOCK 0");
  assert(matches(got, A(A(B(s), entriesReply([{ id: "0-2", fields: ["a", "2"] }])))), `XREAD BLOCK 0 deveria receber a entrada nova; recebeu ${show(got)}`);
});

stage(31, "Blocking reads using $", async (ctx) => {
  const { server, c } = await setup(ctx);
  const { s } = await filledStream(c);
  const c2 = await client(ctx, server.port, "cliente 2");
  c2.send("XREAD", "block", "0", "streams", s, "$");
  await delay(200);
  await c.expect(["XADD", s, "3-0", "fruta", "ultima"], B("3-0"));
  const got = await c2.reply(3_000, "resposta do XREAD BLOCK com $");
  assert(matches(got, A(A(B(s), entriesReply([{ id: "3-0", fields: ["fruta", "ultima"] }])))), `XREAD com $ deveria receber só a entrada nova; recebeu ${show(got)}`);
  await c2.expect(["XREAD", "block", "100", "streams", key("vazio"), "$"], NA);
});

// Transactions ----------------------------------------------------------------------

stage(32, "The INCR command (1/3)", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("contador");
  const n = rand(1, 99);
  await c.expect(["SET", k, String(n)], S("OK"));
  await c.expect(["INCR", k], I(n + 1));
  await c.expect(["INCR", k], I(n + 2));
  await c.expect(["GET", k], B(String(n + 2)));
});

stage(33, "The INCR command (2/3)", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("contador");
  await c.expect(["INCR", k], I(1));
  await c.expect(["INCR", k], I(2));
});

stage(34, "The INCR command (3/3)", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("texto");
  await c.expect(["SET", k, pick(WORDS)], S("OK"));
  await c.expect(["INCR", k], E("ERR value is not an integer or out of range"));
});

stage(35, "The MULTI command", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["MULTI"], S("OK"));
});

stage(36, "The EXEC command", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["EXEC"], E("ERR EXEC without MULTI"));
});

stage(37, "Empty transaction", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["EXEC"], A());
  await c.expect(["EXEC"], E("ERR EXEC without MULTI"));
});

stage(38, "Queueing commands", async (ctx) => {
  const { server, c } = await setup(ctx);
  const k = key("contador");
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "41"], S("QUEUED"));
  await c.expect(["INCR", k], S("QUEUED"));
  const c2 = await client(ctx, server.port, "cliente 2");
  await c2.expect(["GET", k], NB);
});

stage(39, "Executing a transaction", async (ctx) => {
  const { server, c } = await setup(ctx);
  const [k, other] = [key("contador"), key("texto")];
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "10"], S("QUEUED"));
  await c.expect(["INCR", k], S("QUEUED"));
  await c.expect(["INCR", k], S("QUEUED"));
  await c.expect(["SET", other, "ok"], S("QUEUED"));
  await c.expect(["GET", k], S("QUEUED"));
  await c.expect(["EXEC"], A(S("OK"), I(11), I(12), S("OK"), B("12")));
  const c2 = await client(ctx, server.port, "cliente 2");
  await c2.expect(["GET", k], B("12"));
});

stage(40, "The DISCARD command", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key();
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "x"], S("QUEUED"));
  await c.expect(["DISCARD"], S("OK"));
  await c.expect(["GET", k], NB);
  await c.expect(["DISCARD"], E("ERR DISCARD without MULTI"));
  await c.expect(["EXEC"], E("ERR EXEC without MULTI"));
});

stage(41, "Failures within transactions", async (ctx) => {
  const { c } = await setup(ctx);
  const [a, b] = [key("texto"), key("numero")];
  await c.expect(["SET", a, pick(WORDS)], S("OK"));
  await c.expect(["SET", b, "7"], S("OK"));
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["INCR", a], S("QUEUED"));
  await c.expect(["INCR", b], S("QUEUED"));
  await c.expect(["EXEC"], A(E("ERR value is not an integer or out of range"), I(8)));
  await c.expect(["GET", b], B("8"));
});

stage(42, "Multiple transactions", async (ctx) => {
  const { server, c } = await setup(ctx);
  const c2 = await client(ctx, server.port, "cliente 2");
  const k = key("contador");
  await c.expect(["MULTI"], S("OK"));
  await c2.expect(["MULTI"], S("OK"));
  await c.expect(["INCR", k], S("QUEUED"));
  await c2.expect(["INCR", k], S("QUEUED"));
  await c2.expect(["INCR", k], S("QUEUED"));
  await c.expect(["EXEC"], A(I(1)));
  await c2.expect(["EXEC"], A(I(2), I(3)));
});

// Optimistic Locking ---------------------------------------------------------------------

stage(43, "The WATCH command", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["WATCH", key()], S("OK"));
});

stage(44, "WATCH inside transaction", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["WATCH", key()], E("ERR WATCH inside MULTI is not allowed"));
});

async function watchScenario(ctx, { watchKeys, modify, before = async () => {} }) {
  const { server, c } = await setup(ctx);
  const c2 = await client(ctx, server.port, "cliente 2");
  await before(c);
  await c.expect(["WATCH", ...watchKeys], S("OK"));
  if (modify) await modify(c2);
  return { c, c2 };
}

stage(45, "Tracking key modifications", async (ctx) => {
  const k = key("saldo");
  const { c } = await watchScenario(ctx, {
    watchKeys: [k],
    before: (c) => c.expect(["SET", k, "100"], S("OK")),
    modify: (c2) => c2.expect(["SET", k, "50"], S("OK")),
  });
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "200"], S("QUEUED"));
  await c.expect(["EXEC"], NA);
  await c.expect(["GET", k], B("50"));
  await c.expect(["WATCH", k], S("OK"));
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["INCR", k], S("QUEUED"));
  await c.expect(["EXEC"], A(I(51)));
});

stage(46, "Watching multiple keys", async (ctx) => {
  const [a, b] = [key("a"), key("b")];
  const { c } = await watchScenario(ctx, {
    watchKeys: [a, b],
    before: async (c) => {
      await c.expect(["SET", a, "1"], S("OK"));
      await c.expect(["SET", b, "2"], S("OK"));
    },
    modify: (c2) => c2.expect(["INCR", b], I(3)),
  });
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", a, "x"], S("QUEUED"));
  await c.expect(["EXEC"], NA);
  await c.expect(["GET", a], B("1"));
});

stage(47, "Watching missing keys", async (ctx) => {
  const k = key("novo");
  const { c } = await watchScenario(ctx, { watchKeys: [k], modify: (c2) => c2.expect(["SET", k, "criado"], S("OK")) });
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "meu"], S("QUEUED"));
  await c.expect(["EXEC"], NA);
  await c.expect(["GET", k], B("criado"));
});

stage(48, "The UNWATCH command", async (ctx) => {
  const k = key();
  const { c } = await watchScenario(ctx, { watchKeys: [k], modify: (c2) => c2.expect(["SET", k, "outro"], S("OK")) });
  await c.expect(["UNWATCH"], S("OK"));
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "meu"], S("QUEUED"));
  await c.expect(["EXEC"], A(S("OK")));
  await c.expect(["GET", k], B("meu"));
});

stage(49, "Unwatch on EXEC", async (ctx) => {
  const k = key();
  const { c, c2 } = await watchScenario(ctx, { watchKeys: [k] });
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "1"], S("QUEUED"));
  await c.expect(["EXEC"], A(S("OK")));
  await c2.expect(["SET", k, "2"], S("OK"));
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "3"], S("QUEUED"));
  await c.expect(["EXEC"], A(S("OK")));
});

stage(50, "Unwatch on DISCARD", async (ctx) => {
  const k = key();
  const { c, c2 } = await watchScenario(ctx, { watchKeys: [k] });
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["DISCARD"], S("OK"));
  await c2.expect(["SET", k, "2"], S("OK"));
  await c.expect(["MULTI"], S("OK"));
  await c.expect(["SET", k, "3"], S("QUEUED"));
  await c.expect(["EXEC"], A(S("OK")));
});

// Replication ------------------------------------------------------------------------------

stage(51, "Configure listening port", async (ctx) => {
  const a = await startServer(ctx);
  const b = await startServer(ctx);
  await (await client(ctx, a.port, `cliente :${a.port}`)).expect(["PING"], S("PONG"));
  await (await client(ctx, b.port, `cliente :${b.port}`)).expect(["PING"], S("PONG"));
});

function infoField(reply, field) {
  assert(reply.t === "$" && reply.v, `INFO replication deveria devolver uma bulk string; recebeu ${show(reply)}`);
  const line = reply.v.split(/\r?\n/).find((l) => l.startsWith(`${field}:`));
  assert(line, `INFO replication deveria ter a linha "${field}:..."; recebeu ${JSON.stringify(reply.v)}`);
  return line.slice(field.length + 1);
}

stage(52, "The INFO command", async (ctx) => {
  const { c } = await setup(ctx);
  const role = infoField(await c.call("INFO", "replication"), "role");
  assert(role === "master", `role deveria ser "master"; veio ${JSON.stringify(role)}`);
});

stage(53, "The INFO command on a replica", async (ctx) => {
  const master = await fakeMaster(ctx);
  const replica = await startServer(ctx, ["--replicaof", `localhost ${master.port}`]);
  await acceptReplica(master);
  const c = await client(ctx, replica.port);
  const role = infoField(await c.call("INFO", "replication"), "role");
  assert(role === "slave", `numa réplica, role deveria ser "slave"; veio ${JSON.stringify(role)}`);
});

stage(54, "Initial replication ID and offset", async (ctx) => {
  const { c } = await setup(ctx);
  const info = await c.call("INFO", "replication");
  const id = infoField(info, "master_replid");
  assert(/^[0-9a-zA-Z]{40}$/.test(id), `master_replid deveria ter 40 caracteres alfanuméricos; veio ${JSON.stringify(id)}`);
  const offset = infoField(info, "master_repl_offset");
  assert(offset === "0", `master_repl_offset deveria começar em 0; veio ${JSON.stringify(offset)}`);
});

stage(55, "Send handshake (1/3)", async (ctx) => {
  const master = await fakeMaster(ctx);
  await startServer(ctx, ["--replicaof", `localhost ${master.port}`]);
  const m = await master.accept();
  const args = await readCommand(m, "PING");
  assert(args.length === 1 && args[0].toUpperCase() === "PING", `a réplica deveria começar o handshake com PING; mandou ${describe(args)}`);
});

stage(56, "Send handshake (2/3)", async (ctx) => {
  const master = await fakeMaster(ctx);
  const replica = await startServer(ctx, ["--replicaof", `localhost ${master.port}`]);
  const m = await master.accept();
  await readCommand(m, "PING");
  m.write(Buffer.from("+PONG\r\n"));
  let args = await readCommand(m, "REPLCONF listening-port <porta>");
  assert(args.join(" ") === `REPLCONF listening-port ${replica.port}`, `esperava REPLCONF listening-port ${replica.port}; veio ${describe(args)}`);
  m.write(Buffer.from("+OK\r\n"));
  args = await readCommand(m, "REPLCONF capa psync2");
  assert(args.join(" ") === "REPLCONF capa psync2", `esperava REPLCONF capa psync2; veio ${describe(args)}`);
});

stage(57, "Send handshake (3/3)", async (ctx) => {
  const master = await fakeMaster(ctx);
  const replica = await startServer(ctx, ["--replicaof", `localhost ${master.port}`]);
  await acceptReplica(master, { replicaPort: replica.port });
});

stage(58, "Receive handshake (1/2)", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["PING"], S("PONG"));
  await c.expect(["REPLCONF", "listening-port", "6380"], S("OK"));
  await c.expect(["REPLCONF", "capa", "psync2"], S("OK"));
});

stage(59, "Receive handshake (2/2)", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["REPLCONF", "listening-port", "6380"], S("OK"));
  await c.expect(["REPLCONF", "capa", "psync2"], S("OK"));
  c.send("PSYNC", "?", "-1");
  const line = await c.readLine(3_000, "+FULLRESYNC");
  assert(/^\+FULLRESYNC [0-9a-zA-Z]{40} 0$/.test(line), `PSYNC ? -1 deveria responder "+FULLRESYNC <replid> 0"; veio ${JSON.stringify(line)}`);
});

stage(60, "Empty RDB transfer", async (ctx) => {
  const server = await startServer(ctx);
  const { r, rdb } = await fakeReplica(ctx, server.port);
  assert(rdb.subarray(0, 5).toString("latin1") === "REDIS", `o RDB enviado deveria começar com "REDIS"; começa com ${JSON.stringify(rdb.subarray(0, 9).toString("latin1"))}`);
  await r.expectSilence(200, "depois do RDB não deveria vir nada (nem um \\r\\n: o RDB não termina com CRLF)");
});

stage(61, "Single-replica propagation", async (ctx) => {
  const server = await startServer(ctx);
  const { r } = await fakeReplica(ctx, server.port);
  const c = await client(ctx, server.port);
  const sets = Array.from({ length: 3 }, () => [key(), pick(WORDS)]);
  for (const [k, v] of sets) await c.expect(["SET", k, v], S("OK"));
  await c.expect(["GET", sets[0][0]], B(sets[0][1]));
  for (const [k, v] of sets) {
    const { args } = await readPropagated(r);
    assert(args.join(" ") === `SET ${k} ${v}`, `a réplica deveria receber SET ${k} ${v}; recebeu ${describe(args)}`);
  }
  await r.expectSilence(200, "comandos de leitura (GET) não devem ser propagados");
});

stage(62, "Multi-replica propagation", async (ctx) => {
  const server = await startServer(ctx);
  const replicas = [];
  for (let i = 1; i <= 3; i++) replicas.push((await fakeReplica(ctx, server.port, `réplica ${i}`)).r);
  const c = await client(ctx, server.port);
  const [k, v] = [key(), pick(WORDS)];
  await c.expect(["SET", k, v], S("OK"));
  await c.expect(["INCR", `${k}:n`], I(1));
  for (const r of replicas) {
    let { args } = await readPropagated(r);
    assert(args.join(" ") === `SET ${k} ${v}`, `${r.name} deveria receber SET ${k} ${v}; recebeu ${describe(args)}`);
    ({ args } = await readPropagated(r));
    assert(args.join(" ") === `INCR ${k}:n`, `${r.name} deveria receber INCR ${k}:n; recebeu ${describe(args)}`);
  }
});

stage(63, "Command processing", async (ctx) => {
  const master = await fakeMaster(ctx);
  const replica = await startServer(ctx, ["--replicaof", `localhost ${master.port}`]);
  const m = await acceptReplica(master);
  const sets = Array.from({ length: 3 }, () => [key(), pick(WORDS)]);
  m.write(Buffer.concat(sets.map(([k, v]) => encode(["SET", k, v]))));
  await m.expectSilence(300, "a réplica não deve responder aos comandos propagados pelo master");
  const c = await client(ctx, replica.port);
  for (const [k, v] of sets) await c.expect(["GET", k], B(v));
});

stage(64, "ACKs with no commands", async (ctx) => {
  const master = await fakeMaster(ctx);
  await startServer(ctx, ["--replicaof", `localhost ${master.port}`]);
  const m = await acceptReplica(master);
  m.write(encode(["REPLCONF", "GETACK", "*"]));
  const args = await readCommand(m, "REPLCONF ACK 0");
  assert(args.join(" ") === "REPLCONF ACK 0", `esperava REPLCONF ACK 0; veio ${describe(args)}`);
});

stage(65, "ACKs with commands", async (ctx) => {
  const master = await fakeMaster(ctx);
  await startServer(ctx, ["--replicaof", `localhost ${master.port}`]);
  const m = await acceptReplica(master);
  const getAck = encode(["REPLCONF", "GETACK", "*"]);
  m.write(getAck);
  let args = await readCommand(m, "REPLCONF ACK 0");
  assert(args.join(" ") === "REPLCONF ACK 0", `primeiro GETACK: esperava REPLCONF ACK 0; veio ${describe(args)}`);
  let offset = getAck.length;
  const batch = [encode(["PING"]), encode(["SET", key(), pick(WORDS)]), encode(["SET", key(), pick(WORDS)])];
  m.write(Buffer.concat(batch));
  offset += batch.reduce((n, b) => n + b.length, 0);
  m.write(getAck);
  args = await readCommand(m, `REPLCONF ACK ${offset}`);
  assert(args.join(" ") === `REPLCONF ACK ${offset}`, `esperava REPLCONF ACK ${offset} (bytes processados antes deste GETACK); veio ${describe(args)}`);
});

stage(66, "WAIT with no replicas", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["WAIT", "0", "60000"], I(0));
  await c.expect(["WAIT", "2", "200"], I(0));
});

stage(67, "WAIT with no commands", async (ctx) => {
  const server = await startServer(ctx);
  const n = rand(2, 4);
  for (let i = 1; i <= n; i++) await fakeReplica(ctx, server.port, `réplica ${i}`);
  const c = await client(ctx, server.port);
  const started = Date.now();
  await c.expect(["WAIT", String(n), "5000"], I(n));
  assert(Date.now() - started < 2_000, "sem comandos propagados, WAIT deveria responder imediatamente");
});

stage(68, "WAIT with multiple commands", async (ctx) => {
  const server = await startServer(ctx);
  const replicas = [];
  for (let i = 1; i <= 3; i++) replicas.push((await fakeReplica(ctx, server.port, `réplica ${i}`)).r);
  const c = await client(ctx, server.port);
  await c.expect(["SET", key(), pick(WORDS)], S("OK"));
  await c.expect(["SET", key(), pick(WORDS)], S("OK"));
  // cada réplica lê os comandos; só as duas primeiras respondem ao GETACK
  const answer = async (r, respond) => {
    let total = 0;
    for (;;) {
      const { args, bytes } = await readPropagated(r, 5_000);
      if (args[0].toUpperCase() === "REPLCONF" && args[1]?.toUpperCase() === "GETACK") {
        if (respond) r.send("REPLCONF", "ACK", String(total));
        return;
      }
      total += bytes;
    }
  };
  c.send("WAIT", "3", "600");
  const started = Date.now();
  await Promise.all(replicas.map((r, i) => answer(r, i < 2)));
  const got = await c.reply(3_000, "resposta do WAIT");
  assert(matches(got, I(2)), `WAIT 3 600 com 2 de 3 réplicas confirmando deveria devolver :2; recebeu ${show(got)}`);
  assert(Date.now() - started >= 450, "WAIT deveria esperar o timeout quando nem todas as réplicas confirmam");
});

// RDB Persistence ----------------------------------------------------------------------------

async function rdbServer(ctx, entries) {
  const dir = await fs.mkdtemp(path.join(ctx.tmp, "rdb-"));
  const file = `dump-${token()}.rdb`;
  await fs.writeFile(path.join(dir, file), buildRdb(entries));
  const server = await startServer(ctx, ["--dir", dir, "--dbfilename", file]);
  return { dir, file, c: await client(ctx, server.port) };
}

stage(69, "RDB file config", async (ctx) => {
  const dir = await fs.mkdtemp(path.join(ctx.tmp, "rdb-"));
  const file = `${pick(WORDS)}.rdb`;
  const server = await startServer(ctx, ["--dir", dir, "--dbfilename", file]);
  const c = await client(ctx, server.port);
  await c.expect(["CONFIG", "GET", "dir"], BA("dir", dir));
  await c.expect(["CONFIG", "GET", "dbfilename"], BA("dbfilename", file));
});

stage(70, "Read a key", async (ctx) => {
  const k = key();
  const { c } = await rdbServer(ctx, [{ key: k, value: pick(WORDS) }]);
  await c.expect(["KEYS", "*"], BA(k));
});

stage(71, "Read a string value", async (ctx) => {
  const [k, v] = [key(), pick(WORDS)];
  const { c } = await rdbServer(ctx, [{ key: k, value: v }]);
  await c.expect(["GET", k], B(v));
});

stage(72, "Read multiple keys", async (ctx) => {
  const entries = Array.from({ length: 4 }, () => ({ key: key(), value: pick(WORDS) }));
  const { c } = await rdbServer(ctx, entries);
  const reply = await c.call("KEYS", "*");
  assert(reply.t === "*" && reply.v, `KEYS * deveria devolver um array; recebeu ${show(reply)}`);
  const got = reply.v.map((item) => item.v).sort();
  const want = entries.map((e) => e.key).sort();
  assert(JSON.stringify(got) === JSON.stringify(want), `KEYS * (em qualquer ordem) deveria ser ${JSON.stringify(want)}; recebeu ${JSON.stringify(got)}`);
});

stage(73, "Read multiple string values", async (ctx) => {
  const entries = Array.from({ length: 4 }, () => ({ key: key(), value: `${pick(WORDS)} ${rand(1, 999)}` }));
  const { c } = await rdbServer(ctx, entries);
  for (const entry of shuffle(entries)) await c.expect(["GET", entry.key], B(entry.value));
});

stage(74, "Read value with expiry", async (ctx) => {
  const now = Date.now();
  const entries = [
    { key: key("vivo-ms"), value: "a", expiresMs: now + 3_600_000 },
    { key: key("morto-ms"), value: "b", expiresMs: now - 60_000 },
    { key: key("vivo-s"), value: "c", expiresSec: Math.floor(now / 1000) + 3_600 },
    { key: key("morto-s"), value: "d", expiresSec: Math.floor(now / 1000) - 60 },
    { key: key("sem"), value: "e" },
  ];
  const { c } = await rdbServer(ctx, entries);
  for (const entry of entries) await c.expect(["GET", entry.key], entry.key.startsWith("morto") ? NB : B(entry.value));
});

// AOF Persistence ----------------------------------------------------------------------------

async function aofServer(ctx, extra = [], prepare) {
  const dir = await fs.mkdtemp(path.join(ctx.tmp, "aof-"));
  if (prepare) await prepare(dir);
  const server = await startServer(ctx, ["--dir", dir, ...extra]);
  return { dir, server, c: await client(ctx, server.port) };
}

const incrPath = (dir, dirname = "appendonlydir", filename = "appendonly.aof") => path.join(dir, dirname, `${filename}.1.incr.aof`);

async function waitForFile(file, expected, label) {
  const deadline = Date.now() + 3_000;
  let content = null;
  while (Date.now() < deadline) {
    content = await fs.readFile(file, "latin1").catch(() => null);
    if (content === expected) return;
    await delay(50);
  }
  assert(content !== null, `${label}: o arquivo ${path.basename(file)} não existe`);
  throw new Error(`${label}: ${path.basename(file)} contém ${JSON.stringify(content)}, esperava ${JSON.stringify(expected)}`);
}

stage(75, "Default AOF options", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["CONFIG", "GET", "appendonly"], BA("appendonly", "no"));
  await c.expect(["CONFIG", "GET", "appenddirname"], BA("appenddirname", "appendonlydir"));
  await c.expect(["CONFIG", "GET", "appendfilename"], BA("appendfilename", "appendonly.aof"));
  await c.expect(["CONFIG", "GET", "appendfsync"], BA("appendfsync", "everysec"));
});

stage(76, "AOF options from flags", async (ctx) => {
  const [dirname, filename] = [`aof-${token()}`, `${pick(WORDS)}.aof`];
  const { c } = await aofServer(ctx, ["--appendonly", "yes", "--appenddirname", dirname, "--appendfilename", filename, "--appendfsync", "always"]);
  await c.expect(["CONFIG", "GET", "appendonly"], BA("appendonly", "yes"));
  await c.expect(["CONFIG", "GET", "appenddirname"], BA("appenddirname", dirname));
  await c.expect(["CONFIG", "GET", "appendfilename"], BA("appendfilename", filename));
  await c.expect(["CONFIG", "GET", "appendfsync"], BA("appendfsync", "always"));
});

stage(77, "Create append-only directory", async (ctx) => {
  const dirname = `aof-${token()}`;
  const { dir } = await aofServer(ctx, ["--appendonly", "yes", "--appenddirname", dirname]);
  const stat = await fs.stat(path.join(dir, dirname)).catch(() => null);
  assert(stat?.isDirectory(), `com --appendonly yes o diretório ${dirname} deveria ser criado dentro de --dir`);
  const { dir: dir2 } = await aofServer(ctx, []);
  assert(!existsSync(path.join(dir2, "appendonlydir")), "sem --appendonly yes nenhum diretório de AOF deve ser criado");
});

stage(78, "Create append-only file", async (ctx) => {
  const filename = `${pick(WORDS)}.aof`;
  const { dir } = await aofServer(ctx, ["--appendonly", "yes", "--appendfilename", filename]);
  const file = incrPath(dir, "appendonlydir", filename);
  await waitForFile(file, "", "arquivo incremental recém-criado");
});

stage(79, "Create manifest file", async (ctx) => {
  const filename = `${pick(WORDS)}.aof`;
  const { dir } = await aofServer(ctx, ["--appendonly", "yes", "--appendfilename", filename]);
  await waitForFile(path.join(dir, "appendonlydir", `${filename}.manifest`), `file ${filename}.1.incr.aof seq 1 type i\n`, "manifesto");
});

stage(80, "Write a single command", async (ctx) => {
  const { dir, c } = await aofServer(ctx, ["--appendonly", "yes"]);
  const [k, v] = [key(), pick(WORDS)];
  await c.expect(["SET", k, v], S("OK"));
  await waitForFile(incrPath(dir), encode(["SET", k, v]).toString("latin1"), "depois de um SET");
});

stage(81, "Write multiple commands", async (ctx) => {
  const { dir, c } = await aofServer(ctx, ["--appendonly", "yes"]);
  const commands = [["SET", key(), pick(WORDS)], ["RPUSH", key("lista"), "a", "b"], ["INCR", key("n")]];
  for (const command of commands) await c.call(...command);
  await waitForFile(incrPath(dir), commands.map((cmd) => encode(cmd).toString("latin1")).join(""), "depois de três comandos de escrita");
});

stage(82, "Filter write commands", async (ctx) => {
  const { dir, c } = await aofServer(ctx, ["--appendonly", "yes"]);
  const [k, v] = [key(), pick(WORDS)];
  await c.call("PING");
  await c.call("SET", k, v);
  await c.call("GET", k);
  await c.call("ECHO", "oi");
  await c.call("INCR", `${k}:n`);
  await c.call("TYPE", k);
  await waitForFile(incrPath(dir), encode(["SET", k, v]).toString("latin1") + encode(["INCR", `${k}:n`]).toString("latin1"), "só comandos de escrita");
});

async function prepareAof(dir, commands) {
  await fs.mkdir(path.join(dir, "appendonlydir"), { recursive: true });
  await fs.writeFile(path.join(dir, "appendonlydir", "appendonly.aof.manifest"), "file appendonly.aof.1.incr.aof seq 1 type i\n");
  await fs.writeFile(incrPath(dir), Buffer.concat(commands.map(encode)));
}

stage(83, "Replay a single command", async (ctx) => {
  const [k, v] = [key(), pick(WORDS)];
  const { c } = await aofServer(ctx, ["--appendonly", "yes"], (dir) => prepareAof(dir, [["SET", k, v]]));
  await c.expect(["GET", k], B(v));
});

stage(84, "Replay multiple commands", async (ctx) => {
  const [k, l, n] = [key(), key("lista"), key("n")];
  const { dir, c } = await aofServer(ctx, ["--appendonly", "yes"], (dir) =>
    prepareAof(dir, [["SET", k, "um"], ["RPUSH", l, "a", "b"], ["SET", k, "dois"], ["INCR", n], ["INCR", n], ["LPUSH", l, "z"]])
  );
  await c.expect(["GET", k], B("dois"));
  await c.expect(["LRANGE", l, "0", "-1"], BA("z", "a", "b"));
  await c.expect(["GET", n], B("2"));
  await c.expect(["INCR", n], I(3));
  const content = await fs.readFile(incrPath(dir), "latin1");
  assert(content.endsWith(encode(["INCR", n]).toString("latin1")), "comandos novos devem continuar sendo acrescentados ao mesmo arquivo incremental");
});

// Pub/Sub --------------------------------------------------------------------------------------

stage(85, "Subscribe to a channel", async (ctx) => {
  const { c } = await setup(ctx);
  const ch = key("canal");
  await c.expect(["SUBSCRIBE", ch], A(B("subscribe"), B(ch), I(1)));
});

stage(86, "Subscribe to multiple channels", async (ctx) => {
  const { c } = await setup(ctx);
  const [a, b, d] = [key("canal"), key("canal"), key("canal")];
  c.send("SUBSCRIBE", a, b);
  for (const [ch, n] of [[a, 1], [b, 2]]) {
    const got = await c.reply();
    assert(matches(got, A(B("subscribe"), B(ch), I(n))), `SUBSCRIBE ${a} ${b}: esperava [subscribe, ${ch}, ${n}]; recebeu ${show(got)}`);
  }
  await c.expect(["SUBSCRIBE", d], A(B("subscribe"), B(d), I(3)));
  await c.expect(["SUBSCRIBE", a], A(B("subscribe"), B(a), I(3)));
});

stage(87, "Enter subscribed mode", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["SUBSCRIBE", key("canal")], A(B("subscribe"), { t: "$", v: undefined }, I(1))).catch(() => {});
  const ch = key("canal");
  await c.expect(["SUBSCRIBE", ch], A(B("subscribe"), B(ch), I(2)));
  await c.expect(["SET", "k", "v"], E("ERR Can't execute 'set'"));
  await c.expect(["GET", "k"], E("ERR Can't execute 'get'"));
});

stage(88, "PING in subscribed mode", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["PING"], S("PONG"));
  const ch = key("canal");
  await c.expect(["SUBSCRIBE", ch], A(B("subscribe"), B(ch), I(1)));
  await c.expect(["PING"], A(B("pong"), B("")));
});

stage(89, "Publish a message", async (ctx) => {
  const { server, c } = await setup(ctx);
  const ch = key("canal");
  await c.expect(["PUBLISH", ch, "ola"], I(0));
  for (let i = 1; i <= 2; i++) {
    const sub = await client(ctx, server.port, `assinante ${i}`);
    await sub.expect(["SUBSCRIBE", ch], A(B("subscribe"), B(ch), I(1)));
  }
  await c.expect(["PUBLISH", ch, "ola"], I(2));
});

stage(90, "Deliver messages", async (ctx) => {
  const { server, c } = await setup(ctx);
  const [ch, other] = [key("canal"), key("outro")];
  const subs = [];
  for (let i = 1; i <= 2; i++) {
    const sub = await client(ctx, server.port, `assinante ${i}`);
    await sub.expect(["SUBSCRIBE", ch], A(B("subscribe"), B(ch), I(1)));
    subs.push(sub);
  }
  const lonely = await client(ctx, server.port, "assinante de outro canal");
  await lonely.expect(["SUBSCRIBE", other], A(B("subscribe"), B(other), I(1)));
  const msg = `${pick(WORDS)} ${rand(1, 99)}`;
  await c.expect(["PUBLISH", ch, msg], I(2));
  for (const sub of subs) {
    const got = await sub.reply(3_000, "mensagem publicada");
    assert(matches(got, A(B("message"), B(ch), B(msg))), `${sub.name}: esperava [message, ${ch}, ${msg}]; recebeu ${show(got)}`);
  }
  await lonely.expectSilence(200, "quem assina outro canal não deveria receber a mensagem");
});

stage(91, "Unsubscribe", async (ctx) => {
  const { server, c } = await setup(ctx);
  const [a, b] = [key("canal"), key("canal")];
  const sub = await client(ctx, server.port, "assinante");
  sub.send("SUBSCRIBE", a, b);
  await sub.reply();
  await sub.reply();
  await sub.expect(["UNSUBSCRIBE", a], A(B("unsubscribe"), B(a), I(1)));
  await c.expect(["PUBLISH", a, "x"], I(0));
  await c.expect(["PUBLISH", b, "y"], I(1));
  const got = await sub.reply(3_000, "mensagem do canal ainda assinado");
  assert(matches(got, A(B("message"), B(b), B("y"))), `esperava [message, ${b}, y]; recebeu ${show(got)}`);
  await sub.expect(["UNSUBSCRIBE", b], A(B("unsubscribe"), B(b), I(0)));
});

// Sorted Sets --------------------------------------------------------------------------------------

async function filledZset(c) {
  const z = key("ranking");
  const members = shuffle(WORDS).slice(0, 5).map((name, i) => ({ name, score: [10, 20, 20, 35.5, 50][i] }));
  for (const m of shuffle(members)) await c.expect(["ZADD", z, String(m.score), m.name], I(1));
  const ordered = [...members].sort((a, b) => a.score - b.score || (a.name < b.name ? -1 : 1));
  return { z, members, ordered };
}

stage(92, "Create a sorted set", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["ZADD", key("ranking"), "10", pick(WORDS)], I(1));
});

stage(93, "Add members", async (ctx) => {
  const { c } = await setup(ctx);
  const z = key("ranking");
  await c.expect(["ZADD", z, "1", "a"], I(1));
  await c.expect(["ZADD", z, "2", "b", "3", "c"], I(2));
  await c.expect(["ZADD", z, "5", "a"], I(0));
  await c.expect(["TYPE", z], S("zset"));
});

stage(94, "Retrieve member rank", async (ctx) => {
  const { c } = await setup(ctx);
  const { z, ordered } = await filledZset(c);
  for (const [i, m] of shuffle([...ordered.entries()])) await c.expect(["ZRANK", z, m.name], I(i));
  await c.expect(["ZRANK", z, "ninguem"], NB);
  await c.expect(["ZRANK", key("nada"), "x"], NB);
});

stage(95, "List sorted set members", async (ctx) => {
  const { c } = await setup(ctx);
  const { z, ordered } = await filledZset(c);
  const names = ordered.map((m) => m.name);
  await c.expect(["ZRANGE", z, "0", "2"], BA(...names.slice(0, 3)));
  await c.expect(["ZRANGE", z, "1", "10"], BA(...names.slice(1)));
  await c.expect(["ZRANGE", z, "3", "1"], A());
  await c.expect(["ZRANGE", key("nada"), "0", "1"], A());
});

stage(96, "ZRANGE with negative indexes", async (ctx) => {
  const { c } = await setup(ctx);
  const { z, ordered } = await filledZset(c);
  const names = ordered.map((m) => m.name);
  await c.expect(["ZRANGE", z, "-2", "-1"], BA(...names.slice(3)));
  await c.expect(["ZRANGE", z, "0", "-1"], BA(...names));
  await c.expect(["ZRANGE", z, "-10", "1"], BA(...names.slice(0, 2)));
});

stage(97, "Count sorted set members", async (ctx) => {
  const { c } = await setup(ctx);
  const { z, members } = await filledZset(c);
  await c.expect(["ZCARD", z], I(members.length));
  await c.expect(["ZCARD", key("nada")], I(0));
});

stage(98, "Retrieve member score", async (ctx) => {
  const { c } = await setup(ctx);
  const { z, members } = await filledZset(c);
  for (const m of members) {
    const got = await c.call("ZSCORE", z, m.name);
    assert(got.t === "$" && got.v !== null && Number(got.v) === m.score, `ZSCORE ${z} ${m.name} deveria valer ${m.score}; recebeu ${show(got)}`);
  }
  await c.expect(["ZSCORE", z, "ninguem"], NB);
});

stage(99, "Remove a member", async (ctx) => {
  const { c } = await setup(ctx);
  const { z, ordered } = await filledZset(c);
  await c.expect(["ZREM", z, ordered[1].name], I(1));
  await c.expect(["ZREM", z, "ninguem"], I(0));
  await c.expect(["ZCARD", z], I(ordered.length - 1));
  await c.expect(["ZRANGE", z, "0", "-1"], BA(...ordered.filter((_, i) => i !== 1).map((m) => m.name)));
});

// Bitmaps -----------------------------------------------------------------------------------------

const bytes = (reply) => Buffer.from(reply.v, "latin1");

stage(100, "Create a bitmap", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("bits");
  await c.expect(["SETBIT", k, "7", "1"], I(0));
  await c.expect(["SETBIT", k, "7", "1"], I(1));
  await c.expect(["SETBIT", k, "7", "0"], I(1));
  await c.expect(["TYPE", k], S("string"));
});

stage(101, "Retrieve a bit", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("bits");
  const offsets = shuffle([0, 3, 9, 14, 22]).slice(0, 3);
  for (const o of offsets) await c.expect(["SETBIT", k, String(o), "1"], I(0));
  for (let o = 0; o < 24; o++) await c.expect(["GETBIT", k, String(o)], I(offsets.includes(o) ? 1 : 0));
  await c.expect(["GETBIT", k, "1000"], I(0));
  await c.expect(["GETBIT", key("nada"), "3"], I(0));
});

stage(102, "Read a string as bits", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("texto");
  const word = pick(["Ok", "Hi", "Az", "pw"]);
  await c.expect(["SET", k, word], S("OK"));
  const buf = Buffer.from(word, "latin1");
  for (let o = 0; o < buf.length * 8; o++) {
    await c.expect(["GETBIT", k, String(o)], I((buf[o >> 3] >> (7 - (o & 7))) & 1));
  }
});

stage(103, "Read bits as a string", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("bits");
  const letter = pick(["A", "K", "Z", "w"]);
  const code = letter.charCodeAt(0);
  for (let o = 0; o < 8; o++) if ((code >> (7 - o)) & 1) await c.call("SETBIT", k, String(o), "1");
  await c.expect(["GET", k], B(letter));
});

stage(104, "Grow a bitmap", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("bits");
  await c.expect(["SETBIT", k, "3", "1"], I(0));
  const offset = rand(60, 120);
  await c.expect(["SETBIT", k, String(offset), "1"], I(0));
  const got = await c.call("GET", k);
  const buf = bytes(got);
  assert(buf.length === Math.floor(offset / 8) + 1, `depois de SETBIT ${offset}, o valor deveria ter ${Math.floor(offset / 8) + 1} bytes; tem ${buf.length}`);
  const expected = Buffer.alloc(buf.length);
  expected[0] = 0x10;
  expected[offset >> 3] |= 1 << (7 - (offset & 7));
  assert(buf.equals(expected), `bytes esperados ${expected.toString("hex")}, recebeu ${buf.toString("hex")}`);
});

stage(105, "Count set bits", async (ctx) => {
  const { c } = await setup(ctx);
  const k = key("texto");
  const text = `${pick(WORDS)}${rand(10, 99)}`;
  await c.expect(["SET", k, text], S("OK"));
  const buf = Buffer.from(text, "latin1");
  const popcount = (b) => [...b].reduce((n, byte) => n + byte.toString(2).split("1").length - 1, 0);
  await c.expect(["BITCOUNT", k], I(popcount(buf)));
  await c.expect(["BITCOUNT", k, "1", "2"], I(popcount(buf.subarray(1, 3))));
  await c.expect(["BITCOUNT", k, "-2", "-1"], I(popcount(buf.subarray(buf.length - 2))));
  await c.expect(["BITCOUNT", key("nada")], I(0));
});

async function bitopCase(c, op, a, b) {
  const [ka, kb, dest] = [key("a"), key("b"), key("dest")];
  await c.expect(["SET", ka, a.toString("latin1")], S("OK"));
  await c.expect(["SET", kb, b.toString("latin1")], S("OK"));
  const len = Math.max(a.length, b.length);
  await c.expect(["BITOP", op, dest, ka, kb], I(len));
  const want = Buffer.alloc(len);
  for (let i = 0; i < len; i++) want[i] = op === "AND" ? (a[i] ?? 0) & (b[i] ?? 0) : (a[i] ?? 0) | (b[i] ?? 0);
  const got = bytes(await c.call("GET", dest));
  assert(got.equals(want), `BITOP ${op} de ${a.toString("hex")} e ${b.toString("hex")}: esperava ${want.toString("hex")}, recebeu ${got.toString("hex")}`);
}

const randomBytes = (n) => Buffer.from(Array.from({ length: n }, () => rand(32, 126)));

stage(106, "AND two bitmaps", async (ctx) => {
  const { c } = await setup(ctx);
  await bitopCase(c, "AND", randomBytes(4), randomBytes(4));
});

stage(107, "AND bitmaps of different lengths", async (ctx) => {
  const { c } = await setup(ctx);
  await bitopCase(c, "AND", randomBytes(6), randomBytes(3));
  await bitopCase(c, "AND", randomBytes(2), randomBytes(5));
});

stage(108, "OR two bitmaps", async (ctx) => {
  const { c } = await setup(ctx);
  await bitopCase(c, "OR", randomBytes(4), randomBytes(4));
  await bitopCase(c, "OR", randomBytes(2), randomBytes(5));
});

// Geospatial ---------------------------------------------------------------------------------------

async function geoSet(c, places = shuffle(PLACES).slice(0, 4)) {
  const g = key("lugares");
  for (const [name, lon, lat] of places) await c.expect(["GEOADD", g, String(lon), String(lat), name], I(1));
  return { g, places };
}

stage(109, "Respond to GEOADD", async (ctx) => {
  const { c } = await setup(ctx);
  const [name, lon, lat] = pick(PLACES);
  await c.expect(["GEOADD", key("lugares"), String(lon), String(lat), name], I(1));
});

stage(110, "Validate coordinates", async (ctx) => {
  const { c } = await setup(ctx);
  const g = key("lugares");
  await c.expect(["GEOADD", g, "200", "10", "x"], E("ERR invalid longitude,latitude pair"));
  await c.expect(["GEOADD", g, "10", "86", "x"], E("ERR invalid longitude,latitude pair"));
  await c.expect(["GEOADD", g, "-180", "-85.05", "canto"], I(1));
});

stage(111, "Store a location", async (ctx) => {
  const { c } = await setup(ctx);
  const { g, places } = await geoSet(c);
  await c.expect(["TYPE", g], S("zset"));
  await c.expect(["ZCARD", g], I(places.length));
  await c.expect(["GEOADD", g, String(places[0][1]), String(places[0][2]), places[0][0]], I(0));
});

stage(112, "Calculate location score", async (ctx) => {
  const { c } = await setup(ctx);
  const { g, places } = await geoSet(c);
  for (const [name, lon, lat] of places) {
    const got = await c.call("ZSCORE", g, name);
    const want = geoEncode(lon, lat);
    assert(got.t === "$" && Number(got.v) === want, `ZSCORE de ${name} (${lon}, ${lat}) deveria ser o geohash ${want}; recebeu ${show(got)}`);
  }
});

stage(113, "Respond to GEOPOS", async (ctx) => {
  const { c } = await setup(ctx);
  const { g, places } = await geoSet(c);
  const reply = await c.call("GEOPOS", g, places[0][0], "ninguem");
  assert(reply.t === "*" && reply.v?.length === 2, `GEOPOS com 2 membros deveria devolver 2 itens; recebeu ${show(reply)}`);
  assert(reply.v[0].t === "*" && reply.v[0].v?.length === 2, `o primeiro item deveria ser [longitude, latitude]; recebeu ${show(reply.v[0])}`);
  assert(matches(reply.v[1], NA), `membro inexistente deveria vir como array nulo (*-1); recebeu ${show(reply.v[1])}`);
});

stage(114, "Decode coordinates", async (ctx) => {
  const { c } = await setup(ctx);
  const { g, places } = await geoSet(c);
  const reply = await c.call("GEOPOS", g, ...places.map((p) => p[0]));
  places.forEach(([name, lon, lat], i) => {
    const [wantLon, wantLat] = geoDecode(geoEncode(lon, lat));
    const pair = reply.v?.[i]?.v;
    assert(pair && pair.length === 2, `GEOPOS de ${name}: esperava [lon, lat]; recebeu ${show(reply.v?.[i])}`);
    const [gotLon, gotLat] = pair.map((item) => Number(item.v));
    assert(Math.abs(gotLon - wantLon) < 1e-9 && Math.abs(gotLat - wantLat) < 1e-9,
      `GEOPOS de ${name}: esperava o centro da célula (${wantLon}, ${wantLat}); recebeu (${gotLon}, ${gotLat})`);
    assert(Math.abs(gotLon - lon) < 1e-4 && Math.abs(gotLat - lat) < 1e-4, `GEOPOS de ${name} ficou longe demais do original`);
  });
});

stage(115, "Calculate distance", async (ctx) => {
  const { c } = await setup(ctx);
  const { g, places } = await geoSet(c);
  const [[n1, lon1, lat1], [n2, lon2, lat2]] = places;
  const [a, b] = [geoDecode(geoEncode(lon1, lat1)), geoDecode(geoEncode(lon2, lat2))];
  const want = geoDistance(a[0], a[1], b[0], b[1]);
  const got = await c.call("GEODIST", g, n1, n2);
  assert(got.t === "$" && /^\d+\.\d{4}$/.test(got.v ?? ""), `GEODIST deveria devolver metros com 4 casas decimais; recebeu ${show(got)}`);
  assert(Math.abs(Number(got.v) - want) < 0.01, `GEODIST ${n1} ${n2}: esperava ~${want.toFixed(4)}; recebeu ${got.v}`);
  await c.expect(["GEODIST", g, n1, "ninguem"], NB);
});

stage(116, "Search within radius", async (ctx) => {
  const { c } = await setup(ctx);
  const { g, places } = await geoSet(c, PLACES);
  const [, lon, lat] = pick(PLACES);
  for (const radiusKm of [500, 2_000, 10_000]) {
    const want = places
      .filter(([, plon, plat]) => {
        const [dlon, dlat] = geoDecode(geoEncode(plon, plat));
        return geoDistance(lon, lat, dlon, dlat) <= radiusKm * 1000;
      })
      .map((p) => p[0])
      .sort();
    const reply = await c.call("GEOSEARCH", g, "FROMLONLAT", String(lon), String(lat), "BYRADIUS", String(radiusKm), "km");
    const got = (reply.v ?? []).map((item) => item.v).sort();
    assert(JSON.stringify(got) === JSON.stringify(want), `GEOSEARCH raio ${radiusKm} km a partir de (${lon}, ${lat}): esperava ${JSON.stringify(want)} (em qualquer ordem); recebeu ${JSON.stringify(got)}`);
  }
});

// Authentication -----------------------------------------------------------------------------------

stage(117, "Respond to ACL WHOAMI", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["ACL", "WHOAMI"], B("default"));
});

stage(118, "Respond to ACL GETUSER", async (ctx) => {
  const { c } = await setup(ctx);
  const reply = await c.call("ACL", "GETUSER", "default");
  assert(reply.t === "*" && reply.v?.[0]?.v === "flags" && reply.v?.[1]?.t === "*", `ACL GETUSER default deveria começar com "flags" seguido de um array; recebeu ${show(reply)}`);
});

stage(119, "The nopass flag", async (ctx) => {
  const { c } = await setup(ctx);
  const reply = await c.call("ACL", "GETUSER", "default");
  assert(matches(reply.v?.[1], BA("nopass")), `as flags do usuário default deveriam ser [nopass]; recebeu ${show(reply.v?.[1])}`);
});

stage(120, "The passwords property", async (ctx) => {
  const { c } = await setup(ctx);
  await c.expect(["ACL", "GETUSER", "default"], A(B("flags"), BA("nopass"), B("passwords"), A()));
});

stage(121, "Setting default user password", async (ctx) => {
  const { c } = await setup(ctx);
  const password = `${pick(WORDS)}${rand(100, 999)}`;
  await c.expect(["ACL", "SETUSER", "default", `>${password}`], S("OK"));
  await c.expect(["ACL", "GETUSER", "default"], A(B("flags"), A(), B("passwords"), BA(sha256(password))));
});

stage(122, "The AUTH command", async (ctx) => {
  const { c } = await setup(ctx);
  const password = `${pick(WORDS)}${rand(100, 999)}`;
  await c.expect(["ACL", "SETUSER", "default", `>${password}`], S("OK"));
  await c.expect(["AUTH", "default", `${password}x`], E("WRONGPASS invalid username-password pair or user is disabled."));
  await c.expect(["AUTH", "default", password], S("OK"));
});

stage(123, "Enforce authentication", async (ctx) => {
  const { server, c } = await setup(ctx);
  const password = `${pick(WORDS)}${rand(100, 999)}`;
  await c.expect(["ACL", "SETUSER", "default", `>${password}`], S("OK"));
  await c.expect(["PING"], S("PONG"));
  const fresh = await client(ctx, server.port, "nova conexão");
  await fresh.expect(["GET", "x"], E("NOAUTH Authentication required."));
  await fresh.expect(["PING"], E("NOAUTH Authentication required."));
});

stage(124, "Authenticate using AUTH", async (ctx) => {
  const { server, c } = await setup(ctx);
  const password = `${pick(WORDS)}${rand(100, 999)}`;
  await c.expect(["ACL", "SETUSER", "default", `>${password}`], S("OK"));
  const fresh = await client(ctx, server.port, "nova conexão");
  await fresh.expect(["SET", "k", "v"], E("NOAUTH Authentication required."));
  await fresh.expect(["AUTH", "default", password], S("OK"));
  await fresh.expect(["SET", "k", "v"], S("OK"));
  await fresh.expect(["GET", "k"], B("v"));
  await fresh.expect(["ACL", "WHOAMI"], B("default"));
});

// ------------------------------------------------------------------------------ runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "redis.jar");
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

  const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "pw-redis-")));
  const results = [];
  try {
    const jarExists = await fs.access(jar).then(() => true, () => false);
    for (const test of tests) {
      onProgress({ type: "stage-start", number: test.number, title: test.title });
      const startedAt = Date.now();
      const before = logs.length;
      const ctx = { jar, tmp, cleanup: [] };
      let result;
      try {
        if (!jarExists) throw new Error(`${jar} não encontrado — o build gerou o jar?`);
        await test.run(ctx);
        result = { number: test.number, title: test.title, ok: true, durationMs: Date.now() - startedAt };
      } catch (error) {
        result = { number: test.number, title: test.title, ok: false, error: error.message, durationMs: Date.now() - startedAt };
      }
      for (const fn of ctx.cleanup.reverse()) await fn().catch(() => {});
      if (result.ok) logs = logs.slice(0, before); // guarda só o log dos stages que falharam
      results.push(result);
      onProgress({ type: "stage-end", result });
    }
  } finally {
    await delay(200);
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
      console.log(`${stage.ok ? "✅" : "❌"} Stage ${String(stage.number).padStart(3, "0")} · ${stage.title}`);
      if (!stage.ok) console.log(`   ${stage.error}`);
    },
  });

  console.log(`\n${result.passed}/${result.results.length} stages concluídos.`);
  if (result.failed > 0) {
    console.log(`\nConversa com o servidor (stages que falharam):\n${result.logs.slice(-4000)}`);
    process.exitCode = 1;
  }
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(`\n💥 ${error.message}`);
    process.exit(1);
  });
}
