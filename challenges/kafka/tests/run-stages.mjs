#!/usr/bin/env node
/**
 * Tester local do desafio Kafka.
 *
 * Para cada stage o tester cria um diretório de logs (com o log de metadados KRaft e, quando
 * precisa, logs de partições), escreve um server.properties e inicia o broker do usuário:
 *
 *   java -jar target/kafka.jar <server.properties>
 *
 * Depois age como cliente Kafka: envia requests binários (ApiVersions v4,
 * DescribeTopicPartitions v0, Fetch v16, Produce v11) e confere cada resposta campo a campo.
 *
 * Uso:
 *   node challenges/kafka/tests/run-stages.mjs
 *   node challenges/kafka/tests/run-stages.mjs --dir <workspace> --no-build
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const DEFAULT_PORT = 9092;

const API = { PRODUCE: 0, FETCH: 1, API_VERSIONS: 18, DESCRIBE_TOPIC_PARTITIONS: 75 };
const WORDS = ["spells", "potions", "scrolls", "dragons", "ravens", "runes", "embers", "orders", "clicks", "events"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function randomTopicName() {
  return `${WORDS[crypto.randomInt(WORDS.length)]}-${crypto.randomBytes(2).toString("hex")}`;
}

function correlationId() {
  return crypto.randomInt(1, 2 ** 31 - 1);
}

// --------------------------------------------------------------- codec

class Writer {
  constructor() {
    this.parts = [];
  }
  raw(buf) { this.parts.push(Buffer.from(buf)); return this; }
  int8(v) { const b = Buffer.alloc(1); b.writeInt8(v); return this.raw(b); }
  int16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v); return this.raw(b); }
  int32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v); return this.raw(b); }
  uint32(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return this.raw(b); }
  int64(v) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v)); return this.raw(b); }
  uvarint(v) {
    const bytes = [];
    while (v > 0x7f) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v);
    return this.raw(Buffer.from(bytes));
  }
  varint(v) { return this.uvarint(((v << 1) ^ (v >> 31)) >>> 0); }
  uuid(buf) { return this.raw(buf); }
  string(s) { const b = Buffer.from(s); return this.int16(b.length).raw(b); }
  compactString(s) { const b = Buffer.from(s); return this.uvarint(b.length + 1).raw(b); }
  compactArray(items, fn) { this.uvarint(items.length + 1); items.forEach((item) => fn(this, item)); return this; }
  compactBytes(buf) { return buf === null ? this.uvarint(0) : this.uvarint(buf.length + 1).raw(buf); }
  tags() { return this.uvarint(0); }
  build() { return Buffer.concat(this.parts); }
}

class Reader {
  constructor(buf, context) {
    this.buf = buf;
    this.pos = 0;
    this.context = context;
  }
  need(n, field) {
    if (this.pos + n > this.buf.length) {
      throw new Error(`${this.context}: a resposta terminou no meio do campo ${field} (${this.buf.length} bytes no corpo)`);
    }
  }
  int8(f) { this.need(1, f); return this.buf.readInt8(this.pos++); }
  int16(f) { this.need(2, f); const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v; }
  int32(f) { this.need(4, f); const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v; }
  int64(f) { this.need(8, f); const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return Number(v); }
  uuid(f) { this.need(16, f); const v = this.buf.subarray(this.pos, this.pos + 16); this.pos += 16; return Buffer.from(v); }
  uvarint(f) {
    let value = 0;
    let shift = 0;
    for (;;) {
      this.need(1, f);
      const b = this.buf[this.pos++];
      value |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return value >>> 0;
      shift += 7;
    }
  }
  bytes(n, f) { this.need(n, f); const v = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return Buffer.from(v); }
  compactNullableString(f) {
    const n = this.uvarint(f) - 1;
    return n < 0 ? null : this.bytes(n, f).toString("utf8");
  }
  compactBytes(f) {
    const n = this.uvarint(f) - 1;
    return n < 0 ? null : this.bytes(n, f);
  }
  compactArray(f, fn) {
    const n = this.uvarint(f) - 1;
    const items = [];
    for (let i = 0; i < n; i++) items.push(fn(this, i));
    return items;
  }
  int32Array(f) { return this.compactArray(f, (r) => r.int32(f)); }
  tags(f) {
    const count = this.uvarint(`${f} (tagged fields)`);
    for (let i = 0; i < count; i++) {
      this.uvarint(f);
      this.bytes(this.uvarint(f), f);
    }
  }
  end() {
    assert(this.pos === this.buf.length, `${this.context}: sobraram ${this.buf.length - this.pos} bytes depois do último campo — confira message_size e o formato`);
  }
}

// CRC-32C (Castagnoli), usado nos record batches.
const CRC32C_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32c(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC32C_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeRecord(record, offsetDelta) {
  const body = new Writer().int8(0).varint(0).varint(offsetDelta);
  if (record.key === null || record.key === undefined) body.varint(-1);
  else body.varint(record.key.length).raw(record.key);
  body.varint(record.value.length).raw(record.value).varint(0);
  const bytes = body.build();
  return new Writer().varint(bytes.length).raw(bytes).build();
}

function encodeBatch(records, baseOffset = 0) {
  const now = Date.now();
  const afterCrc = new Writer()
    .int16(0) // attributes
    .int32(records.length - 1) // lastOffsetDelta
    .int64(now)
    .int64(now)
    .int64(-1) // producerId
    .int16(-1) // producerEpoch
    .int32(-1) // baseSequence
    .int32(records.length);
  records.forEach((record, i) => afterCrc.raw(encodeRecord(record, i)));
  const tail = afterCrc.build();
  return new Writer()
    .int64(baseOffset)
    .int32(4 + 1 + 4 + tail.length) // batchLength: do partitionLeaderEpoch ao fim
    .int32(0) // partitionLeaderEpoch
    .int8(2) // magic
    .uint32(crc32c(tail))
    .raw(tail)
    .build();
}

function randomRecords(count) {
  return Array.from({ length: count }, () => ({
    key: null,
    value: Buffer.from(`${randomTopicName()} ${crypto.randomBytes(6).toString("hex")}`),
  }));
}

// -------------------------------------------- log de metadados (KRaft)

function featureLevelRecord() {
  return new Writer().int8(1).int8(12).int8(0).compactString("metadata.version").int16(20).tags().build();
}

function topicRecord(topic) {
  return new Writer().int8(1).int8(2).int8(0).compactString(topic.name).uuid(topic.id).tags().build();
}

function partitionRecord(topic, index) {
  return new Writer()
    .int8(1).int8(3).int8(1)
    .int32(index)
    .uuid(topic.id)
    .compactArray([1], (w, v) => w.int32(v)) // replicas
    .compactArray([1], (w, v) => w.int32(v)) // isr
    .compactArray([], () => {}) // removing_replicas
    .compactArray([], () => {}) // adding_replicas
    .int32(1) // leader
    .int32(0) // leader_epoch
    .int32(0) // partition_epoch
    .compactArray([crypto.randomBytes(16)], (w, v) => w.uuid(v)) // directories
    .tags()
    .build();
}

function makeTopics(specs) {
  return specs.map((partitions) => ({ name: randomTopicName(), id: crypto.randomBytes(16), partitions }));
}

function metadataLog(topics) {
  let offset = 0;
  const batches = [];
  const batch = (values) => {
    const encoded = encodeBatch(values.map((value) => ({ key: null, value })), offset);
    offset += values.length;
    batches.push(encoded);
  };
  batch([featureLevelRecord()]);
  for (const topic of topics) {
    batch([topicRecord(topic), ...Array.from({ length: topic.partitions }, (_, i) => partitionRecord(topic, i))]);
  }
  return Buffer.concat(batches);
}

// ---------------------------------------------------------- broker

let logs = "";

async function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function freePort() {
  if (await portIsFree(DEFAULT_PORT)) return DEFAULT_PORT;
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startBroker(ctx, { topics = [], partitionLogs = {} } = {}) {
  const dir = path.join(ctx.tmp, `logs-${crypto.randomBytes(4).toString("hex")}`);
  const metadataDir = path.join(dir, "__cluster_metadata-0");
  await fs.mkdir(metadataDir, { recursive: true });
  await fs.writeFile(path.join(metadataDir, "00000000000000000000.log"), metadataLog(topics));
  for (const topic of topics) {
    for (let p = 0; p < topic.partitions; p++) {
      const partitionDir = path.join(dir, `${topic.name}-${p}`);
      await fs.mkdir(partitionDir, { recursive: true });
      await fs.writeFile(path.join(partitionDir, "00000000000000000000.log"), partitionLogs[`${topic.name}-${p}`] ?? Buffer.alloc(0));
    }
  }
  const port = await freePort();
  const properties = path.join(dir, "server.properties");
  await fs.writeFile(properties, [
    "process.roles=broker,controller",
    "node.id=1",
    `listeners=PLAINTEXT://:${port}`,
    `log.dirs=${dir.split(path.sep).join("/")}`,
    "",
  ].join("\n"));

  const child = spawn("java", ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", ctx.jar, properties], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let exited = false;
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  child.once("exit", () => { exited = true; });
  child.once("error", (error) => { exited = true; logs += `${error.message}\n`; });

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (exited) throw new Error("o broker encerrou antes de aceitar conexões");
    const ok = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (ok) break;
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`o broker não aceitou conexões em 127.0.0.1:${port} (leia a porta de "listeners" no server.properties)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return {
    port,
    dir,
    stop: () => {
      child.kill();
      setTimeout(() => child.kill("SIGKILL"), 500).unref();
    },
  };
}

async function withBroker(ctx, options, fn) {
  const broker = await startBroker(ctx, options);
  try {
    return await fn(broker);
  } finally {
    broker.stop();
  }
}

// ----------------------------------------------------------- cliente

class Connection {
  static open(port) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: "127.0.0.1", port }, () => resolve(new Connection(socket)));
      socket.once("error", reject);
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.closed = false;
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.waiters.splice(0).forEach((w) => w());
    });
    socket.on("close", () => {
      this.closed = true;
      this.waiters.splice(0).forEach((w) => w());
    });
    socket.on("error", () => {});
  }

  async readExactly(n, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (this.buffer.length < n) {
      if (this.closed) throw new Error(`o broker fechou a conexão depois de ${this.buffer.length} de ${n} bytes esperados`);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timeout esperando ${n} bytes do broker (recebeu ${this.buffer.length})`);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    const out = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    return Buffer.from(out);
  }

  send(apiKey, apiVersion, correlation, body) {
    const message = new Writer()
      .int16(apiKey).int16(apiVersion).int32(correlation).string("pw-tester").tags()
      .raw(body)
      .build();
    this.socket.write(Buffer.concat([new Writer().int32(message.length).build(), message]));
  }

  /** Lê uma resposta inteira (message_size + corpo) e confere o correlation_id. */
  async response(correlation, context) {
    const size = (await this.readExactly(4)).readInt32BE(0);
    assert(size > 0 && size < 10_000_000, `${context}: message_size inválido (${size})`);
    const reader = new Reader(await this.readExactly(size), context);
    const got = reader.int32("correlation_id");
    assert(got === correlation, `${context}: correlation_id ${got}, esperava ${correlation}`);
    return reader;
  }

  close() {
    this.socket.destroy();
  }
}

