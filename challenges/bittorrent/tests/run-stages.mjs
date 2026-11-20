#!/usr/bin/env node
/**
 * Tester local do desafio BitTorrent.
 *
 * Gera arquivos e .torrent aleatórios e sobe, em 127.0.0.1, um tracker HTTP e peers TCP
 * que falam o protocolo peer wire (handshake, bitfield, interested/unchoke, request/piece)
 * e a extensão de metadados (BEP 9/10) usada pelos magnet links. Peers e tracker
 * validam tudo o que o cliente envia. Nada sai da máquina.
 *
 * Uso:
 *   node challenges/bittorrent/tests/run-stages.mjs
 *   node challenges/bittorrent/tests/run-stages.mjs --dir <workspace> --no-build
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const RUN_TIMEOUT_MS = 40_000;
const BLOCK = 16 * 1024;
const WORDS = ["wizard", "potion", "scroll", "dragon", "castle", "raven", "rune", "ember", "frost", "lunar"];

function word() {
  return WORDS[crypto.randomInt(WORDS.length)];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function preview(text, max = 160) {
  return text.length > max ? `${JSON.stringify(text.slice(0, max))}…` : JSON.stringify(text);
}

// ----------------------------------------------------------------- bencode

function bencode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  if (typeof value === "string") return bencode(Buffer.from(value, "utf8"));
  if (typeof value === "number") return Buffer.from(`i${Math.trunc(value)}e`);
  if (Array.isArray(value)) return Buffer.concat([Buffer.from("l"), ...value.map(bencode), Buffer.from("e")]);
  const keys = Object.keys(value).sort();
  return Buffer.concat([Buffer.from("d"), ...keys.flatMap((k) => [bencode(k), bencode(value[k])]), Buffer.from("e")]);
}

/** Decodifica; strings viram Buffer. Devolve { value, end }. */
function bdecode(buf, pos = 0) {
  const c = String.fromCharCode(buf[pos]);
  if (c === "i") {
    const end = buf.indexOf("e", pos);
    return { value: Number(buf.subarray(pos + 1, end).toString()), end: end + 1 };
  }
  if (c === "l") {
    const list = [];
    pos++;
    while (buf[pos] !== 0x65) {
      const item = bdecode(buf, pos);
      list.push(item.value);
      pos = item.end;
    }
    return { value: list, end: pos + 1 };
  }
  if (c === "d") {
    const dict = {};
    pos++;
    while (buf[pos] !== 0x65) {
      const key = bdecode(buf, pos);
      const item = bdecode(buf, key.end);
      dict[key.value.toString()] = item.value;
      pos = item.end;
    }
    return { value: dict, end: pos + 1 };
  }
  const colon = buf.indexOf(":", pos);
  const length = Number(buf.subarray(pos, colon).toString());
  return { value: buf.subarray(colon + 1, colon + 1 + length), end: colon + 1 + length };
}

function toPlain(value) {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  return value;
}

// ------------------------------------------------------------ cenário de teste

function sha1(data) {
  return crypto.createHash("sha1").update(data).digest();
}

function makeContent() {
  const pieceLength = 32 * 1024;
  const length = pieceLength * (2 + crypto.randomInt(3)) + 1000 + crypto.randomInt(20_000);
  const content = crypto.randomBytes(length);
  const pieces = [];
  for (let i = 0; i < length; i += pieceLength) pieces.push(sha1(content.subarray(i, i + pieceLength)));
  const info = { length, name: `${word()}-${crypto.randomBytes(2).toString("hex")}.bin`, "piece length": pieceLength, pieces: Buffer.concat(pieces) };
  const rawInfo = bencode(info);
  return { content, info, rawInfo, infoHash: sha1(rawInfo), pieceLength, length, pieceCount: pieces.length };
}

function percentDecodeBytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "%") {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (text[i] === "+") {
      bytes.push(0x20);
    } else {
      bytes.push(text.charCodeAt(i));
    }
  }
  return Buffer.from(bytes);
}

