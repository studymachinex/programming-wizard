#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadCatalog, loadCourse, stageMarkdown, findChallenge } from "./lib/catalog.mjs";
import { readState, resetState } from "./lib/state.mjs";
import { createWorkspace, detectContext, ensureBareRepo, git, workspaceExists } from "./lib/workspace.mjs";
import { evaluateDirectory } from "./lib/evaluate.mjs";
import { displayPath, statePath, workspacePath } from "./lib/paths.mjs";
import { runStreaming } from "./lib/proc.mjs";

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = {
  green: (text) => (COLOR ? `\x1b[32m${text}\x1b[0m` : text),
  red: (text) => (COLOR ? `\x1b[31m${text}\x1b[0m` : text),
  yellow: (text) => (COLOR ? `\x1b[33m${text}\x1b[0m` : text),
  dim: (text) => (COLOR ? `\x1b[2m${text}\x1b[0m` : text),
  bold: (text) => (COLOR ? `\x1b[1m${text}\x1b[0m` : text),
  magenta: (text) => (COLOR ? `\x1b[35m${text}\x1b[0m` : text),
};

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-m" || arg === "--message") {
      flags.message = argv[++i];
    } else if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (value !== undefined) flags[key] = value;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        // Flags booleanas conhecidas não consomem o próximo argumento.
        if (["solution", "force", "raw", "all", "yes"].includes(key)) flags[key] = true;
        else flags[key] = argv[++i];
      } else flags[key] = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function progressBar(completed, total, width = 28) {
  const filled = Math.round((completed / Math.max(1, total)) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))} ${completed}/${total}`;
}

function requireCourse(slug) {
  const course = loadCourse(slug);
  if (!course) {
    throw new Error(
      `O desafio "${slug}" ainda não tem curso local. Hoje o disponível é: http-server.`
    );
  }
  return course;
}

function printHeader() {
  console.log("");
  console.log(paint.magenta("  ┌─────────────────────────────────────────────┐"));
  console.log(
    paint.magenta("  │") +
      paint.bold("  Programming Wizard  ·  CodeCrafters local   ") +
      paint.magenta("│")
  );
  console.log(paint.magenta("  └─────────────────────────────────────────────┘"));
  console.log("");
}

function commandStart({ positional, flags }) {
  const slug = positional[0] ?? "http-server";
  const challenge = findChallenge(slug);
  const course = requireCourse(slug);
  printHeader();
  console.log(`${paint.dim("desafio")}  ${challenge.title}`);
  console.log(`${paint.dim("stages")}   ${course.stages.length}`);
  console.log("");

  return createWorkspace(slug, {
    force: Boolean(flags.force),
    solution: Boolean(flags.solution),
  }).then((result) => {
    const { path: dir, created } = result;
    if (!created) {
      console.log(paint.yellow(`ℹ workspace já existe em ${displayPath(dir)}`));
      console.log(paint.dim("  use --force para recriar do zero (apaga alterações locais)."));
    } else {
      console.log(paint.green(`✔ workspace criado em ${displayPath(dir)}`));
      console.log(paint.green("✔ repositório git inicializado (branch master)"));
      console.log(paint.green("✔ remote local \"wizard\" configurado"));
      console.log(paint.green("✔ hook post-receive instalado"));
      console.log(paint.green("✔ commit inicial criado"));
      if (flags.force) {
        resetState(slug);
        console.log(paint.green("✔ progresso resetado (recomeço do zero)"));
      }
    }

    const state = readState(slug);
    const stage = course.stages.find((item) => item.order === state.currentStage) ?? course.stages[0];
    console.log("");
    console.log(`${paint.dim("progresso")}  ${progressBar(state.completed.length, course.stages.length)}`);
    console.log(`${paint.dim("stage")}      #${stage.order} · ${stage.title}`);
    console.log("");
    console.log(paint.bold("Próximos passos"));
    console.log(`  1. edite ${paint.magenta(`${displayPath(dir)}/src/main/java/Main.java`)}`);
    console.log(`  2. ${paint.magenta("npm run cc -- task")}     ${paint.dim("# instruções")}`);
    console.log(`  3. ${paint.magenta("npm run cc -- test")}     ${paint.dim("# testa sem commitar")}`);
    console.log(`  4. ${paint.magenta("npm run cc -- submit")}   ${paint.dim("# commit + push, hook roda os testes")}`);
    console.log("");
    console.log(paint.dim(`  push manual: cd ${displayPath(dir)} && git push wizard master`));
    console.log("");
  });
}