/** Respostas de APIs "flexíveis" usam o cabeçalho v1: correlation_id + TAG_BUFFER (0x00). */
function expectHeaderV1(r) {
  const tag = r.uvarint("TAG_BUFFER do cabeçalho");
  assert(tag === 0, `${r.context}: depois do correlation_id deveria vir o TAG_BUFFER vazio do cabeçalho de resposta v1 (0x00), veio 0x${tag.toString(16)}`);
}

function apiVersionsBody() {
  return new Writer().compactString("pw-tester").compactString("1.0.0").tags().build();
}

async function apiVersions(conn) {
  const correlation = correlationId();
  conn.send(API.API_VERSIONS, 4, correlation, apiVersionsBody());
  const r = await conn.response(correlation, "ApiVersions v4");
  const error = r.int16("error_code");
  const apis = r.compactArray("api_keys", (rr) => {
    const entry = { key: rr.int16("api_key"), min: rr.int16("min_version"), max: rr.int16("max_version") };
    rr.tags("api_keys");
    return entry;
  });
  r.int32("throttle_time_ms");
  r.tags("ApiVersions");
  r.end();
  assert(error === 0, `ApiVersions v4: error_code ${error}, esperava 0`);
  return apis;
}

function expectApi(apis, key, version, name) {
  const entry = apis.find((api) => api.key === key);
  assert(entry, `ApiVersions não anuncia ${name} (api_key ${key})`);
  assert(entry.min <= version && entry.max >= version, `${name} deveria suportar a versão ${version} (anunciado: ${entry.min}–${entry.max})`);
}