/** Um enxame local: tracker HTTP + N peers que servem o arquivo. */
async function startSwarm(torrent, { peers = 2 } = {}) {
  const swarm = { violations: [], announces: [], peers: [], connections: [] };
  const violation = (message) => {
    if (!swarm.violations.includes(message)) swarm.violations.push(message);
  };

  for (let i = 0; i < peers; i++) {
    const peer = {
      id: crypto.randomBytes(20),
      metadataId: 1 + crypto.randomInt(200),
      server: null,
      port: 0,
    };
    peer.server = net.createServer((socket) => servePeer(socket, peer, torrent, swarm, violation));
    await new Promise((resolve) => peer.server.listen(0, "127.0.0.1", resolve));
    peer.port = peer.server.address().port;
    swarm.peers.push(peer);
  }

  swarm.tracker = http.createServer((req, res) => {
    const [pathname, query = ""] = req.url.split("?");
    const params = Object.fromEntries(query.split("&").filter(Boolean).map((pair) => {
      const eq = pair.indexOf("=");
      return [pair.slice(0, eq), pair.slice(eq + 1)];
    }));
    const fail = (reason) => {
      violation(`tracker: ${reason}`);
      res.end(bencode({ "failure reason": reason }));
    };
    if (!pathname.endsWith("/announce")) return fail(`caminho inesperado ${pathname}`);
    const infoHash = percentDecodeBytes(params.info_hash ?? "");
    swarm.announces.push(params);
    if (!infoHash.equals(torrent.infoHash)) return fail("info_hash ausente ou diferente (envie os 20 bytes do SHA-1, com percent-encoding)");
    if (percentDecodeBytes(params.peer_id ?? "").length !== 20) return fail("peer_id deveria ter 20 bytes");
    if (!params.port) return fail("faltou o parâmetro port");
    if (params.left === undefined) return fail("faltou o parâmetro left");
    if (params.compact !== "1") return fail("use compact=1");
    const compact = Buffer.concat(swarm.peers.map((p) => Buffer.from([127, 0, 0, 1, p.port >> 8, p.port & 0xff])));
    res.end(bencode({ interval: 60, peers: compact }));
  });
  await new Promise((resolve) => swarm.tracker.listen(0, "127.0.0.1", resolve));
  swarm.trackerUrl = `http://127.0.0.1:${swarm.tracker.address().port}/announce`;

  swarm.close = () => {
    swarm.tracker.close();
    for (const peer of swarm.peers) peer.server.close();
    for (const socket of swarm.connections) socket.destroy();
  };
  return swarm;
}

function sendMessage(socket, id, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(payload.length + 1, 0);
  header[4] = id;
  socket.write(Buffer.concat([header, payload]));
}

function sendExtension(socket, extId, dict, trailer = Buffer.alloc(0)) {
  sendMessage(socket, 20, Buffer.concat([Buffer.from([extId]), bencode(dict), trailer]));
}