function commandTask({ positional, flags }) {
  const { slug, course } = detectContext(positional[0]);
  const state = readState(slug);
  const requested = flags.stage;
  const stage =
    (requested &&
      (course.stages.find((item) => String(item.order) === String(requested)) ??
        course.stages.find((item) => item.id === requested) ??
        course.stages.find((item) => item.slug === requested))) ||
    course.stages.find((item) => item.order === state.currentStage) ||
    course.stages[0];

  printHeader();
  console.log(`${paint.dim("desafio")}  ${course.title}`);
  console.log(`${paint.dim("stage")}    ${stage.order}/${course.stages.length} · ${stage.title}`);
  console.log(`${paint.dim("status")}   ${progressBar(state.completed.length, course.stages.length)}`);
  console.log("");
  console.log("─".repeat(72));
  console.log(stageMarkdown(slug, stage).trim());
  console.log("─".repeat(72));
  console.log("");
  console.log(paint.dim(`Edite: ${displayPath(workspacePath(slug, course.language))}`));
  console.log("");
}

async function commandTest({ positional }) {
  const { slug, dir, course } = detectContext(positional[0]);
  if (!fs.existsSync(dir)) {
    throw new Error(`workspace não encontrado. Rode "npm run cc -- start ${slug}" primeiro.`);
  }
  const state = readState(slug);
  const stage = course.stages.find((item) => item.order === state.currentStage);
  printHeader();
  console.log(`${paint.dim("desafio")}  ${course.title}`);
  console.log(`${paint.dim("workspace")} ${displayPath(dir)}`);
  console.log(`${paint.dim("stage")}    #${stage?.order ?? 1} · ${stage?.title ?? ""}`);
  console.log("");
  console.log(paint.dim("compilando e rodando os testes (sem commitar)..."));
  console.log("");

  const result = await evaluateDirectory({
    slug,
    dir,
    course,
    kind: "test",
  });
  console.log(result.output);
  console.log("");
  const attempted = result.attemptedStage ?? state.currentStage;
  const current = result.results.find((item) => item.number === attempted);
  if (result.compileFailed) {
    console.log(paint.red("✖ a compilação falhou. O progresso não foi alterado."));
  } else if (current?.ok) {
    console.log(paint.green(`✔ stage ${attempted} passou nos testes locais.`));
    if (result.ok) console.log(paint.green("✔ todos os stages passaram."));
  } else {
    console.log(paint.red(`✖ stage ${attempted} falhou. O progresso não foi alterado.`));
  }
  console.log(paint.dim("  use `npm run cc -- submit` para validar no remote e avançar o stage."));
  console.log("");
  if (!current?.ok) process.exitCode = 1;
}

async function commandSubmit({ positional, flags }) {
  const { slug, dir, course } = detectContext(positional[0]);
  if (!fs.existsSync(dir)) {
    throw new Error(`workspace não encontrado. Rode "npm run cc -- start ${slug}" primeiro.`);
  }
  await ensureBareRepo(slug);

  printHeader();
  console.log(`${paint.dim("desafio")}  ${course.title}`);
  console.log(`${paint.dim("workspace")} ${displayPath(dir)}`);
  console.log("");

  await git(["add", "-A"], { cwd: dir });
  const status = await git(["status", "--porcelain"], { cwd: dir });
  const message = flags.message ?? "codecrafters submit [skip ci]";
  if (status.stdout.trim()) {
    const commit = await git(["commit", "--no-gpg-sign", "-m", message], { cwd: dir });
    console.log(paint.green(`✔ commit criado: ${commit.stdout.trim().split("\n")[0]}`));
  } else {
    await git(["commit", "--no-gpg-sign", "--allow-empty", "-m", message], { cwd: dir });
    console.log(paint.yellow("ℹ nenhuma mudança; commit vazio criado para disparar o hook."));
  }

  console.log("");
  console.log(paint.dim("git push wizard HEAD:master"));
  console.log("");
  const push = await runStreaming("git", ["push", "wizard", "HEAD:master"], {
    cwd: dir,
    shell: false,
    timeoutMs: 300_000,
  });
  if (push.code !== 0) {
    console.log("");
    console.log(paint.red("✖ o push falhou. Veja a saída acima."));
    process.exitCode = 1;
    return;
  }

  const state = readState(slug);
  const completed = state.completed.length;
  const next = course.stages.find((item) => item.order === state.currentStage);
  console.log("");
  console.log(`${paint.dim("progresso")} ${progressBar(completed, course.stages.length)}`);
  if (completed === course.stages.length) {
    console.log(paint.green("🏆 desafio concluído!"));
  } else if (next) {
    console.log(`${paint.dim("próximo")}   #${next.order} · ${next.title}`);
    console.log(paint.dim("  npm run cc -- task"));
  }
  console.log("");
}