async function describeTopicsRaw(conn, names) {
  const correlation = correlationId();
  const body = new Writer()
    .compactArray(names, (w, name) => w.compactString(name).tags())
    .int32(100) // response_partition_limit
    .int8(-1) // cursor = null
    .tags()
    .build();
  conn.send(API.DESCRIBE_TOPIC_PARTITIONS, 0, correlation, body);
  const r = await conn.response(correlation, "DescribeTopicPartitions v0");
  expectHeaderV1(r);
  r.int32("throttle_time_ms");
  const topics = r.compactArray("topics", (rr) => {
    const topic = {
      error: rr.int16("topics.error_code"),
      name: rr.compactNullableString("topics.name"),
      id: rr.uuid("topics.topic_id"),
      internal: rr.int8("topics.is_internal"),
      partitions: rr.compactArray("topics.partitions", (pr) => {
        const p = {
          error: pr.int16("partitions.error_code"),
          index: pr.int32("partitions.partition_index"),
          leader: pr.int32("partitions.leader_id"),
          leaderEpoch: pr.int32("partitions.leader_epoch"),
          replicas: pr.int32Array("partitions.replica_nodes"),
          isr: pr.int32Array("partitions.isr_nodes"),
          elr: pr.int32Array("partitions.eligible_leader_replicas"),
          lastElr: pr.int32Array("partitions.last_known_elr"),
          offline: pr.int32Array("partitions.offline_replicas"),
        };
        pr.tags("partitions");
        return p;
      }),
    };
    rr.int32("topics.topic_authorized_operations");
    rr.tags("topics");
    return topic;
  });
  const cursor = r.int8("next_cursor");
  assert(cursor === -1, "next_cursor deveria ser nulo (0xff)");
  r.tags("DescribeTopicPartitions");
  r.end();
  return topics;
}

