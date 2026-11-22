import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PROFILE_ID } from "@/lib/data";
import { runJavaTests } from "@/lib/runner/java";
import { setActivityDone, setExerciseSolved } from "@/app/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CODE = 60_000;

/**
 * Roda o código do aluno contra os testes de um exercício ou de uma atividade de aula.
 * Os testes vêm sempre do banco — nunca do navegador.
 *
 * O código executa na máquina local (a plataforma é de usuário único). Para desligar:
 * CODE_RUNNER=off no .env.
 */
export async function POST(request: Request) {
  if (process.env.CODE_RUNNER === "off") {
    return NextResponse.json({ error: "O runner de código está desligado (CODE_RUNNER=off)." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { kind?: string; id?: string; code?: string } | null;
  if (!body || typeof body.code !== "string" || typeof body.id !== "string" || (body.kind !== "exercise" && body.kind !== "activity")) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (body.code.length > MAX_CODE) {
    return NextResponse.json({ error: `Código grande demais (máximo ${MAX_CODE} caracteres).` }, { status: 413 });
  }

  if (body.kind === "exercise") {
    const exercise = await prisma.exercise.findUnique({ where: { id: body.id }, select: { id: true, tests: true } });
    if (!exercise) return NextResponse.json({ error: "Exercício não encontrado." }, { status: 404 });
    const result = await runJavaTests({ code: body.code, tests: exercise.tests });
    const existing = await prisma.exerciseProgress.findUnique({ where: { profileId_exerciseId: { profileId: PROFILE_ID, exerciseId: exercise.id } } });
    const wasSolved = existing?.status === "solved";
    await prisma.exerciseProgress.upsert({
      where: { profileId_exerciseId: { profileId: PROFILE_ID, exerciseId: exercise.id } },
      update: { code: body.code, attempts: { increment: 1 }, status: wasSolved ? "solved" : "attempted" },
      create: { profileId: PROFILE_ID, exerciseId: exercise.id, code: body.code, attempts: 1, status: "attempted" },
    });
    if (result.status === "passed" && !wasSolved) await setExerciseSolved(exercise.id, true);
    return NextResponse.json({ result, solved: wasSolved || result.status === "passed" });
  }

  const activity = await prisma.lessonActivity.findUnique({ where: { id: body.id }, select: { id: true, tests: true, kind: true } });
  if (!activity || activity.kind !== "code") return NextResponse.json({ error: "Atividade não encontrada." }, { status: 404 });
  const result = await runJavaTests({ code: body.code, tests: activity.tests });
  const existing = await prisma.activityProgress.findUnique({ where: { profileId_activityId: { profileId: PROFILE_ID, activityId: activity.id } } });
  const wasDone = existing?.status === "done";
  await prisma.activityProgress.upsert({
    where: { profileId_activityId: { profileId: PROFILE_ID, activityId: activity.id } },
    update: { code: body.code, attempts: { increment: 1 }, status: wasDone ? "done" : "attempted" },
    create: { profileId: PROFILE_ID, activityId: activity.id, code: body.code, attempts: 1, status: "attempted" },
  });
  if (result.status === "passed" && !wasDone) await setActivityDone(activity.id, true);
  return NextResponse.json({ result, solved: wasDone || result.status === "passed" });
}
