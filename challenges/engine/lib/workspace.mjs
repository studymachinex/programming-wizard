import fs from "node:fs";
import path from "node:path";
import { run } from "./proc.mjs";
import {
  ACTIVE_FILE,
  ENGINE_DIR,
  REMOTES_DIR,
  STATE_DIR,
  TMP_DIR,
  WORKSPACES_DIR,
  barePath,
  relativeToRoot,
  workspacePath,
} from "./paths.mjs";
import { loadCourse, runtimePaths } from "./catalog.mjs";

export function ensureBaseDirs() {
  for (const dir of [WORKSPACES_DIR, REMOTES_DIR, STATE_DIR, TMP_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function git(args, { cwd, allowFailure = false } = {}) {
  const result = await run("git", args, {
    cwd,
    shell: false,
    timeoutMs: 60_000,
  });
  if (result.code !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(" ")} falhou:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function writeHook(slug) {
  const bare = barePath(slug);
  const hooksDir = path.join(bare, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const engine = path.join(ENGINE_DIR, "post-receive.mjs").split(path.sep).join("/");
  const hook = [
    "#!/bin/sh",
    "# Programming Wizard — roda os testes no remote, igual ao test runner do CodeCrafters.",
    `exec node "${engine}" "${slug}"`,
    "",
  ].join("\n");
  const file = path.join(hooksDir, "post-receive");
  fs.writeFileSync(file, hook, { mode: 0o755 });
  return file;
}

export async function ensureBareRepo(slug) {
  ensureBaseDirs();
  const bare = barePath(slug);
  if (!fs.existsSync(path.join(bare, "HEAD"))) {
    fs.mkdirSync(bare, { recursive: true });
    await git(["init", "--bare", bare], { cwd: WORKSPACES_DIR });
  }
  await git(["--git-dir", bare, "symbolic-ref", "HEAD", "refs/heads/master"], {
    cwd: WORKSPACES_DIR,
  });
  const hook = writeHook(slug);
  return { bare, hook };
}

export function workspaceConfig(dir) {
  const file = path.join(dir, ".codecrafters", "config.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function readActiveWorkspace() {
  if (!fs.existsSync(ACTIVE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(ACTIVE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeActiveWorkspace(slug, language, target) {
  ensureBaseDirs();
  fs.writeFileSync(
    ACTIVE_FILE,
    JSON.stringify(
      {
        slug,
        language,
        path: relativeToRoot(target),
        at: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function ensureGitignore(target) {
  const file = path.join(target, ".gitignore");
  const required = ["target/", ".idea/"];
  let current = "";
  if (fs.existsSync(file)) current = fs.readFileSync(file, "utf8");
  const missing = required.filter((entry) => !current.split(/\r?\n/).includes(entry));
  if (missing.length === 0) return;
  const next = `${current.replace(/\s*$/, "")}${current.trim() ? "\n" : ""}${missing.join("\n")}\n`;
  fs.writeFileSync(file, next);
}

async function configureIdentity(cwd) {
  const name = await run("git", ["config", "user.name"], { cwd, shell: false, timeoutMs: 20_000 });
  if (!name.stdout.trim()) {
    await git(["config", "user.name", "Programming Wizard"], { cwd });
    await git(["config", "user.email", "wizard@programming.local"], { cwd });
  }
  const email = await run("git", ["config", "user.email"], { cwd, shell: false, timeoutMs: 20_000 });
  if (!email.stdout.trim()) {
    await git(["config", "user.email", "wizard@programming.local"], { cwd });
  }
}

export async function createWorkspace(slug, { force = false, solution = false } = {}) {
  const course = loadCourse(slug);
  if (!course) throw new Error(`O desafio "${slug}" ainda não tem curso local.`);
  const runtime = runtimePaths(course);
  const source = solution ? runtime.reference : runtime.starter;
  if (!source || !fs.existsSync(source)) {
    throw new Error(`Starter não encontrado para ${slug}: ${source}`);
  }

  const target = workspacePath(slug, course.language);
  const exists = fs.existsSync(target);
  if (exists && !force) {
    writeActiveWorkspace(slug, course.language, target);
    return { created: false, path: target, course, bare: barePath(slug) };
  }

  if (exists) fs.rmSync(target, { recursive: true, force: true });
  // O remote bare guarda o histórico de pushes antigos. Ao criar um workspace novo,
  // recomeçamos também o remote para que o primeiro push não seja rejeitado por
  // histórias divergentes (ex.: `start --force`).
  const bare = barePath(slug);
  if (fs.existsSync(bare)) fs.rmSync(bare, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      return !["target", "node_modules", ".git"].includes(name);
    },
  });
  ensureGitignore(target);

  fs.mkdirSync(path.join(target, ".codecrafters"), { recursive: true });
  fs.writeFileSync(
    path.join(target, ".codecrafters", "config.json"),
    JSON.stringify(
      {
        challenge: slug,
        language: course.language,
        remote: "wizard",
        managedBy: "programming-wizard",
      },
      null,
      2
    )
  );

  await ensureBareRepo(slug);
  const init = await git(["init", "-b", "master"], { cwd: target, allowFailure: true });
  if (init.code !== 0) await git(["init"], { cwd: target });
  await configureIdentity(target);

  await git(["remote", "remove", "wizard"], { cwd: target, allowFailure: true });
  await git(["remote", "add", "wizard", barePath(slug)], { cwd: target });

  await git(["add", "-A"], { cwd: target });
  const commit = await git(["commit", "--no-gpg-sign", "-m", "init [skip ci]"], {
    cwd: target,
    allowFailure: true,
  });
  if (commit.code !== 0) {
    await git(["commit", "--no-gpg-sign", "--allow-empty", "-m", "init [skip ci]"], { cwd: target });
  }

  writeActiveWorkspace(slug, course.language, target);
  return { created: true, path: target, course, bare: barePath(slug) };
}

export function detectContext(slugArg) {
  const cwd = process.cwd();
  const local = workspaceConfig(cwd);
  if (!slugArg && local?.challenge) {
    const course = loadCourse(local.challenge);
    return {
      slug: local.challenge,
      language: local.language ?? course?.language ?? "java",
      dir: cwd,
      course,
      inWorkspace: true,
    };
  }

  const active = readActiveWorkspace();
  const slug = slugArg ?? active?.slug ?? "http-server";
  const course = loadCourse(slug);
  if (!course) throw new Error(`O desafio "${slug}" ainda não tem curso local.`);
  const standard = workspacePath(slug, course.language);
  const dir = active?.slug === slug && active?.path
    ? path.resolve(process.cwd(), active.path)
    : standard;
  return {
    slug,
    language: course.language,
    dir,
    course,
    inWorkspace: false,
  };
}

export function workspaceExists(slug, language = "java") {
  return fs.existsSync(workspacePath(slug, language));
}