function checkKnownTopic(topic, expected) {
  assert(topic.error === 0, `tópico ${expected.name}: error_code ${topic.error}, esperava 0`);
  assert(topic.name === expected.name, `nome do tópico ${topic.name}, esperava ${expected.name}`);
  assert(topic.id.equals(expected.id), `topic_id de ${expected.name} não confere com o TopicRecord do log de metadados`);
  assert(topic.partitions.length === expected.partitions, `${expected.name}: ${topic.partitions.length} partições, esperava ${expected.partitions}`);
  topic.partitions.forEach((p, i) => {
    assert(p.error === 0, `${expected.name}/${i}: error_code ${p.error}`);
    assert(p.index === i, `${expected.name}: partição na posição ${i} tem partition_index ${p.index} (ordene por índice)`);
    assert(p.leader === 1, `${expected.name}/${i}: leader_id ${p.leader}, o PartitionRecord diz 1`);
    assert(p.replicas.join(",") === "1" && p.isr.join(",") === "1", `${expected.name}/${i}: replica_nodes e isr_nodes deveriam ser [1]`);
  });
}

async function fetchTopicsRaw(conn, request) {
  const correlation = correlationId();
  const body = new Writer()
    .int32(500).int32(1).int32(0x7fffffff).int8(0) // max_wait, min_bytes, max_bytes, isolation
    .int32(0).int32(0) // session_id, session_epoch
    .compactArray(request, (w, t) => w.uuid(t.id).compactArray(t.partitions, (pw, p) => pw
      .int32(p).int32(-1).int64(0).int32(-1).int64(-1).int32(1024 * 1024).tags()).tags())
    .compactArray([], () => {}) // forgotten_topics_data
    .compactString("") // rack_id
    .tags()
    .build();
  conn.send(API.FETCH, 16, correlation, body);
  const r = await conn.response(correlation, "Fetch v16");
  expectHeaderV1(r);
  r.int32("throttle_time_ms");
  const error = r.int16("error_code");
  r.int32("session_id");
  const responses = r.compactArray("responses", (rr) => {
    const topic = {
      id: rr.uuid("responses.topic_id"),
      partitions: rr.compactArray("responses.partitions", (pr) => {
        const p = {
          index: pr.int32("partitions.partition_index"),
          error: pr.int16("partitions.error_code"),
          highWatermark: pr.int64("partitions.high_watermark"),
        };
        pr.int64("partitions.last_stable_offset");
        pr.int64("partitions.log_start_offset");
        pr.compactArray("partitions.aborted_transactions", (ar) => {
          ar.int64("aborted.producer_id");
          ar.int64("aborted.first_offset");
          ar.tags("aborted_transactions");
        });
        pr.int32("partitions.preferred_read_replica");
        p.records = pr.compactBytes("partitions.records");
        pr.tags("partitions");
        return p;
      }),
    };
    rr.tags("responses");
    return topic;
  });
  r.tags("Fetch");
  r.end();
  assert(error === 0, `Fetch: error_code de topo ${error}, esperava 0`);
  return responses;
}

