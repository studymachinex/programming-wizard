#!/usr/bin/env node
/**
 * Tester local do desafio Claude Code.
 *
 * Nenhum LLM de verdade é chamado: o tester sobe um servidor compatível com a API Chat
 * Completions que responde com roteiros determinísticos (texto ou chamadas de ferramenta) e
 * confere cada request — ferramentas anunciadas, histórico e resultados das ferramentas.
 * Os stages de LSP usam o language server de brinquedo em lsp-server.mjs.
 *
 * O programa roda como `java -jar target/agent.jar -p "<prompt>"` dentro de uma pasta de
 * projeto temporária, com OPENAI_BASE_URL, OPENAI_API_KEY e MODEL apontando para o mock.
 *
 * Uso:
 *   node challenges/claude-code/tests/run-stages.mjs
 *   node challenges/claude-code/tests/run-stages.mjs --dir <workspace> --no-build
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "java");
const LSP_SERVER = path.join(HERE, "lsp-server.mjs");
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const RUN_TIMEOUT_MS = 60_000;
const MODEL = "wizard-mock-1";

const WORDS = ["arcane", "crystal", "ember", "frost", "lunar", "rune", "sage", "storm", "velvet", "shadow"];

function token(prefix = "w") {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function word() {
  return WORDS[crypto.randomInt(WORDS.length)];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function preview(value, max = 120) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// -------------------------------------------------------- inspeção dos requests

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part?.text ?? "").join("");
  return "";
}

function systemText(body) {
  return body.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n");
}

function firstUser(body) {
  const message = body.messages.find((m) => m.role === "user");
  return message ? textOf(message.content) : "";
}

function toolDef(body, name) {
  return (body.tools ?? []).find((tool) => tool?.function?.name === name);
}

function requireTool(body, name, params) {
  const tool = toolDef(body, name);
  const names = (body.tools ?? []).map((t) => t?.function?.name).join(", ") || "nenhuma";
  assert(tool, `o request não anuncia a ferramenta "${name}" (ferramentas: ${names})`);
  assert(tool.type === "function", `a ferramenta "${name}" deveria ter "type": "function"`);
  const schema = tool.function.parameters ?? {};
  for (const param of params) {
    assert(schema.properties?.[param], `a ferramenta "${name}" não declara o parâmetro "${param}" em parameters.properties`);
    assert((schema.required ?? []).includes(param), `a ferramenta "${name}" deveria marcar "${param}" como required`);
  }
  return tool;
}

/** Resultados de ferramenta enviados depois da última mensagem do assistente com tool_calls. */
function latestToolResults(body) {
  const messages = body.messages;
  let index = messages.length - 1;
  while (index >= 0 && messages[index].role === "tool") index--;
  const assistant = messages[index];
  assert(
    assistant?.role === "assistant" && Array.isArray(assistant.tool_calls),
    "esperava, no fim do histórico, a mensagem do assistente com tool_calls seguida das mensagens role \"tool\""
  );
  const results = messages.slice(index + 1);
  for (const call of assistant.tool_calls) {
    const result = results.find((m) => m.tool_call_id === call.id);
    assert(result, `falta a mensagem role "tool" com tool_call_id "${call.id}" (${call.function?.name})`);
  }
  return Object.fromEntries(assistant.tool_calls.map((call) => [
    call.id,
    { name: call.function.name, content: textOf(results.find((m) => m.tool_call_id === call.id).content) },
  ]));
}

function onlyToolResult(body) {
  const results = Object.values(latestToolResults(body));
  return results[0].content;
}