function servePeer(socket, peer, torrent, swarm, violation) {
  swarm.connections.push(socket);
  const conn = {
    handshake: false, extensions: false, interested: false, unchoked: false,
    clientMetadataId: null, requests: 0,
  };
  const record = { peerPort: peer.port, conn };
  (swarm.sessions ??= []).push(record);
  let buffer = Buffer.alloc(0);
  socket.on("error", () => {});

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!conn.handshake) {
      if (buffer.length < 68) return;
      const hs = buffer.subarray(0, 68);
      buffer = buffer.subarray(68);
      if (hs[0] !== 19 || hs.subarray(1, 20).toString() !== "BitTorrent protocol") {
        violation("handshake inválido: esperava <19>BitTorrent protocol<8 bytes reservados><info_hash><peer_id>");
        return socket.destroy();
      }
      if (!hs.subarray(28, 48).equals(torrent.infoHash)) {
        violation("handshake com info_hash diferente do torrent");
        return socket.destroy();
      }
      conn.handshake = true;
      conn.extensions = (hs[25] & 0x10) !== 0;
      const reserved = Buffer.alloc(8);
      reserved[5] = 0x10;
      socket.write(Buffer.concat([Buffer.from([19]), Buffer.from("BitTorrent protocol"), reserved, torrent.infoHash, peer.id]));
      const bitfield = Buffer.alloc(Math.ceil(torrent.pieceCount / 8));
      for (let i = 0; i < torrent.pieceCount; i++) bitfield[i >> 3] |= 0x80 >> (i % 8);
      sendMessage(socket, 5, bitfield);
      if (conn.extensions) {
        sendExtension(socket, 0, { m: { ut_metadata: peer.metadataId }, metadata_size: torrent.rawInfo.length });
      }
    }
    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (buffer.length < 4 + length) return;
      const message = buffer.subarray(4, 4 + length);
      buffer = buffer.subarray(4 + length);
      if (length === 0) continue;
      handleMessage(socket, message[0], message.subarray(1));
    }
  });

  function handleMessage(socket, id, payload) {
    if (id === 2) {
      conn.interested = true;
      conn.unchoked = true;
      sendMessage(socket, 1);
      return;
    }
    if (id === 6) {
      conn.requests++;
      if (!conn.unchoked) {
        violation("request enviado antes de receber unchoke (mande interested e espere o unchoke)");
        return socket.destroy();
      }
      const index = payload.readUInt32BE(0);
      const begin = payload.readUInt32BE(4);
      const size = payload.readUInt32BE(8);
      const pieceStart = index * torrent.pieceLength;
      const pieceSize = Math.min(torrent.pieceLength, torrent.length - pieceStart);
      if (index >= torrent.pieceCount || begin + size > pieceSize || size === 0 || size > BLOCK) {
        violation(`request inválido (peça ${index}, begin ${begin}, length ${size}); blocos têm até 16384 bytes e não passam do fim da peça`);
        return socket.destroy();
      }
      const header = Buffer.alloc(8);
      header.writeUInt32BE(index, 0);
      header.writeUInt32BE(begin, 4);
      sendMessage(socket, 7, Buffer.concat([header, torrent.content.subarray(pieceStart + begin, pieceStart + begin + size)]));
      return;
    }
    if (id === 20) {
      if (!conn.extensions) {
        violation("mensagem de extensão recebida, mas o handshake não ligou o bit de extensões (byte 5 dos reservados = 0x10) — o peer não vai responder");
        return;
      }
      const extId = payload[0];
      let dict;
      try {
        dict = bdecode(payload, 1).value;
      } catch {
        violation("mensagem de extensão com bencode inválido");
        return;
      }
      if (extId === 0) {
        const m = dict.m ?? {};
        if (typeof m.ut_metadata !== "number") violation("o handshake de extensão deveria ter {\"m\": {\"ut_metadata\": <id>}}");
        else conn.clientMetadataId = m.ut_metadata;
        return;
      }
      if (extId === peer.metadataId) {
        conn.metadataRequest = { msgType: dict.msg_type, piece: dict.piece };
        if (dict.msg_type !== 0 || dict.piece !== 0) {
          violation("pedido de metadados deveria ser {\"msg_type\": 0, \"piece\": 0}");
          return;
        }
        if (conn.clientMetadataId === null) {
          violation("pedido de metadados antes do handshake de extensão do cliente");
          return;
        }
        sendExtension(socket, conn.clientMetadataId, { msg_type: 1, piece: 0, total_size: torrent.rawInfo.length }, torrent.rawInfo);
        return;
      }
      violation(`mensagem de extensão com id ${extId}; use o id que o peer anunciou para ut_metadata (${peer.metadataId})`);
    }
  }
}

function magnetFor(torrent, trackerUrl) {
  return `magnet:?xt=urn:btih:${torrent.infoHash.toString("hex")}&dn=${torrent.info.name}&tr=${encodeURIComponent(trackerUrl)}`;
}

// --------------------------------------------------------------- processos

let logs = "";