async function produceRaw(conn, topicData) {
  const correlation = correlationId();
  const body = new Writer()
    .uvarint(0) // transactional_id = null
    .int16(-1) // acks
    .int32(5000) // timeout_ms
    .compactArray(topicData, (w, t) => w.compactString(t.name)
      .compactArray(t.partitions, (pw, p) => pw.int32(p.index).compactBytes(p.records).tags()).tags())
    .tags()
    .build();
  conn.send(API.PRODUCE, 11, correlation, body);
  const r = await conn.response(correlation, "Produce v11");
  expectHeaderV1(r);
  const responses = r.compactArray("responses", (rr) => {
    const topic = {
      name: rr.compactNullableString("responses.name"),
      partitions: rr.compactArray("responses.partition_responses", (pr) => {
        const p = {
          index: pr.int32("partition_responses.index"),
          error: pr.int16("partition_responses.error_code"),
          baseOffset: pr.int64("partition_responses.base_offset"),
          logAppendTime: pr.int64("partition_responses.log_append_time_ms"),
          logStartOffset: pr.int64("partition_responses.log_start_offset"),
        };
        pr.compactArray("partition_responses.record_errors", (er) => {
          er.int32("record_errors.batch_index");
          er.compactNullableString("record_errors.batch_index_error_message");
          er.tags("record_errors");
        });
        pr.compactNullableString("partition_responses.error_message");
        pr.tags("partition_responses");
        return p;
      }),
    };
    rr.tags("responses");
    return topic;
  });
  r.int32("throttle_time_ms");
  r.tags("Produce");
  r.end();
  return responses;
}

const SHIFT_HINT = " (se os campos parecem deslocados, confira o TAG_BUFFER do cabeçalho de resposta v1 logo depois do correlation_id)";

function flexible(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw new Error(error.message.includes("TAG_BUFFER") ? error.message : `${error.message}${SHIFT_HINT}`);
    }
  };
}

const describeTopics = flexible(describeTopicsRaw);
const fetchTopics = flexible(fetchTopicsRaw);
const produce = flexible(produceRaw);

async function readPartitionFile(broker, name, index) {
  return fs.readFile(path.join(broker.dir, `${name}-${index}`, "00000000000000000000.log")).catch(() => Buffer.alloc(0));
}

function withBaseOffset(batch, offset) {
  const copy = Buffer.from(batch);
  copy.writeBigInt64BE(BigInt(offset), 0);
  return copy;
}

// ------------------------------------------------------------------- stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

async function withConnection(broker, fn) {
  const conn = await Connection.open(broker.port);
  try {
    return await fn(conn);
  } finally {
    conn.close();
  }
}

stage(1, "Bind to a port", async (ctx) => {
  await withBroker(ctx, {}, async () => {});
});

stage(2, "Send Correlation ID", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    conn.send(API.API_VERSIONS, 4, 7, apiVersionsBody());
    const head = await conn.readExactly(8);
    assert(head.readInt32BE(4) === 7, `correlation_id ${head.readInt32BE(4)}, esperava 7 (bytes 4–7 da resposta)`);
  }));
});

stage(3, "Parse Correlation ID", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    const correlation = correlationId();
    conn.send(API.API_VERSIONS, 4, correlation, apiVersionsBody());
    const head = await conn.readExactly(8);
    assert(head.readInt32BE(4) === correlation, `correlation_id ${head.readInt32BE(4)}, esperava ${correlation} (copie do request)`);
  }));
});

stage(4, "Parse API Version", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    const correlation = correlationId();
    const version = 5 + crypto.randomInt(1000);
    conn.send(API.API_VERSIONS, version, correlation, apiVersionsBody());
    const head = await conn.readExactly(10);
    assert(head.readInt32BE(4) === correlation, `correlation_id ${head.readInt32BE(4)}, esperava ${correlation}`);
    const error = head.readInt16BE(8);
    assert(error === 35, `ApiVersions v${version} não é suportada: error_code ${error}, esperava 35 (UNSUPPORTED_VERSION)`);
  }));
});

stage(5, "Handle ApiVersions requests", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    expectApi(await apiVersions(conn), API.API_VERSIONS, 4, "ApiVersions");
  }));
});

stage(6, "Serial requests", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    for (let i = 0; i < 3 + crypto.randomInt(3); i++) {
      expectApi(await apiVersions(conn), API.API_VERSIONS, 4, "ApiVersions");
    }
  }));
});

