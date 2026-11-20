import fs from "node:fs";
import path from "node:path";
import { ACTIVE_FILE, CONTENT_DIR, ROOT } from "./paths.mjs";

export function loadCatalog() {
  const file = path.join(CONTENT_DIR, "catalog.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function findChallenge(slug) {
  const catalog = loadCatalog();
  const challenge = catalog.challenges.find((item) => item.slug === slug);
  if (!challenge) {
    const available = catalog.challenges.map((item) => item.slug).join(", ");
    throw new Error(`Desafio "${slug}" não existe no catálogo. Disponíveis: ${available}`);
  }
  return challenge;
}

export function courseFile(slug) {
  return path.join(CONTENT_DIR, slug, "course.json");
}

export function loadCourse(slug) {
  const file = courseFile(slug);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function challengeStage(course, stageArg) {
  if (!course) throw new Error("Este desafio ainda não tem conteúdo local.");
  if (!stageArg) return course.stages[0];
  const value = String(stageArg);
  return (
    course.stages.find((stage) => String(stage.order) === value) ??
    course.stages.find((stage) => stage.id === value) ??
    course.stages.find((stage) => stage.slug === value) ??
    null
  );
}

export function stageMarkdown(slug, stage) {
  const file = path.join(CONTENT_DIR, slug, stage.file);
  return fs.readFileSync(file, "utf8");
}

export function readActive() {
  if (!fs.existsSync(ACTIVE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(ACTIVE_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function resolveChallenge(slug) {
  const challenge = findChallenge(slug);
  const course = loadCourse(slug);
  return { challenge, course };
}

export function runtimePaths(course) {
  if (!course?.runtime) return null;
  return {
    starter: path.join(ROOT, course.runtime.starter),
    reference: path.join(ROOT, course.runtime.reference),
    runner: path.join(ROOT, course.runtime.runner),
    compile: course.runtime.compile,
    port: course.runtime.port ?? 4221,
  };
}
