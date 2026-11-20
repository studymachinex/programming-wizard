#!/usr/bin/env node
/**
 * Hook `post-receive` do remote local `wizard`.
 *
 * É o equivalente ao test runner server-side do CodeCrafters: o `git push`
 * termina, este processo faz checkout do commit em um worktree temporário,
 * compila, roda os stages e grava o progresso.
 */
import fs from "node:fs";
import { evaluateSubmission } from "./lib/evaluate.mjs";
import { loadCourse } from "./lib/catalog.mjs";
import { statePath } from "./lib/paths.mjs";

const slug = process.argv[2] ?? "http-server";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseRefs(input) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [oldRev, newRev, ref] = line.split(/\s+/);
      return { oldRev, newRev, ref };
    });
}

async function main() {
  const zero = "0000000000000000000000000000000000000000";
  const refs = parseRefs(await readStdin()).filter((entry) => entry.newRev !== zero);
  if (refs.length === 0) return;

  const target =
    refs.find((entry) => entry.ref === "refs/heads/master") ?? refs[refs.length - 1];

  const course = loadCourse(slug);
  if (!course) {
    console.error(`[wizard] curso local de "${slug}" não encontrado; push ignorado.`);
    return;
  }

  console.log(`[wizard] recebido ${target.ref} → ${target.newRev.slice(0, 7)}`);
  console.log("[wizard] compilando e rodando os stages...\n");

  try {
    const result = await evaluateSubmission(slug, target.newRev, course);
    console.log(result.output);

    const state = result.state;
    const total = course.stages.length;
    const completed = state.completed.length;

    console.log("");
    console.log("─".repeat(64));
    if (result.compileFailed) {
      console.log(`❌ [wizard] compilação falhou. Progresso mantido em ${completed}/${total}.`);
    } else if (completed === total) {
      console.log(`🏆 [wizard] desafio concluído! ${completed}/${total} stages.`);
    } else if (result.advanced) {
      const next = course.stages.find((stage) => stage.order === state.currentStage);
      console.log(
        `✅ [wizard] stage ${result.attemptedStage} passou. Progresso: ${completed}/${total}.`
      );
      if (next) console.log(`   Próximo: #${next.order} · ${next.title}`);
    } else {
      const next = course.stages.find((stage) => stage.order === state.currentStage);
      console.log(
        `❌ [wizard] stage ${result.attemptedStage} falhou. Progresso: ${completed}/${total}.`
      );
      if (next) console.log(`   Corrija e rode de novo. Stage atual: #${next.order} · ${next.title}`);
    }
    console.log(`   estado: ${statePath(slug)}`);
    console.log("─".repeat(64));
  } catch (error) {
    console.error(`[wizard] erro ao rodar os testes: ${error.message}`);
    console.error("[wizard] o push foi mantido; tente novamente com `npm run cc -- test`.");
  }
}

main().catch((error) => {
  console.error(`[wizard] hook falhou: ${error.message}`);
});