stage(7, "Concurrent requests", async (ctx) => {
  await withBroker(ctx, {}, async (broker) => {
    const conns = await Promise.all([1, 2, 3].map(() => Connection.open(broker.port)));
    try {
      for (let round = 0; round < 2; round++) {
        const ids = conns.map(() => correlationId());
        conns.forEach((conn, i) => conn.send(API.API_VERSIONS, 4, ids[i], apiVersionsBody()));
        for (let i = conns.length - 1; i >= 0; i--) {
          let r;
          try {
            r = await conns[i].response(ids[i], `ApiVersions (cliente ${i + 1} de 3, conexões simultâneas)`);
          } catch (error) {
            throw new Error(`${error.message} — com 3 clientes conectados ao mesmo tempo, atenda cada conexão em uma thread própria`);
          }
          assert(r.int16("error_code") === 0, "error_code deveria ser 0");
        }
      }
    } finally {
      conns.forEach((conn) => conn.close());
    }
  });
});

stage(8, "Include DescribeTopicPartitions in ApiVersions", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    const apis = await apiVersions(conn);
    expectApi(apis, API.API_VERSIONS, 4, "ApiVersions");
    expectApi(apis, API.DESCRIBE_TOPIC_PARTITIONS, 0, "DescribeTopicPartitions");
  }));
});

stage(9, "List for an unknown topic", async (ctx) => {
  const topics = makeTopics([1]);
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const name = `unknown-${randomTopicName()}`;
    const [topic] = await describeTopics(conn, [name]);
    assert(topic.error === 3, `tópico inexistente: error_code ${topic.error}, esperava 3 (UNKNOWN_TOPIC_OR_PARTITION)`);
    assert(topic.name === name, `o nome do tópico deveria ser ecoado (${name})`);
    assert(topic.id.equals(Buffer.alloc(16)), "topic_id de um tópico inexistente deveria ser 00000000-0000-0000-0000-000000000000");
    assert(topic.partitions.length === 0, "tópico inexistente não tem partições");
  }));
});

stage(10, "List for a single partition", async (ctx) => {
  const topics = makeTopics([1, 2]);
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const [topic] = await describeTopics(conn, [topics[0].name]);
    checkKnownTopic(topic, topics[0]);
  }));
});

stage(11, "List for multiple partitions", async (ctx) => {
  const topics = makeTopics([1, 2 + crypto.randomInt(3)]);
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const [topic] = await describeTopics(conn, [topics[1].name]);
    checkKnownTopic(topic, topics[1]);
  }));
});

stage(12, "List for multiple topics", async (ctx) => {
  const topics = makeTopics([1, 2, 3]);
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const requested = [topics[2], topics[0], topics[1]];
    const response = await describeTopics(conn, requested.map((t) => t.name));
    const sorted = [...topics].sort((a, b) => (a.name < b.name ? -1 : 1));
    assert(response.length === 3, `esperava 3 tópicos na resposta, recebeu ${response.length}`);
    assert(
      response.map((t) => t.name).join(",") === sorted.map((t) => t.name).join(","),
      `os tópicos deveriam vir em ordem alfabética: ${sorted.map((t) => t.name).join(", ")}`
    );
    response.forEach((topic, i) => checkKnownTopic(topic, sorted[i]));
  }));
});

stage(13, "Include Fetch in ApiVersions", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    const apis = await apiVersions(conn);
    expectApi(apis, API.FETCH, 16, "Fetch");
    expectApi(apis, API.DESCRIBE_TOPIC_PARTITIONS, 0, "DescribeTopicPartitions");
  }));
});

stage(14, "Fetch with no topics", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    const responses = await fetchTopics(conn, []);
    assert(responses.length === 0, `Fetch sem tópicos deveria devolver responses vazio, recebeu ${responses.length}`);
  }));
});

stage(15, "Fetch with an unknown topic", async (ctx) => {
  const topics = makeTopics([1]);
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const unknown = crypto.randomBytes(16);
    const [topic] = await fetchTopics(conn, [{ id: unknown, partitions: [0] }]);
    assert(topic && topic.id.equals(unknown), "a resposta deveria ecoar o topic_id pedido");
    assert(topic.partitions.length === 1, "esperava uma partição na resposta");
    assert(topic.partitions[0].error === 100, `topic_id desconhecido: error_code ${topic.partitions[0].error}, esperava 100 (UNKNOWN_TOPIC_ID)`);
  }));
});