function validateRequest(req, body, apiKey) {
  assert(req.url.replace(/\/+$/, "").endsWith("/chat/completions"), `esperava POST em <base>/chat/completions, recebeu ${req.method} ${req.url}`);
  assert(req.method === "POST", `esperava POST, recebeu ${req.method}`);
  assert(req.headers.authorization === `Bearer ${apiKey}`, "o header Authorization deveria ser \"Bearer <OPENAI_API_KEY>\"");
  assert(body && typeof body === "object", "o corpo do request não é um JSON válido");
  assert(body.model === MODEL, `"model" deveria ser o valor da variável MODEL (${MODEL}), recebeu ${preview(body.model)}`);
  assert(Array.isArray(body.messages) && body.messages.length > 0, "\"messages\" deveria ser uma lista não vazia");
  // Todo tool_call do histórico precisa de uma resposta role "tool".
  body.messages.forEach((message, i) => {
    for (const call of message.tool_calls ?? []) {
      const answered = body.messages.slice(i + 1).some((m) => m.role === "tool" && m.tool_call_id === call.id);
      assert(answered, `o tool_call "${call.id}" do histórico não tem resposta role "tool"`);
    }
  });
}

// ------------------------------------------------------------------ mock LLM

function toolCall(name, args) {
  return { id: `call_${crypto.randomBytes(6).toString("hex")}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

/** Uma resposta do roteiro: texto final ou chamadas de ferramenta. */
const reply = {
  text: (content) => ({ content }),
  tools: (...calls) => ({ content: null, tool_calls: calls.map(([name, args]) => toolCall(name, args)) }),
};

async function startMockLlm(handler, apiKey) {
  const state = { requests: [], error: null };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const n = state.requests.length;
      let body = null;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        // validateRequest reporta
      }
      state.requests.push(body);
      try {
        validateRequest(req, body, apiKey);
        const message = await handler(body, n);
        const finish = message.tool_calls ? "tool_calls" : "stop";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: `chatcmpl-${crypto.randomBytes(6).toString("hex")}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: MODEL,
          choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finish }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }));
      } catch (error) {
        if (!state.error) state.error = `request #${n + 1}: ${error.message}`;
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: error.message, type: "invalid_request_error" } }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, state, port: server.address().port };
}

// ---------------------------------------------------------------- projetos

async function createProject(ctx, { files = {}, skills = [], lsp = false } = {}) {
  const dir = path.join(ctx.tmp, token("project"));
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
  for (const skill of skills) {
    const skillDir = path.join(dir, ".agent", "skills", skill.dir ?? skill.name);
    await fs.mkdir(skillDir, { recursive: true });
    const meta = [`name: ${skill.name}`, `description: ${skill.description}`];
    if (skill.subagent) meta.push("subagent: true");
    await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\n${meta.join("\n")}\n---\n\n${skill.body}\n`);
    for (const [name, content] of Object.entries(skill.files ?? {})) {
      await fs.mkdir(path.dirname(path.join(skillDir, name)), { recursive: true });
      await fs.writeFile(path.join(skillDir, name), content);
    }
  }
  let lspLog = null;
  if (lsp) {
    lspLog = path.join(ctx.tmp, `${token("lsp")}.jsonl`);
    await fs.mkdir(path.join(dir, ".agent"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".agent", "lsp.json"),
      JSON.stringify({ command: process.execPath, args: [LSP_SERVER, "--log", lspLog] }, null, 2)
    );
  }
  return { dir, lspLog };
}

async function readLspLog(file) {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

let logs = "";

/** Roda o agente com um roteiro de LLM e devolve a saída e os requests recebidos. */
async function runAgent(ctx, { project, prompt, script }) {
  const apiKey = token("pw-key");
  const mock = await startMockLlm(script, apiKey);
  try {
    const result = await new Promise((resolve) => {
      const child = spawn(
        "java",
        ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", ctx.jar, "-p", prompt],
        {
          cwd: project.dir,
          env: {
            ...process.env,
            OPENAI_BASE_URL: `http://127.0.0.1:${mock.port}/v1`,
            OPENAI_API_KEY: apiKey,
            MODEL,
          },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
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
    logs += `$ your_program.sh -p ${JSON.stringify(prompt)}\n${result.stdout.slice(0, 1500)}${result.stderr.slice(-1500)}`;
    if (!logs.endsWith("\n")) logs += "\n";

    if (mock.state.error) throw new Error(mock.state.error);
    if (result.timedOut) throw new Error(`o agente não terminou em ${RUN_TIMEOUT_MS / 1000}s`);
    if (result.code !== 0) {
      const detail = result.stderr.trim().split(/\r?\n/).slice(0, 2).join(" | ");
      throw new Error(`o agente saiu com código ${result.code}${detail ? `: ${detail}` : ""}`);
    }
    assert(mock.state.requests.length > 0, "o agente não fez nenhum request para OPENAI_BASE_URL");
    return { ...result, requests: mock.state.requests };
  } finally {
    mock.server.close();
  }
}