async function runProgram(ctx, args, swarm) {
  const result = await new Promise((resolve) => {
    const child = spawn("java", ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", ctx.jar, ...args], {
      cwd: ctx.tmp,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, RUN_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: "", stderr: error.message, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), timedOut });
    });
  });
  const shown = args.map((a) => (a.length > 70 ? `${a.slice(0, 70)}…` : a)).join(" ");
  logs += `$ your_program.sh ${shown}\n${result.stdout.slice(0, 1500)}${result.stderr.slice(-1500)}`;
  if (!logs.endsWith("\n")) logs += "\n";
  if (swarm?.violations.length) throw new Error(swarm.violations[0]);
  if (result.timedOut) throw new Error(`./your_program.sh ${shown} não terminou em ${RUN_TIMEOUT_MS / 1000}s`);
  if (result.code !== 0) {
    const detail = result.stderr.trim().split(/\r?\n/).slice(0, 2).join(" | ");
    throw new Error(`./your_program.sh ${shown} saiu com código ${result.code}${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout;
}

function lineValue(stdout, label) {
  const match = stdout.match(new RegExp(`^${label}:\\s*(.*?)\\s*$`, "m"));
  assert(match, `a saída deveria ter a linha "${label}: ...", foi ${preview(stdout.trim())}`);
  return match[1];
}

async function writeTorrent(ctx, torrent, announce) {
  const file = path.join(ctx.tmp, `${crypto.randomBytes(4).toString("hex")}.torrent`);
  await fs.writeFile(file, bencode({ announce, "created by": "programming-wizard", info: torrent.info }));
  return file;
}

async function withSwarm(torrent, options, fn) {
  const swarm = await startSwarm(torrent, options);
  try {
    return await fn(swarm);
  } finally {
    swarm.close();
  }
}

// ------------------------------------------------------------------- stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

/** JSON com as chaves ordenadas: a ordem das chaves de um objeto não importa. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function expectDecode(ctx, value) {
  const encoded = bencode(value).toString("utf8");
  const stdout = (await runProgram(ctx, ["decode", encoded])).trim();
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`decode ${encoded}: a saída deveria ser JSON, foi ${preview(stdout)}`);
  }
  assert(
    canonical(parsed) === canonical(toPlain(value)),
    `decode ${encoded}: esperava ${JSON.stringify(toPlain(value))}, recebeu ${stdout}`
  );
}

stage(1, "Decode bencoded strings", async (ctx) => {
  for (const value of [word(), `${word()} ${word()} ${crypto.randomInt(1000)}`]) await expectDecode(ctx, value);
});

stage(2, "Decode bencoded integers", async (ctx) => {
  for (const value of [crypto.randomInt(1, 1_000_000), -crypto.randomInt(1, 5000), 4_294_967_300]) await expectDecode(ctx, value);
});

stage(3, "Decode bencoded lists", async (ctx) => {
  await expectDecode(ctx, [word(), crypto.randomInt(1000)]);
  await expectDecode(ctx, [[crypto.randomInt(100), word()], [], word()]);
});

stage(4, "Decode bencoded dictionaries", async (ctx) => {
  await expectDecode(ctx, { [word()]: word(), zeta: crypto.randomInt(1000) });
  await expectDecode(ctx, { list: [word(), { inner: crypto.randomInt(50) }], empty: {}, name: word() });
});

stage(5, "Parse torrent file", async (ctx) => {
  const torrent = makeContent();
  const announce = `http://127.0.0.1:${1024 + crypto.randomInt(60000)}/announce`;
  const stdout = await runProgram(ctx, ["info", await writeTorrent(ctx, torrent, announce)]);
  assert(lineValue(stdout, "Tracker URL") === announce, `Tracker URL deveria ser ${announce}`);
  assert(lineValue(stdout, "Length") === String(torrent.length), `Length deveria ser ${torrent.length}`);
});

stage(6, "Calculate info hash", async (ctx) => {
  const torrent = makeContent();
  const stdout = await runProgram(ctx, ["info", await writeTorrent(ctx, torrent, "http://127.0.0.1:6969/announce")]);
  const expected = torrent.infoHash.toString("hex");
  const actual = lineValue(stdout, "Info Hash");
  assert(actual === expected, `Info Hash ${actual}, esperava ${expected} (SHA-1 do dicionário info bencodado, byte a byte)`);
});