stage(16, "Fetch with an empty topic", async (ctx) => {
  const topics = makeTopics([1]);
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const [topic] = await fetchTopics(conn, [{ id: topics[0].id, partitions: [0] }]);
    assert(topic.id.equals(topics[0].id), "a resposta deveria ecoar o topic_id");
    const [p] = topic.partitions;
    assert(p.error === 0, `tópico existente: error_code ${p.error}, esperava 0`);
    assert(!p.records || p.records.length === 0, `partição vazia: records deveria estar vazio, veio com ${p.records.length} bytes`);
  }));
});

stage(17, "Fetch single message from disk", async (ctx) => {
  const topics = makeTopics([1]);
  const batch = encodeBatch(randomRecords(1));
  await withBroker(ctx, { topics, partitionLogs: { [`${topics[0].name}-0`]: batch } }, (broker) => withConnection(broker, async (conn) => {
    const [topic] = await fetchTopics(conn, [{ id: topics[0].id, partitions: [0] }]);
    const [p] = topic.partitions;
    assert(p.error === 0, `error_code ${p.error}, esperava 0`);
    assert(p.records && p.records.equals(batch), `records deveria ter os ${batch.length} bytes do record batch gravado no log, veio com ${p.records?.length ?? 0}`);
  }));
});

stage(18, "Fetch multiple messages from disk", async (ctx) => {
  const topics = makeTopics([2]);
  const first = encodeBatch(randomRecords(2), 0);
  const second = encodeBatch(randomRecords(3), 2);
  const log = Buffer.concat([first, second]);
  await withBroker(ctx, { topics, partitionLogs: { [`${topics[0].name}-1`]: log } }, (broker) => withConnection(broker, async (conn) => {
    const [topic] = await fetchTopics(conn, [{ id: topics[0].id, partitions: [1] }]);
    const [p] = topic.partitions;
    assert(p.index === 1, `partition_index ${p.index}, esperava 1`);
    assert(p.records && p.records.equals(log), `records deveria ter os ${log.length} bytes dos 2 batches do log, veio com ${p.records?.length ?? 0}`);
  }));
});

stage(19, "Include Produce in ApiVersions", async (ctx) => {
  await withBroker(ctx, {}, (broker) => withConnection(broker, async (conn) => {
    const apis = await apiVersions(conn);
    expectApi(apis, API.PRODUCE, 11, "Produce");
    expectApi(apis, API.FETCH, 16, "Fetch");
  }));
});

stage(20, "Respond for invalid topic or partition", async (ctx) => {
  const topics = makeTopics([1]);
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const unknown = `unknown-${randomTopicName()}`;
    const response = await produce(conn, [
      { name: unknown, partitions: [{ index: 0, records: encodeBatch(randomRecords(1)) }] },
      { name: topics[0].name, partitions: [{ index: 5, records: encodeBatch(randomRecords(1)) }] },
    ]);
    assert(response.length === 2, `esperava 2 tópicos na resposta, recebeu ${response.length}`);
    for (const topic of response) {
      const [p] = topic.partitions;
      assert(p.error === 3, `${topic.name}/${p.index}: error_code ${p.error}, esperava 3 (UNKNOWN_TOPIC_OR_PARTITION)`);
      assert(p.baseOffset === -1 && p.logAppendTime === -1 && p.logStartOffset === -1,
        `${topic.name}/${p.index}: base_offset, log_append_time_ms e log_start_offset deveriam ser -1`);
    }
  }));
});

stage(21, "Respond for valid topic and partition", async (ctx) => {
  const topics = makeTopics([1]);
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const [topic] = await produce(conn, [{ name: topics[0].name, partitions: [{ index: 0, records: encodeBatch(randomRecords(1)) }] }]);
    assert(topic.name === topics[0].name, "a resposta deveria ecoar o nome do tópico");
    const [p] = topic.partitions;
    assert(p.error === 0, `error_code ${p.error}, esperava 0`);
    assert(p.baseOffset === 0, `base_offset ${p.baseOffset}, esperava 0 (primeira mensagem da partição)`);
    assert(p.logAppendTime === -1, `log_append_time_ms ${p.logAppendTime}, esperava -1`);
    assert(p.logStartOffset === 0, `log_start_offset ${p.logStartOffset}, esperava 0`);
  }));
});

