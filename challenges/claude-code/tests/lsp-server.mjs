#!/usr/bin/env node
/**
 * Language server de brinquedo usado pelo tester do desafio Claude Code.
 *
 * Linguagem: arquivos .js com declarações `function nome(` e chamadas `nome(`.
 * Suporta initialize, didOpen, didChange (sincronização completa), definition,
 * references, shutdown/exit e publica diagnostics ("undefined function 'x'").
 *
 * Importante: os arquivos do projeto são lidos do disco só no `initialize`. Depois disso o
 * servidor só conhece o que o cliente enviar por didOpen/didChange — como um servidor real.
 *
 * Uso: node lsp-server.mjs --log <arquivo.jsonl>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const logIndex = process.argv.indexOf("--log");
const logFile = logIndex >= 0 ? process.argv[logIndex + 1] : null;
const KEYWORDS = new Set(["if", "for", "while", "switch", "return", "function", "catch", "typeof", "new"]);

/** uri canônica → { uri (como o cliente enviou), text, version } */
const documents = new Map();

function log(entry) {
  if (logFile) fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
}

function key(uri) {
  let file = fileURLToPath(uri);
  file = path.resolve(file);
  return process.platform === "win32" ? file.toLowerCase() : file;
}

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function indexWorkspace(rootUri) {
  const root = fileURLToPath(rootUri);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) {
        const uri = pathToFileURL(full).href;
        documents.set(key(uri), { uri, text: fs.readFileSync(full, "utf8"), version: 0 });
      }
    }
  };
  walk(root);
}

/** Declarações e chamadas de um documento. */
function analyze(text) {
  const declarations = [];
  const calls = [];
  text.split(/\r?\n/).forEach((line, lineNumber) => {
    const regex = /([A-Za-z_$][\w$]*)\s*\(/g;
    let match;
    while ((match = regex.exec(line))) {
      const name = match[1];
      const column = match.index;
      const before = line.slice(0, column);
      if (KEYWORDS.has(name)) continue;
      if (/function\s+$/.test(before)) declarations.push({ name, line: lineNumber, character: column });
      else if (!/[.\w$]$/.test(before)) calls.push({ name, line: lineNumber, character: column });
    }
  });
  return { declarations, calls };
}

function location(doc, item) {
  return {
    uri: doc.uri,
    range: {
      start: { line: item.line, character: item.character },
      end: { line: item.line, character: item.character + item.name.length },
    },
  };
}

function identifierAt(doc, position) {
  const line = doc.text.split(/\r?\n/)[position.line] ?? "";
  const regex = /[A-Za-z_$][\w$]*/g;
  let match;
  while ((match = regex.exec(line))) {
    if (position.character >= match.index && position.character <= match.index + match[0].length) return match[0];
  }
  return null;
}

function publishDiagnostics(docKey) {
  const doc = documents.get(docKey);
  const declared = new Set();
  for (const other of documents.values()) analyze(other.text).declarations.forEach((d) => declared.add(d.name));
  const diagnostics = analyze(doc.text)
    .calls.filter((call) => !declared.has(call.name))
    .map((call) => ({
      range: location(doc, call).range,
      severity: 1,
      source: "wizard-lsp",
      message: `undefined function '${call.name}'`,
    }));
  send({
    method: "textDocument/publishDiagnostics",
    params: { uri: doc.uri, version: doc.version, diagnostics },
  });
}

function handle(message) {
  const { id, method, params } = message;
  log({ method, id, uri: params?.textDocument?.uri, version: params?.textDocument?.version });

  switch (method) {
    case "initialize":
      if (params?.rootUri) indexWorkspace(params.rootUri);
      send({
        id,
        result: {
          capabilities: { textDocumentSync: 1, definitionProvider: true, referencesProvider: true },
          serverInfo: { name: "wizard-lsp", version: "1.0.0" },
        },
      });
      return;
    case "initialized":
      return;
    case "textDocument/didOpen": {
      const { uri, text, version } = params.textDocument;
      documents.set(key(uri), { uri, text, version: version ?? 0 });
      publishDiagnostics(key(uri));
      return;
    }
    case "textDocument/didChange": {
      const { uri, version } = params.textDocument;
      const text = params.contentChanges.at(-1).text;
      documents.set(key(uri), { uri, text, version: version ?? 0 });
      publishDiagnostics(key(uri));
      return;
    }
    case "textDocument/definition": {
      const doc = documents.get(key(params.textDocument.uri));
      const name = doc && identifierAt(doc, params.position);
      const results = [];
      if (name) {
        for (const other of documents.values()) {
          for (const declaration of analyze(other.text).declarations) {
            if (declaration.name === name) results.push(location(other, declaration));
          }
        }
      }
      send({ id, result: results });
      return;
    }
    case "textDocument/references": {
      const doc = documents.get(key(params.textDocument.uri));
      const name = doc && identifierAt(doc, params.position);
      const results = [];
      if (name) {
        for (const other of documents.values()) {
          const { declarations, calls } = analyze(other.text);
          for (const call of calls) if (call.name === name) results.push(location(other, call));
          if (params.context?.includeDeclaration) {
            for (const d of declarations) if (d.name === name) results.push(location(other, d));
          }
        }
      }
      send({ id, result: results });
      return;
    }
    case "shutdown":
      send({ id, result: null });
      return;
    case "exit":
      process.exit(0);
      return;
    default:
      if (id !== undefined) send({ id, error: { code: -32601, message: `método não suportado: ${method}` } });
  }
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = header.match(/content-length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    if (buffer.length < headerEnd + 4 + length) return;
    const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString("utf8");
    buffer = buffer.subarray(headerEnd + 4 + length);
    try {
      handle(JSON.parse(body));
    } catch (error) {
      log({ error: error.message });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
