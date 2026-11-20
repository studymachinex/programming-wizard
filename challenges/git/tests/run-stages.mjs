#!/usr/bin/env node
/**
 * Tester local do desafio Git.
 *
 * Cada stage roda o programa do usuário em uma pasta temporária e confere o
 * resultado usando o git de verdade como oráculo. O stage de clone sobe um
 * servidor smart HTTP local (git http-backend) — não precisa de internet.
 *
 * Uso:
 *   node challenges/git/tests/run-stages.mjs
 *   node challenges/git/tests/run-stages.mjs --dir <workspace> --no-build
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
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const COMMAND_TIMEOUT_MS = 20_000;

const WORDS = [
  "apple", "banana", "blueberry", "grape", "mango", "orange", "pear", "pineapple",
  "raspberry", "strawberry", "monkey", "donkey", "horsey", "scooby", "dooby", "yikes",
  "vanilla", "humpty", "dumpty", "pumpkin", "wizard", "spell", "potion", "scroll",
];

function randomWord() {
  return WORDS[crypto.randomInt(WORDS.length)];
}

function randomWords(count) {
  return Array.from({ length: count }, randomWord).join(" ");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ----------------------------------------------------------------- processes

class Sandbox {
  constructor(root) {
    this.root = root;
    this.configFile = path.join(root, "empty.gitconfig");
    this.logs = "";
  }

  static async create() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pw-git-"));
    const sandbox = new Sandbox(root);
    await fs.writeFile(sandbox.configFile, "");
    return sandbox;
  }

  /** Ambiente isolado: ignora a config global/do sistema e nunca sobe para repositórios pais. */
  gitEnv(extra = {}) {
    // Dentro do hook post-receive o git exporta GIT_DIR, GIT_QUARANTINE_PATH etc.
    // Elas apontariam o git real (e o programa do usuário) para o remote bare.
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith("GIT_"))
    );
    return {
      ...inherited,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: this.configFile,
      GIT_CEILING_DIRECTORIES: this.root,
      GIT_AUTHOR_NAME: "Tester",
      GIT_AUTHOR_EMAIL: "tester@programming.local",
      GIT_COMMITTER_NAME: "Tester",
      GIT_COMMITTER_EMAIL: "tester@programming.local",
      GIT_TERMINAL_PROMPT: "0",
      ...extra,
    };
  }

  async dir(name) {
    const dir = path.join(this.root, `${name}-${crypto.randomBytes(3).toString("hex")}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  git(cwd, args, { allowFailure = false } = {}) {
    const result = spawnSync("git", args, {
      cwd,
      env: this.gitEnv(),
      encoding: "buffer",
      timeout: COMMAND_TIMEOUT_MS,
    });
    const stdout = result.stdout?.toString("utf8") ?? "";
    const stderr = result.stderr?.toString("utf8") ?? "";
    if (result.status !== 0 && !allowFailure) {
      throw new Error(`(tester) git ${args.join(" ")} falhou: ${stderr.trim() || result.error?.message}`);
    }
    return { code: result.status, stdout, stderr, raw: result.stdout ?? Buffer.alloc(0) };
  }

  async gitInit(cwd) {
    this.git(cwd, ["init", "-q", "-b", "main"]);
  }

  /** Executa o programa do usuário: `java -jar target/git.jar <args>` com cwd = pasta do teste. */
  program(jar, cwd, args) {
    return new Promise((resolve) => {
      const child = spawn("java", ["-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-jar", jar, ...args], {
        cwd,
        env: this.gitEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout = [];
      const stderr = [];
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, COMMAND_TIMEOUT_MS);
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout: "", stderr: error.message, raw: Buffer.alloc(0), timedOut });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const raw = Buffer.concat(stdout);
        const err = Buffer.concat(stderr).toString("utf8");
        this.logs += `$ your_program.sh ${args.join(" ")}\n${raw.toString("utf8")}${err}`;
        if (!this.logs.endsWith("\n")) this.logs += "\n";
        resolve({ code, stdout: raw.toString("utf8"), stderr: err, raw, timedOut });
      });
    });
  }
}

async function runOk(sandbox, ctx, cwd, args) {
  const result = await sandbox.program(ctx.jar, cwd, args);
  const command = `./your_program.sh ${args.join(" ")}`;
  if (result.timedOut) throw new Error(`${command} não terminou em ${COMMAND_TIMEOUT_MS / 1000}s`);
  if (result.code !== 0) {
    const detail = result.stderr.trim().split(/\r?\n/).slice(-3).join(" | ");
    throw new Error(`${command} saiu com código ${result.code}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Cria uma árvore de arquivos aleatória: alguns arquivos na raiz e diretórios aninhados. */
async function writeRandomTree(dir) {
  const files = [];
  const used = new Set();
  const uniqueName = (prefix = "") => {
    let name;
    do name = `${prefix}${randomWord()}${crypto.randomInt(100)}`;
    while (used.has(name));
    used.add(name);
    return name;
  };
  for (let i = 0; i < 2; i++) {
    const file = `${uniqueName()}.txt`;
    await fs.writeFile(path.join(dir, file), `${randomWords(6)}\n`);
    files.push(file);
  }
  for (let i = 0; i < 2; i++) {
    const sub = uniqueName();
    await fs.mkdir(path.join(dir, sub, "nested"), { recursive: true });
    await fs.writeFile(path.join(dir, sub, `${uniqueName()}.md`), `# ${randomWords(3)}\n`);
    await fs.writeFile(path.join(dir, sub, "nested", `${uniqueName()}.txt`), randomWords(8));
    files.push(sub);
  }
  // Diretório vazio: o git ignora e o seu write-tree também deve ignorar.
  await fs.mkdir(path.join(dir, uniqueName("empty-")), { recursive: true });
  return files;
}

// --------------------------------------------------------- servidor smart HTTP

function httpBackendPath() {
  const exec = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout.trim();
  const name = process.platform === "win32" ? "git-http-backend.exe" : "git-http-backend";
  return path.join(exec, name);
}

/** Servidor HTTP mínimo que encaminha as requests para o CGI `git http-backend`. */
async function startGitHttpServer(sandbox, projectRoot) {
  const backend = httpBackendPath();
  if (!(await exists(backend))) {
    throw new Error(`(tester) git-http-backend não encontrado em ${backend}`);
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const body = [];
    req.on("data", (chunk) => body.push(chunk));
    req.on("end", () => {
      const input = Buffer.concat(body);
      const child = spawn(backend, [], {
        env: sandbox.gitEnv({
          GIT_PROJECT_ROOT: projectRoot,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: decodeURIComponent(url.pathname),
          QUERY_STRING: url.search.slice(1),
          REQUEST_METHOD: req.method,
          CONTENT_TYPE: req.headers["content-type"] ?? "",
          CONTENT_LENGTH: String(input.length),
          REMOTE_ADDR: "127.0.0.1",
          SERVER_PROTOCOL: "HTTP/1.1",
          GATEWAY_INTERFACE: "CGI/1.1",
          ...(req.headers["git-protocol"] ? { GIT_PROTOCOL: req.headers["git-protocol"] } : {}),
        }),
        stdio: ["pipe", "pipe", "pipe"],
      });
      const out = [];
      child.stdout.on("data", (chunk) => out.push(chunk));
      child.stderr.on("data", (chunk) => {
        sandbox.logs += `[git-http-backend] ${chunk}`;
      });
      child.on("close", () => {
        const raw = Buffer.concat(out);
        let split = raw.indexOf("\r\n\r\n");
        let sepLength = 4;
        if (split < 0) {
          split = raw.indexOf("\n\n");
          sepLength = 2;
        }
        if (split < 0) {
          res.writeHead(500);
          res.end("bad cgi response");
          return;
        }
        let status = 200;
        const headers = {};
        for (const line of raw.subarray(0, split).toString("latin1").split(/\r?\n/)) {
          const colon = line.indexOf(":");
          if (colon <= 0) continue;
          const name = line.slice(0, colon).trim();
          const value = line.slice(colon + 1).trim();
          if (name.toLowerCase() === "status") status = Number.parseInt(value, 10);
          else headers[name] = value;
        }
        res.writeHead(status, headers);
        res.end(raw.subarray(split + sepLength));
      });
      child.stdin.end(input);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
}

/** Repositório de origem com histórico, diretórios e arquivos parecidos (gera deltas no pack). */
async function createSourceRepo(sandbox, root) {
  const repo = path.join(root, "wizard-sample.git");
  const work = await sandbox.dir("source-work");
  await sandbox.gitInit(work);

  const base = Array.from({ length: 120 }, (_, i) => `linha ${i}: ${randomWords(8)}`);
  await fs.mkdir(path.join(work, "src", "spells"), { recursive: true });
  await fs.mkdir(path.join(work, "docs"), { recursive: true });

  for (let version = 1; version <= 5; version++) {
    const lines = [...base];
    for (let i = 0; i < version * 3; i++) lines[crypto.randomInt(lines.length)] = `v${version}: ${randomWords(6)}`;
    await fs.writeFile(path.join(work, "README.md"), `# Wizard sample v${version}\n\n${lines.slice(0, 20).join("\n")}\n`);
    await fs.writeFile(path.join(work, "src", "grimoire.txt"), `${lines.join("\n")}\n`);
    await fs.writeFile(path.join(work, "src", "spells", `spell-${version}.txt`), `${randomWords(20)}\n`);
    await fs.writeFile(path.join(work, "docs", "changelog.md"), `${Array.from({ length: version }, (_, i) => `- v${i + 1}`).join("\n")}\n`);
    sandbox.git(work, ["add", "-A"]);
    sandbox.git(work, ["commit", "-q", "-m", `version ${version}: ${randomWords(3)}`]);
  }

  sandbox.git(root, ["clone", "-q", "--bare", work, repo]);
  // Repack agressivo para garantir objetos em delta no packfile servido.
  sandbox.git(repo, ["repack", "-a", "-d", "-f", "-q", "--depth=50", "--window=50"]);
  const packDir = path.join(repo, "objects", "pack");
  const idx = (await fs.readdir(packDir)).find((name) => name.endsWith(".idx"));
  const verify = sandbox.git(repo, ["verify-pack", "-v", path.join(packDir, idx)]).stdout;
  const deltas = verify.split("\n").filter((line) => /^[0-9a-f]{40} \w+ +\d+ \d+ \d+ \d+ [0-9a-f]{40}/.test(line));
  if (deltas.length === 0) throw new Error("(tester) o repositório de origem não gerou deltas no packfile");
  const head = sandbox.git(repo, ["rev-parse", "HEAD"]).stdout.trim();
  return { repo, name: path.basename(repo), head };
}

// ------------------------------------------------------------------ stages

const tests = [];
function stage(number, title, run) {
  tests.push({ number, title, run });
}

stage(1, "Initialize the .git directory", async (ctx, sandbox) => {
  const dir = await sandbox.dir("init");
  await runOk(sandbox, ctx, dir, ["init"]);

  for (const entry of [".git", ".git/objects", ".git/refs"]) {
    const stat = await fs.stat(path.join(dir, entry)).catch(() => null);
    assert(stat?.isDirectory(), `esperava o diretório ${entry} depois de "init"`);
  }
  const headFile = path.join(dir, ".git", "HEAD");
  assert(await exists(headFile), "esperava o arquivo .git/HEAD depois de \"init\"");
  const head = await fs.readFile(headFile, "utf8");
  assert(
    /^ref: refs\/heads\/[\w.-]+\n?$/.test(head),
    `.git/HEAD deveria conter "ref: refs/heads/main\\n", mas contém ${JSON.stringify(head)}`
  );

  const check = sandbox.git(dir, ["rev-parse", "--git-dir"], { allowFailure: true });
  assert(check.code === 0, `o git real não reconheceu o repositório: ${check.stderr.trim()}`);
});

stage(2, "Read a blob object", async (ctx, sandbox) => {
  const dir = await sandbox.dir("cat-file");
  await sandbox.gitInit(dir);
  const content = randomWords(crypto.randomInt(4, 9));
  const file = path.join(dir, "temp.txt");
  await fs.writeFile(file, content);
  const sha = sandbox.git(dir, ["hash-object", "-w", "temp.txt"]).stdout.trim();
  await fs.rm(file);

  const result = await runOk(sandbox, ctx, dir, ["cat-file", "-p", sha]);
  assert(
    result.raw.equals(Buffer.from(content)),
    `cat-file -p ${sha}: esperava ${JSON.stringify(content)}, recebeu ${JSON.stringify(result.stdout)}` +
      (result.stdout === `${content}\n` ? " (não imprima uma quebra de linha extra)" : "")
  );
});

stage(3, "Create a blob object", async (ctx, sandbox) => {
  const dir = await sandbox.dir("hash-object");
  await sandbox.gitInit(dir);
  const content = `${randomWords(crypto.randomInt(4, 9))}\n`;
  await fs.writeFile(path.join(dir, "spell.txt"), content);
  const expected = sandbox.git(dir, ["hash-object", "spell.txt"]).stdout.trim();

  const result = await runOk(sandbox, ctx, dir, ["hash-object", "-w", "spell.txt"]);
  const sha = result.stdout.trim();
  assert(sha === expected, `hash-object -w: esperava o SHA ${expected}, recebeu ${JSON.stringify(sha)}`);

  const objectFile = path.join(dir, ".git", "objects", sha.slice(0, 2), sha.slice(2));
  assert(await exists(objectFile), `o objeto não foi gravado em .git/objects/${sha.slice(0, 2)}/${sha.slice(2)}`);
  const stored = sandbox.git(dir, ["cat-file", "-p", sha], { allowFailure: true });
  assert(stored.code === 0, `o git real não conseguiu ler o objeto gravado: ${stored.stderr.trim()}`);
  assert(stored.stdout === content, "o conteúdo gravado no objeto não bate com o arquivo");
});

stage(4, "Read a tree object", async (ctx, sandbox) => {
  const dir = await sandbox.dir("ls-tree");
  await sandbox.gitInit(dir);
  await writeRandomTree(dir);
  sandbox.git(dir, ["add", "-A"]);
  const tree = sandbox.git(dir, ["write-tree"]).stdout.trim();
  const expected = sandbox.git(dir, ["ls-tree", "--name-only", tree]).stdout.trim().split("\n");

  const result = await runOk(sandbox, ctx, dir, ["ls-tree", "--name-only", tree]);
  const actual = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `ls-tree --name-only ${tree}: esperava [${expected.join(", ")}], recebeu [${actual.join(", ")}]`
  );
});

stage(5, "Write a tree object", async (ctx, sandbox) => {
  const dir = await sandbox.dir("write-tree");
  await sandbox.gitInit(dir);
  await writeRandomTree(dir);

  const result = await runOk(sandbox, ctx, dir, ["write-tree"]);
  const sha = result.stdout.trim();
  assert(/^[0-9a-f]{40}$/.test(sha), `write-tree deveria imprimir um SHA de 40 caracteres, imprimiu ${JSON.stringify(result.stdout)}`);

  // Antes do git real gravar qualquer coisa: a tree e as subtrees precisam existir.
  const listing = sandbox.git(dir, ["ls-tree", "-r", "-t", sha], { allowFailure: true });
  assert(listing.code === 0, `o git real não conseguiu ler a tree ${sha}: ${listing.stderr.trim()}`);
  for (const line of listing.stdout.trim().split("\n")) {
    const object = line.split(/\s+/)[2];
    const check = sandbox.git(dir, ["cat-file", "-e", object], { allowFailure: true });
    assert(check.code === 0, `objeto ${object} referenciado pela tree não foi gravado`);
  }

  sandbox.git(dir, ["add", "-A"]);
  const expected = sandbox.git(dir, ["write-tree"]).stdout.trim();
  assert(sha === expected, `write-tree: esperava o SHA ${expected}, recebeu ${sha}`);
});

stage(6, "Create a commit", async (ctx, sandbox) => {
  const dir = await sandbox.dir("commit-tree");
  await sandbox.gitInit(dir);
  await fs.writeFile(path.join(dir, "first.txt"), `${randomWords(5)}\n`);
  sandbox.git(dir, ["add", "-A"]);
  const parentTree = sandbox.git(dir, ["write-tree"]).stdout.trim();
  const parent = sandbox.git(dir, ["commit-tree", parentTree, "-m", "initial commit"]).stdout.trim();

  await fs.writeFile(path.join(dir, "second.txt"), `${randomWords(5)}\n`);
  sandbox.git(dir, ["add", "-A"]);
  const tree = sandbox.git(dir, ["write-tree"]).stdout.trim();
  const message = randomWords(4);

  const result = await runOk(sandbox, ctx, dir, ["commit-tree", tree, "-p", parent, "-m", message]);
  const sha = result.stdout.trim();
  assert(/^[0-9a-f]{40}$/.test(sha), `commit-tree deveria imprimir um SHA de 40 caracteres, imprimiu ${JSON.stringify(result.stdout)}`);

  const type = sandbox.git(dir, ["cat-file", "-t", sha], { allowFailure: true });
  assert(type.stdout.trim() === "commit", `o objeto ${sha} não existe ou não é um commit`);
  const body = sandbox.git(dir, ["cat-file", "-p", sha]).stdout;
  assert(body.includes(`tree ${tree}\n`), `o commit não aponta para a tree ${tree}`);
  assert(body.includes(`parent ${parent}\n`), `o commit não aponta para o parent ${parent}`);
  assert(/^author .+ <.*> \d+ [+-]\d{4}$/m.test(body), "linha author ausente ou fora do formato \"Nome <email> timestamp +0000\"");
  assert(/^committer .+ <.*> \d+ [+-]\d{4}$/m.test(body), "linha committer ausente ou fora do formato");
  assert(body.includes(`\n\n${message}`), `a mensagem "${message}" não aparece no commit`);

  const log = sandbox.git(dir, ["log", "--format=%s", sha], { allowFailure: true });
  assert(
    log.code === 0 && log.stdout.trim().split("\n").join("|") === `${message}|initial commit`,
    `git log não conseguiu percorrer o histórico: ${log.stderr.trim() || log.stdout.trim()}`
  );
});

stage(7, "Clone a repository", async (ctx, sandbox) => {
  const serverRoot = await sandbox.dir("server");
  const source = await createSourceRepo(sandbox, serverRoot);
  const { server, port } = await startGitHttpServer(sandbox, serverRoot);
  try {
    const dir = await sandbox.dir("clone");
    const url = `http://127.0.0.1:${port}/${source.name}`;
    await runOk(sandbox, ctx, dir, ["clone", url, "cloned"]);
    const cloned = path.join(dir, "cloned");

    assert(await exists(path.join(cloned, ".git")), "esperava cloned/.git depois do clone");
    const head = sandbox.git(cloned, ["rev-parse", "HEAD"], { allowFailure: true });
    assert(head.code === 0, `o git real não encontrou HEAD no clone: ${head.stderr.trim()}`);
    assert(head.stdout.trim() === source.head, `HEAD do clone é ${head.stdout.trim()}, esperava ${source.head}`);

    const objects = sandbox.git(cloned, ["rev-list", "--objects", "--all"], { allowFailure: true });
    assert(objects.code === 0, `objetos faltando no clone: ${objects.stderr.trim().split("\n")[0]}`);

    const log = sandbox.git(cloned, ["log", "--format=%s"], { allowFailure: true });
    assert(log.stdout.trim().split("\n").length === 5, "o histórico clonado deveria ter 5 commits");

    const files = sandbox.git(source.repo, ["ls-tree", "-r", "HEAD"]).stdout.trim().split("\n");
    for (const line of files) {
      const [meta, name] = line.split("\t");
      const blob = meta.split(" ")[2];
      const file = path.join(cloned, ...name.split("/"));
      assert(await exists(file), `arquivo ${name} não foi criado no working tree`);
      const content = await fs.readFile(file);
      const expected = sandbox.git(source.repo, ["cat-file", "blob", blob]).raw;
      assert(content.equals(expected), `o conteúdo de ${name} no working tree não bate com o commit`);
    }
  } finally {
    server.close();
  }
});

// ------------------------------------------------------------------- runner

export async function runStages({
  workspaceDir = DEFAULT_WORKSPACE,
  build = true,
  onProgress = () => {},
} = {}) {
  const jar = path.join(workspaceDir, "target", "git.jar");

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

  const sandbox = await Sandbox.create();
  const results = [];
  try {
    if (!(await exists(jar))) {
      for (const test of tests) {
        const result = { number: test.number, title: test.title, ok: false, error: `${jar} não encontrado — o build gerou o jar?`, durationMs: 0 };
        results.push(result);
        onProgress({ type: "stage-end", result });
      }
    } else {
      const ctx = { jar };
      for (const test of tests) {
        onProgress({ type: "stage-start", number: test.number, title: test.title });
        const startedAt = Date.now();
        let result;
        try {
          await test.run(ctx, sandbox);
          result = { number: test.number, title: test.title, ok: true, durationMs: Date.now() - startedAt };
        } catch (error) {
          result = { number: test.number, title: test.title, ok: false, error: error.message, durationMs: Date.now() - startedAt };
        }
        results.push(result);
        onProgress({ type: "stage-end", result });
      }
    }
  } finally {
    await fs.rm(sandbox.root, { recursive: true, force: true }).catch(() => {});
  }

  const passed = results.filter((result) => result.ok).length;
  return { results, passed, failed: results.length - passed, logs: sandbox.logs };
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
