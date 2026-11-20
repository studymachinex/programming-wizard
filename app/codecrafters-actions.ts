"use server";

import { execFile } from "node:child_process";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { getCourse, getChallengeState } from "@/lib/codecrafters";

const ROOT = process.cwd();
const CLI = path.join(ROOT, "challenges", "engine", "cc.mjs");

type ActionResult = {
  ok: boolean;
  output: string;
  error?: string;
};

function runCli(args: string[]): Promise<ActionResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    execFile(
      process.execPath,
      [CLI, ...args],
      {
        cwd: ROOT,
        timeout: 300_000,
        maxBuffer: 12 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      },
      (error, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        if (error) {
          const timeout = error.killed ? "\nTempo esgotado ao rodar os testes." : "";
          resolve({
            ok: false,
            output: output || error.message,
            error: `${error.message}${timeout}`,
          });
          return;
        }
        resolve({
          ok: true,
          output: output || `Concluído em ${Math.round((Date.now() - startedAt) / 1000)}s.`,
        });
      }
    );
  });
}

function refresh(slug: string) {
  revalidatePath("/projetos");
  revalidatePath(`/projetos/codecrafters/${slug}`);
}

type RunLike = {
  at: string;
  compileFailed?: boolean;
  attemptedStage?: number;
  advanced?: boolean;
  results: Array<{ number: number; ok: boolean }>;
};

function attemptedPassed(run: RunLike | null, attempted: number) {
  if (!run || run.compileFailed) return false;
  return Boolean(run.results.find((result) => result.number === attempted)?.ok);
}

function runIsFresh(run: RunLike | null | undefined, previous: RunLike | null | undefined) {
  return Boolean(run && run.at !== previous?.at);
}

export async function startChallengeAction(slug: string): Promise<ActionResult> {
  const course = getCourse(slug);
  if (!course) return { ok: false, output: "Desafio ainda não disponível na plataforma." };
  const result = await runCli(["start", slug]);
  refresh(slug);
  return result;
}

export async function restartChallengeAction(slug: string): Promise<ActionResult> {
  const course = getCourse(slug);
  if (!course) return { ok: false, output: "Desafio ainda não disponível na plataforma." };
  const result = await runCli(["start", slug, "--force"]);
  refresh(slug);
  return result;
}

export async function testChallengeAction(slug: string): Promise<ActionResult> {
  const course = getCourse(slug);
  if (!course) return { ok: false, output: "Desafio ainda não disponível na plataforma." };
  const before = getChallengeState(slug);
  const result = await runCli(["test", slug]);
  const after = getChallengeState(slug);
  const run = after.lastTest;
  const attempted = run?.attemptedStage ?? before.currentStage;
  const ok =
    result.ok &&
    runIsFresh(run, before.lastTest) &&
    attemptedPassed(run, attempted);
  refresh(slug);
  return { ...result, ok };
}

export async function submitChallengeAction(slug: string): Promise<ActionResult> {
  const course = getCourse(slug);
  if (!course) return { ok: false, output: "Desafio ainda não disponível na plataforma." };
  const before = getChallengeState(slug);
  const result = await runCli(["submit", slug]);
  const after = getChallengeState(slug);
  const run = after.lastRun;
  const attempted = run?.attemptedStage ?? before.currentStage;
  const ok =
    result.ok &&
    runIsFresh(run, before.lastRun) &&
    (run?.advanced ?? attemptedPassed(run, attempted));
  refresh(slug);
  return { ...result, ok };
}

export async function refreshChallengeAction(slug: string): Promise<ActionResult> {
  const state = getChallengeState(slug);
  refresh(slug);
  return {
    ok: true,
    output: `Progresso atual: ${state.completed.length} stages concluídos.`,
  };
}