function commandStatus({ positional }) {
  const { slug, dir, course } = detectContext(positional[0]);
  const state = readState(slug);
  printHeader();
  console.log(`${paint.dim("desafio")}  ${course.title}`);
  console.log(`${paint.dim("workspace")} ${displayPath(dir)} ${fs.existsSync(dir) ? paint.green("(ok)") : paint.yellow("(não criado)")}`);
  console.log("");
  console.log(`${paint.dim("progresso")} ${progressBar(state.completed.length, course.stages.length)}`);
  console.log("");
  for (const stage of course.stages) {
    const done = state.completed.includes(stage.order);
    const current = stage.order === state.currentStage;
    const marker = done ? paint.green("✔") : current ? paint.yellow("→") : paint.dim("·");
    console.log(`  ${marker} ${String(stage.order).padStart(2, "0")}  ${stage.title}`);
  }
  console.log("");
  if (state.lastRun) {
    const run = state.lastRun;
    console.log(
      `${paint.dim("último submit")} ${new Date(run.at).toLocaleString()} · ${run.passed?.length ?? 0} passaram · ${run.failed?.length ?? 0} falharam`
    );
  }
  if (state.lastTest) {
    const test = state.lastTest;
    console.log(
      `${paint.dim("último teste")}  ${new Date(test.at).toLocaleString()} · ${test.passed?.length ?? 0} passaram · ${test.failed?.length ?? 0} falharam`
    );
  }
  console.log(paint.dim(`estado: ${statePath(slug)}`));
  console.log("");
}

function commandList() {
  const catalog = loadCatalog();
  printHeader();
  console.log(paint.bold("Catálogo CodeCrafters"));
  console.log("");
  for (const challenge of catalog.challenges) {
    const course = loadCourse(challenge.slug);
    const state = readState(challenge.slug);
    const total = course?.stages.length ?? challenge.stageCount;
    const completed = state.completed.length;
    const marker = !course
      ? paint.dim("·")
      : completed === total
        ? paint.green("✔")
        : completed > 0
          ? paint.yellow("→")
          : paint.dim("·");
    const status = !course
      ? paint.dim("em breve")
      : completed === total
        ? paint.green("concluído")
        : completed > 0
          ? paint.yellow("em andamento")
          : "disponível";
    console.log(
      `  ${marker} ${challenge.title.padEnd(32)} ${String(completed).padStart(3)}/${String(total).padEnd(3)}  ${status}`
    );
  }
  console.log("");
}

async function commandReset({ positional, flags }) {
  const slug = positional[0] ?? detectContext().slug;
  requireCourse(slug);
  if (!flags.yes) {
    console.log(`Isso apaga o progresso de "${slug}" (o workspace e o código continuam).`);
    console.log("Rode com --yes para confirmar.");
    return;
  }
  resetState(slug);
  console.log(paint.green(`✔ progresso de ${slug} resetado.`));
}

function commandPath({ positional }) {
  const { slug, dir, course } = detectContext(positional[0]);
  console.log(displayPath(dir));
  console.log(paint.dim(`arquivo: ${path.join(displayPath(dir), "src/main/java/Main.java")}`));
  console.log(paint.dim(`stage atual: ${readState(slug).currentStage}/${course.stages.length}`));
}

const commands = {
  start: commandStart,
  init: commandStart,
  task: commandTask,
  test: commandTest,
  submit: commandSubmit,
  status: commandStatus,
  list: commandList,
  reset: commandReset,
  path: commandPath,
};

async function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift() ?? "status";
  const parsed = parseArgs(argv);
  const handler = commands[command];
  if (!handler) {
    console.log(`Comando desconhecido: ${command}`);
    console.log("Use: start, task, test, submit, status, list, reset, path");
    process.exitCode = 1;
    return;
  }
  await handler(parsed);
}

main().catch((error) => {
  console.error("");
  console.error(paint.red(`✖ ${error.message}`));
  console.error("");
  process.exitCode = 1;
});