stage(22, "Produce a single record", async (ctx) => {
  const topics = makeTopics([1]);
  const batch = encodeBatch(randomRecords(1));
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const [topic] = await produce(conn, [{ name: topics[0].name, partitions: [{ index: 0, records: batch }] }]);
    assert(topic.partitions[0].error === 0, `error_code ${topic.partitions[0].error}`);
    const file = await readPartitionFile(broker, topics[0].name, 0);
    assert(file.equals(batch), `${topics[0].name}-0/00000000000000000000.log deveria conter o record batch recebido (${batch.length} bytes), tem ${file.length}`);
  }));
});

stage(23, "Produce multiple records", async (ctx) => {
  const topics = makeTopics([1]);
  const firstCount = 2 + crypto.randomInt(3);
  const first = encodeBatch(randomRecords(firstCount));
  const second = encodeBatch(randomRecords(2));
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const [a] = await produce(conn, [{ name: topics[0].name, partitions: [{ index: 0, records: first }] }]);
    assert(a.partitions[0].baseOffset === 0, `primeiro produce: base_offset ${a.partitions[0].baseOffset}, esperava 0`);
    const [b] = await produce(conn, [{ name: topics[0].name, partitions: [{ index: 0, records: second }] }]);
    assert(
      b.partitions[0].baseOffset === firstCount,
      `segundo produce: base_offset ${b.partitions[0].baseOffset}, esperava ${firstCount} (o primeiro batch ocupou os offsets 0–${firstCount - 1})`
    );
    const file = await readPartitionFile(broker, topics[0].name, 0);
    const expected = Buffer.concat([first, withBaseOffset(second, firstCount)]);
    assert(file.equals(expected), `o log deveria ter os dois batches, com o baseOffset do segundo reescrito para ${firstCount}`);
  }));
});

stage(24, "Produce to multiple partitions", async (ctx) => {
  const topics = makeTopics([3]);
  const batches = [encodeBatch(randomRecords(1)), encodeBatch(randomRecords(2))];
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const [topic] = await produce(conn, [{
      name: topics[0].name,
      partitions: [{ index: 2, records: batches[0] }, { index: 0, records: batches[1] }],
    }]);
    assert(topic.partitions.length === 2, `esperava 2 partições na resposta, recebeu ${topic.partitions.length}`);
    assert(topic.partitions.every((p) => p.error === 0 && p.baseOffset === 0), "as duas partições deveriam responder error_code 0 e base_offset 0");
    assert((await readPartitionFile(broker, topics[0].name, 2)).equals(batches[0]), "a partição 2 não recebeu o batch dela");
    assert((await readPartitionFile(broker, topics[0].name, 0)).equals(batches[1]), "a partição 0 não recebeu o batch dela");
    assert((await readPartitionFile(broker, topics[0].name, 1)).length === 0, "a partição 1 não deveria ter sido alterada");
  }));
});

stage(25, "Produce to multiple partitions of multiple topics", async (ctx) => {
  const topics = makeTopics([2, 2]);
  const writes = [
    { topic: topics[0], index: 1, batch: encodeBatch(randomRecords(2)) },
    { topic: topics[1], index: 0, batch: encodeBatch(randomRecords(1)) },
    { topic: topics[1], index: 1, batch: encodeBatch(randomRecords(3)) },
  ];
  await withBroker(ctx, { topics }, (broker) => withConnection(broker, async (conn) => {
    const response = await produce(conn, [
      { name: topics[0].name, partitions: [{ index: 1, records: writes[0].batch }] },
      { name: topics[1].name, partitions: [{ index: 0, records: writes[1].batch }, { index: 1, records: writes[2].batch }] },
    ]);
    assert(response.length === 2, `esperava 2 tópicos na resposta, recebeu ${response.length}`);
    for (const topic of response) {
      for (const p of topic.partitions) assert(p.error === 0, `${topic.name}/${p.index}: error_code ${p.error}`);
    }
    for (const write of writes) {
      const file = await readPartitionFile(broker, write.topic.name, write.index);
      assert(file.equals(write.batch), `${write.topic.name}-${write.index} não tem o batch enviado para ela`);
    }
  }));
});

// ------------------------------------------------------------------- runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "kafka.jar");
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

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pw-kafka-"));
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
    await new Promise((resolve) => setTimeout(resolve, 300));
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
    console.log(`\nLogs do broker:\n${result.logs.slice(-4000)}`);
    process.exitCode = 1;
  }
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(`\n💥 ${error.message}`);
    process.exit(1);
  });
}