stage(7, "Piece hashes", async (ctx) => {
  const torrent = makeContent();
  const stdout = await runProgram(ctx, ["info", await writeTorrent(ctx, torrent, "http://127.0.0.1:6969/announce")]);
  assert(lineValue(stdout, "Piece Length") === String(torrent.pieceLength), `Piece Length deveria ser ${torrent.pieceLength}`);
  const after = stdout.split(/^Piece Hashes:\s*$/m)[1];
  assert(after !== undefined, "a saída deveria ter a linha \"Piece Hashes:\" seguida de um hash por linha");
  const hashes = after.trim().split(/\s+/);
  const expected = [];
  for (let i = 0; i < torrent.pieceCount; i++) expected.push(torrent.info.pieces.subarray(i * 20, i * 20 + 20).toString("hex"));
  assert(hashes.join(",") === expected.join(","), `Piece Hashes: esperava ${expected.length} hashes (${expected[0]}...), recebeu ${preview(after.trim())}`);
});

stage(8, "Discover peers", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 3 }, async (swarm) => {
    const stdout = await runProgram(ctx, ["peers", await writeTorrent(ctx, torrent, swarm.trackerUrl)], swarm);
    for (const peer of swarm.peers) {
      assert(stdout.includes(`127.0.0.1:${peer.port}`), `a saída deveria listar o peer 127.0.0.1:${peer.port}, foi ${preview(stdout.trim())}`);
    }
  });
});

stage(9, "Peer handshake", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 1 }, async (swarm) => {
    const [peer] = swarm.peers;
    const stdout = await runProgram(ctx, ["handshake", await writeTorrent(ctx, torrent, swarm.trackerUrl), `127.0.0.1:${peer.port}`], swarm);
    const actual = lineValue(stdout, "Peer ID");
    assert(actual === peer.id.toString("hex"), `Peer ID ${actual}, esperava ${peer.id.toString("hex")} (os 20 últimos bytes do handshake do peer, em hex)`);
  });
});

stage(10, "Download a piece", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 2 }, async (swarm) => {
    const file = await writeTorrent(ctx, torrent, swarm.trackerUrl);
    for (const index of [crypto.randomInt(torrent.pieceCount - 1), torrent.pieceCount - 1]) {
      const output = path.join(ctx.tmp, `piece-${index}-${crypto.randomBytes(2).toString("hex")}`);
      await runProgram(ctx, ["download_piece", "-o", output, file, String(index)], swarm);
      const data = await fs.readFile(output).catch(() => null);
      assert(data, `download_piece não criou ${path.basename(output)}`);
      const start = index * torrent.pieceLength;
      const expected = torrent.content.subarray(start, start + torrent.pieceLength);
      assert(data.equals(expected), `a peça ${index} baixada não confere (${data.length} bytes, esperava ${expected.length})`);
    }
  });
});

stage(11, "Download the whole file", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 3 }, async (swarm) => {
    const output = path.join(ctx.tmp, torrent.info.name);
    await runProgram(ctx, ["download", "-o", output, await writeTorrent(ctx, torrent, swarm.trackerUrl)], swarm);
    const data = await fs.readFile(output).catch(() => null);
    assert(data, "download não criou o arquivo de saída");
    assert(data.equals(torrent.content), `o arquivo baixado não confere (${data.length} bytes, esperava ${torrent.length})`);
  });
});

stage(12, "Parse magnet link", async (ctx) => {
  const torrent = makeContent();
  const tracker = `http://127.0.0.1:${1024 + crypto.randomInt(60000)}/announce`;
  const stdout = await runProgram(ctx, ["magnet_parse", magnetFor(torrent, tracker)]);
  assert(lineValue(stdout, "Tracker URL") === tracker, `Tracker URL deveria ser ${tracker} (lembre de decodificar o parâmetro tr)`);
  assert(lineValue(stdout, "Info Hash") === torrent.infoHash.toString("hex"), "Info Hash deveria ser o valor depois de urn:btih:");
});