function expectStdout(result, expected) {
  assert(
    result.stdout.includes(expected),
    `a saída deveria conter a resposta final do modelo (${JSON.stringify(expected)}), mas foi ${preview(result.stdout.trim())}`
  );
}

function expectRequests(result, count) {
  assert(
    result.requests.length === count,
    `esperava ${count} request(s) ao LLM, recebeu ${result.requests.length}`
  );
}

// ------------------------------------------------------------- projeto LSP

function lspProject() {
  const fn = `${word()}${crypto.randomBytes(2).toString("hex")}`.replace(/^./, (c) => c.toLowerCase());
  const scale = `scale${fn[0].toUpperCase()}${fn.slice(1)}`;
  const add = `add${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const files = {
    "lib/math.js": [
      `function ${add}(a, b) {`,
      "  return a + b;",
      "}",
      "",
      `function ${scale}(value, factor) {`,
      "  return value * factor;",
      "}",
      "",
    ].join("\n"),
    "main.js": [
      `const total = ${add}(2, 3);`,
      `console.log(${scale}(total, 2));`,
      `const again = ${scale}(total, 3);`,
      "",
    ].join("\n"),
    "report.js": [
      "function report(x) {",
      `  return "valor: " + ${scale}(x, 10);`,
      "}",
      "",
    ].join("\n"),
  };
  return { files, add, scale };
}

/** Posições (1-based) das chamadas de `name` nos arquivos, no formato path:linha:coluna. */
function callSites(files, name) {
  const sites = [];
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((line, i) => {
      let from = 0;
      let index;
      while ((index = line.indexOf(`${name}(`, from)) >= 0) {
        if (!/function\s+$/.test(line.slice(0, index))) sites.push(`${file}:${i + 1}:${index + 1}`);
        from = index + 1;
      }
    });
  }
  return sites;
}

// ------------------------------------------------------------------- stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

stage(1, "Communicate with the LLM", async (ctx) => {
  const project = await createProject(ctx);
  const prompt = `Diga olá para ${word()} ${token("guest")}`;
  const answer = `Olá! ${token("answer")}`;
  const result = await runAgent(ctx, {
    project,
    prompt,
    script: async (body) => {
      assert(firstUser(body) === prompt, `a primeira mensagem role "user" deveria ser o prompt ${JSON.stringify(prompt)}, recebeu ${preview(firstUser(body))}`);
      return reply.text(answer);
    },
  });
  expectRequests(result, 1);
  expectStdout(result, answer);
});

stage(2, "Advertise the read tool", async (ctx) => {
  const project = await createProject(ctx);
  const answer = token("answer");
  const result = await runAgent(ctx, {
    project,
    prompt: "Quais ferramentas você tem?",
    script: async (body) => {
      requireTool(body, "read", ["path"]);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(3, "Execute the read tool", async (ctx) => {
  const secret = `${token("secret")} ${word()} ${word()}`;
  const project = await createProject(ctx, { files: { "notes.txt": `${secret}\n` } });
  const result = await runAgent(ctx, {
    project,
    prompt: "O que tem em notes.txt?",
    script: async (body, n) => {
      if (n === 0) {
        requireTool(body, "read", ["path"]);
        return reply.tools(["read", { path: "notes.txt" }]);
      }
      // Com o loop (stage 4), o resultado volta para o modelo, que o repete como resposta final.
      return reply.text(onlyToolResult(body));
    },
  });
  expectStdout(result, secret);
});

stage(4, "Implement the agent loop", async (ctx) => {
  const second = `${token("part")}.txt`;
  const third = token("final");
  const project = await createProject(ctx, {
    files: {
      "start.txt": `continue em ${second}\n`,
      "extra.txt": `extra ${token("extra")}\n`,
      [second]: `${third}\n`,
    },
  });
  const missing = `${token("missing")}.txt`;
  const answer = `resposta: ${third}`;
  const result = await runAgent(ctx, {
    project,
    prompt: "Siga as pistas a partir de start.txt",
    script: async (body, n) => {
      if (n === 0) return reply.tools(["read", { path: "start.txt" }], ["read", { path: "extra.txt" }]);
      if (n === 1) {
        const results = Object.values(latestToolResults(body));
        assert(results.length === 2, `esperava 2 resultados de ferramenta (2 chamadas no mesmo turno), recebeu ${results.length}`);
        assert(results.some((r) => r.content.includes(`continue em ${second}`)), "o resultado de read start.txt não tem o conteúdo do arquivo");
        return reply.tools(["read", { path: second }]);
      }
      if (n === 2) {
        assert(onlyToolResult(body).includes(third), `o resultado de read ${second} não tem o conteúdo do arquivo`);
        assert(body.messages.some((m) => m.role === "tool" && textOf(m.content).includes("continue em")),
          "o histórico perdeu os resultados das ferramentas anteriores");
        return reply.tools(["read", { path: missing }]);
      }
      const error = onlyToolResult(body);
      assert(error.trim().length > 0, `ler um arquivo inexistente deveria devolver uma mensagem de erro como resultado, não ${preview(error)}`);
      return reply.text(answer);
    },
  });
  expectRequests(result, 4);
  expectStdout(result, answer);
});

stage(5, "Implement the write tool", async (ctx) => {
  const project = await createProject(ctx);
  const target = `docs/${token("notes")}.md`;
  const content = `# ${word()}\n\n${token("line")}\nsegunda linha\n`;
  const answer = token("written");
  const result = await runAgent(ctx, {
    project,
    prompt: "Crie as notas",
    script: async (body, n) => {
      if (n === 0) {
        requireTool(body, "write", ["path", "content"]);
        return reply.tools(["write", { path: target, content }]);
      }
      onlyToolResult(body);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
  const written = await fs.readFile(path.join(project.dir, target), "utf8").catch(() => null);
  assert(written !== null, `o arquivo ${target} não foi criado (crie os diretórios que faltarem)`);
  assert(written === content, `o conteúdo de ${target} não bate com o pedido pelo modelo`);
});

stage(6, "Implement the bash tool", async (ctx) => {
  const marker = token("marker");
  const project = await createProject(ctx, { files: { "marker.txt": marker } });
  const answer = token("ran");
  const result = await runAgent(ctx, {
    project,
    prompt: "Rode os comandos",
    script: async (body, n) => {
      if (n === 0) {
        requireTool(body, "bash", ["command"]);
        return reply.tools(["bash", { command: "node -e \"console.log(require('fs').readFileSync('marker.txt','utf8'))\"" }]);
      }
      if (n === 1) {
        const output = onlyToolResult(body);
        assert(output.includes(marker), `a saída do comando deveria conter ${marker} (o comando roda no diretório do projeto?), recebeu ${preview(output)}`);
        return reply.tools(["bash", { command: "node -e \"process.exit(3)\"" }]);
      }
      const output = onlyToolResult(body);
      assert(/exit code:\s*3/i.test(output), `o resultado deveria informar o código de saída ("exit code: 3"), recebeu ${preview(output)}`);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

function randomSkill(extra = {}) {
  const name = `${word()}-${crypto.randomBytes(2).toString("hex")}`;
  return {
    name,
    description: `Faz ${word()} ${token("desc")}`,
    body: `Instruções da skill ${name}: ${token("body")}.`,
    ...extra,
  };
}

stage(7, "Advertise skills to the LLM", async (ctx) => {
  const skills = [randomSkill(), randomSkill(), randomSkill()];
  const project = await createProject(ctx, { skills });
  const answer = token("answer");
  const result = await runAgent(ctx, {
    project,
    prompt: "Quais skills você conhece?",
    script: async (body) => {
      const system = systemText(body);
      assert(system, "esperava uma mensagem role \"system\" listando as skills");
      for (const skill of skills) {
        const line = system.split("\n").find((l) => l.includes(skill.name));
        assert(line, `a mensagem de sistema não menciona a skill "${skill.name}"`);
        assert(line.includes(skill.description), `a linha da skill "${skill.name}" deveria trazer a descrição: ${skill.description}`);
      }
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(8, "Invoke a skill by name", async (ctx) => {
  const skill = randomSkill();
  const project = await createProject(ctx, { skills: [skill, randomSkill()] });
  const answer = token("done");
  const result = await runAgent(ctx, {
    project,
    prompt: `/${skill.name}`,
    script: async (body) => {
      const user = firstUser(body);
      assert(user.includes(skill.body), `/${skill.name} deveria enviar o corpo do SKILL.md como mensagem do usuário, recebeu ${preview(user)}`);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(9, "Pass arguments to a skill", async (ctx) => {
  const args = `${word()} ${token("arg")}`;
  const skill = randomSkill({ body: "Traduza para o élfico: $ARGUMENTS." });
  const project = await createProject(ctx, { skills: [skill] });
  const answer = token("done");
  const result = await runAgent(ctx, {
    project,
    prompt: `/${skill.name} ${args}`,
    script: async (body) => {
      const user = firstUser(body);
      assert(user.includes(`Traduza para o élfico: ${args}.`), `$ARGUMENTS deveria virar "${args}", mensagem recebida: ${preview(user)}`);
      assert(!user.includes("$ARGUMENTS"), "o placeholder $ARGUMENTS não foi substituído");
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(10, "Stack multiple skills", async (ctx) => {
  const args = token("topic");
  const first = randomSkill({ body: `Primeiro: pesquise $ARGUMENTS. ${token("a")}` });
  const second = randomSkill({ body: `Depois: resuma $ARGUMENTS. ${token("b")}` });
  const project = await createProject(ctx, { skills: [first, second, randomSkill()] });
  const answer = token("done");
  const result = await runAgent(ctx, {
    project,
    prompt: `/${first.name} /${second.name} ${args}`,
    script: async (body) => {
      const user = firstUser(body);
      const a = first.body.replace("$ARGUMENTS", args);
      const b = second.body.replace("$ARGUMENTS", args);
      assert(user.includes(a), `faltou o corpo de /${first.name} com os argumentos: ${preview(a)}`);
      assert(user.includes(b), `faltou o corpo de /${second.name} com os argumentos: ${preview(b)}`);
      assert(user.indexOf(a) < user.indexOf(b), "os corpos das skills deveriam vir na ordem dos comandos");
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(11, "Run a script bundled with a skill", async (ctx) => {
  const lines = 3 + crypto.randomInt(8);
  const salt = token("salt");
  const skill = randomSkill({
    body: 'Conte as linhas executando: node "${SKILL_DIR}/scripts/count.mjs" $ARGUMENTS',
    files: {
      "scripts/count.mjs": [
        'import fs from "node:fs";',
        "const file = process.argv[2];",
        'const lines = fs.readFileSync(file, "utf8").split("\\n").filter(Boolean).length;',
        `console.log(\`lines=\${lines} ${salt}\`);`,
        "",
      ].join("\n"),
    },
  });
  const project = await createProject(ctx, {
    skills: [skill],
    files: { "data.txt": Array.from({ length: lines }, () => word()).join("\n") + "\n" },
  });
  const answer = token("counted");
  const result = await runAgent(ctx, {
    project,
    prompt: `/${skill.name} data.txt`,
    script: async (body, n) => {
      if (n === 0) {
        const user = firstUser(body);
        const match = user.match(/executando: (.+)$/m);
        assert(match, `a mensagem deveria conter o corpo da skill, recebeu ${preview(user)}`);
        const command = match[1].trim();
        assert(!command.includes("${SKILL_DIR}"), "${SKILL_DIR} deveria ser trocado pelo caminho absoluto da pasta da skill");
        return reply.tools(["bash", { command }]);
      }
      const output = onlyToolResult(body);
      assert(output.includes(`lines=${lines} ${salt}`), `o script da skill deveria imprimir "lines=${lines} ${salt}", o resultado foi ${preview(output)}`);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(12, "Let the model choose a skill", async (ctx) => {
  const chosen = randomSkill();
  const project = await createProject(ctx, { skills: [randomSkill(), chosen] });
  const answer = token("chosen");
  const result = await runAgent(ctx, {
    project,
    prompt: `Preciso de ajuda com ${word()}`,
    script: async (body, n) => {
      if (n === 0) {
        requireTool(body, "skill", ["name"]);
        return reply.tools(["skill", { name: chosen.name }]);
      }
      const output = onlyToolResult(body);
      assert(output.includes(chosen.body), `a ferramenta skill deveria devolver o corpo do SKILL.md de ${chosen.name}, devolveu ${preview(output)}`);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(13, "Run a skill in a subagent", async (ctx) => {
  const secretFile = `${token("secret")}.txt`;
  const secret = token("classified");
  const skill = randomSkill({ subagent: true, body: `Leia ${secretFile} e responda só com um resumo.` });
  const project = await createProject(ctx, { skills: [skill], files: { [secretFile]: `${secret}\n` } });
  const prompt = `Use a skill ${skill.name} ${token("main")}`;
  const summary = `SUB ${token("summary")}`;
  const answer = token("final");
  const result = await runAgent(ctx, {
    project,
    prompt,
    script: async (body, n) => {
      if (n === 0) return reply.tools(["skill", { name: skill.name }]);
      if (n === 1) {
        const users = body.messages.filter((m) => m.role === "user").map((m) => textOf(m.content));
        assert(users.some((u) => u.includes(skill.body)), "o subagente deveria começar com o corpo da skill como mensagem do usuário");
        assert(!body.messages.some((m) => textOf(m.content).includes(prompt)), "o subagente deveria começar uma conversa nova, sem o histórico do agente principal");
        return reply.tools(["read", { path: secretFile }]);
      }
      if (n === 2) {
        assert(onlyToolResult(body).includes(secret), "o subagente deveria executar ferramentas normalmente");
        return reply.text(summary);
      }
      const output = onlyToolResult(body);
      assert(output.includes(summary), `a ferramenta skill deveria devolver a resposta final do subagente (${summary}), devolveu ${preview(output)}`);
      assert(!body.messages.some((m) => textOf(m.content).includes(secret)), "o histórico principal não deveria receber as mensagens internas do subagente");
      return reply.text(answer);
    },
  });
  expectRequests(result, 4);
  expectStdout(result, answer);
});

stage(14, "Add the LSP tool", async (ctx) => {
  const { files } = lspProject();
  const project = await createProject(ctx, { files, lsp: true });
  const answer = token("lsp");
  const result = await runAgent(ctx, {
    project,
    prompt: "Algum erro em main.js?",
    script: async (body, n) => {
      if (n === 0) {
        const tool = requireTool(body, "lsp", ["operation", "path"]);
        const operation = tool.function.parameters.properties.operation;
        for (const op of ["definition", "references", "diagnostics"]) {
          assert(JSON.stringify(operation).includes(op), `o parâmetro "operation" da ferramenta lsp deveria aceitar "${op}"`);
        }
        return reply.tools(["lsp", { operation: "diagnostics", path: "main.js" }]);
      }
      const output = onlyToolResult(body);
      assert(!/undefined function/.test(output), `main.js não tem erros, mas o resultado foi ${preview(output)}`);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
  const log = await readLspLog(project.lspLog);
  const methods = log.map((entry) => entry.method);
  assert(methods.includes("initialize"), "o language server não recebeu \"initialize\"");
  assert(methods.indexOf("initialized") > methods.indexOf("initialize"), "depois da resposta do initialize, envie a notificação \"initialized\"");
  assert(log.some((e) => e.method === "textDocument/didOpen" && e.uri?.endsWith("main.js")), "abra main.js no servidor com textDocument/didOpen antes de consultar");
});

stage(15, "Find the implementation", async (ctx) => {
  const { files, add } = lspProject();
  const project = await createProject(ctx, { files, lsp: true });
  const column = files["main.js"].split("\n")[0].indexOf(add) + 2;
  const expected = `lib/math.js:1:${"function ".length + 1}`;
  const answer = token("found");
  const result = await runAgent(ctx, {
    project,
    prompt: `Onde está implementada ${add}?`,
    script: async (body, n) => {
      if (n === 0) return reply.tools(["lsp", { operation: "definition", path: "main.js", line: 1, character: column }]);
      const output = onlyToolResult(body);
      assert(output.includes(expected), `definition de ${add} deveria apontar para ${expected}, resultado: ${preview(output)}`);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(16, "Find the affected callers", async (ctx) => {
  const { files, scale } = lspProject();
  const project = await createProject(ctx, { files, lsp: true });
  const expected = callSites(files, scale);
  const [line, column] = expected.find((site) => site.startsWith("main.js")).split(":").slice(1).map(Number);
  const answer = token("callers");
  const result = await runAgent(ctx, {
    project,
    prompt: `Quem chama ${scale}?`,
    script: async (body, n) => {
      if (n === 0) return reply.tools(["lsp", { operation: "references", path: "main.js", line, character: column }]);
      const output = onlyToolResult(body);
      for (const site of expected) {
        assert(output.includes(site), `references de ${scale} deveria incluir ${site} (formato caminho:linha:coluna), resultado: ${preview(output)}`);
      }
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(17, "Keep the analysis current", async (ctx) => {
  const { files, scale } = lspProject();
  const project = await createProject(ctx, { files, lsp: true });
  const before = callSites(files, scale);
  const updated = `${files["report.js"]}const extra = ${scale}(1, 1);\n`;
  const after = callSites({ ...files, "report.js": updated }, scale);
  const added = after.find((site) => !before.includes(site));
  const [line, column] = before.find((site) => site.startsWith("main.js")).split(":").slice(1).map(Number);
  const query = ["lsp", { operation: "references", path: "main.js", line, character: column }];
  const answer = token("current");
  const result = await runAgent(ctx, {
    project,
    prompt: `Adicione uma chamada a ${scale} em report.js e confira os chamadores`,
    script: async (body, n) => {
      if (n === 0) return reply.tools(query);
      if (n === 1) {
        const output = onlyToolResult(body);
        assert(before.every((site) => output.includes(site)), `a primeira consulta deveria listar ${before.join(", ")}, resultado: ${preview(output)}`);
        return reply.tools(["write", { path: "report.js", content: updated }]);
      }
      if (n === 2) {
        onlyToolResult(body);
        return reply.tools(query);
      }
      const output = onlyToolResult(body);
      assert(
        output.includes(added),
        `depois do write, references deveria incluir a nova chamada ${added} — avise o servidor da mudança (didOpen/didChange). Resultado: ${preview(output)}`
      );
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

stage(18, "Repair edits with diagnostics", async (ctx) => {
  const { files, add } = lspProject();
  const project = await createProject(ctx, { files, lsp: true });
  const ghost = `ghost${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const broken = `const total = ${ghost}(2, 3);\nconsole.log(total);\n`;
  const fixed = `const total = ${add}(2, 3);\nconsole.log(total);\n`;
  const answer = token("repaired");
  const result = await runAgent(ctx, {
    project,
    prompt: "Refatore main.js",
    script: async (body, n) => {
      if (n === 0) return reply.tools(["write", { path: "main.js", content: broken }]);
      if (n === 1) {
        const output = onlyToolResult(body);
        assert(
          output.includes(`undefined function '${ghost}'`),
          `o resultado do write deveria trazer os diagnostics do language server ("undefined function '${ghost}'"), recebeu ${preview(output)}`
        );
        return reply.tools(["write", { path: "main.js", content: fixed }]);
      }
      const output = onlyToolResult(body);
      assert(!output.includes("undefined function"), `depois da correção não deveria haver erros, mas o resultado foi ${preview(output)}`);
      return reply.text(answer);
    },
  });
  expectStdout(result, answer);
});

// ------------------------------------------------------------------- runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "agent.jar");
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

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pw-agent-"));
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
    console.log(`\nSaída do agente:\n${result.logs.slice(-4000)}`);
    process.exitCode = 1;
  }
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(`\n💥 ${error.message}`);
    process.exit(1);
  });
}