stage(13, "Announce extension support", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 1 }, async (swarm) => {
    const stdout = await runProgram(ctx, ["magnet_handshake", magnetFor(torrent, swarm.trackerUrl)], swarm);
    assert(lineValue(stdout, "Peer ID") === swarm.peers[0].id.toString("hex"), "Peer ID não confere com o do peer");
    const session = swarm.sessions?.find((s) => s.conn.handshake);
    assert(session?.conn.extensions, "o handshake deveria ligar o bit de extensões (byte 5 dos reservados = 0x10)");
  });
});

stage(14, "Send extension handshake", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 1 }, async (swarm) => {
    await runProgram(ctx, ["magnet_handshake", magnetFor(torrent, swarm.trackerUrl)], swarm);
    const session = swarm.sessions?.find((s) => s.conn.handshake);
    assert(session?.conn.clientMetadataId !== null && session?.conn.clientMetadataId !== undefined,
      "o peer não recebeu o handshake de extensão (mensagem id 20, extensão 0, {\"m\": {\"ut_metadata\": <id>}})");
  });
});

stage(15, "Receive extension handshake", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 1 }, async (swarm) => {
    const stdout = await runProgram(ctx, ["magnet_handshake", magnetFor(torrent, swarm.trackerUrl)], swarm);
    const actual = lineValue(stdout, "Peer Metadata Extension ID");
    assert(actual === String(swarm.peers[0].metadataId), `Peer Metadata Extension ID ${actual}, o peer anunciou ${swarm.peers[0].metadataId}`);
  });
});

stage(16, "Request metadata", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 1 }, async (swarm) => {
    await runProgram(ctx, ["magnet_info", magnetFor(torrent, swarm.trackerUrl)], swarm);
    const session = swarm.sessions?.find((s) => s.conn.metadataRequest);
    assert(session, `o peer não recebeu o pedido de metadados (id 20, extensão ${swarm.peers[0].metadataId}, {"msg_type": 0, "piece": 0})`);
  });
});

stage(17, "Receive metadata", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 1 }, async (swarm) => {
    const stdout = await runProgram(ctx, ["magnet_info", magnetFor(torrent, swarm.trackerUrl)], swarm);
    assert(lineValue(stdout, "Tracker URL") === swarm.trackerUrl, "Tracker URL deveria vir do magnet link");
    assert(lineValue(stdout, "Length") === String(torrent.length), `Length deveria ser ${torrent.length}`);
    assert(lineValue(stdout, "Info Hash") === torrent.infoHash.toString("hex"), "Info Hash não confere");
    assert(lineValue(stdout, "Piece Length") === String(torrent.pieceLength), `Piece Length deveria ser ${torrent.pieceLength}`);
    const first = torrent.info.pieces.subarray(0, 20).toString("hex");
    assert(stdout.includes(first), "Piece Hashes deveria listar os hashes vindos dos metadados");
  });
});

stage(18, "Download a piece", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 2 }, async (swarm) => {
    const index = torrent.pieceCount - 1;
    const output = path.join(ctx.tmp, `magnet-piece-${index}`);
    await runProgram(ctx, ["magnet_download_piece", "-o", output, magnetFor(torrent, swarm.trackerUrl), String(index)], swarm);
    const data = await fs.readFile(output).catch(() => null);
    assert(data, "magnet_download_piece não criou o arquivo de saída");
    const start = index * torrent.pieceLength;
    assert(data.equals(torrent.content.subarray(start, start + torrent.pieceLength)), `a peça ${index} baixada não confere`);
  });
});

stage(19, "Download the whole file", async (ctx) => {
  const torrent = makeContent();
  await withSwarm(torrent, { peers: 3 }, async (swarm) => {
    const output = path.join(ctx.tmp, `magnet-${torrent.info.name}`);
    await runProgram(ctx, ["magnet_download", "-o", output, magnetFor(torrent, swarm.trackerUrl)], swarm);
    const data = await fs.readFile(output).catch(() => null);
    assert(data, "magnet_download não criou o arquivo de saída");
    assert(data.equals(torrent.content), `o arquivo baixado não confere (${data.length} bytes, esperava ${torrent.length})`);
  });
});

// ------------------------------------------------------------------- runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "bittorrent.jar");
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

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pw-bittorrent-"));
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
