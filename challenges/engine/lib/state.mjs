import fs from "node:fs";
import path from "node:path";
import { STATE_DIR, statePath } from "./paths.mjs";

const MAX_HISTORY = 25;
const MAX_OUTPUT = 18_000;

export function defaultState(slug, language = "java") {
  return {
    challenge: slug,
    language,
    completed: [],
    currentStage: 1,
    attempts: 0,
    createdAt: null,
    updatedAt: null,
    lastRun: null,
    lastTest: null,
    history: [],
  };
}

export function readState(slug) {
  const file = statePath(slug);
  if (!fs.existsSync(file)) return defaultState(slug);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...defaultState(slug, parsed.language),
      ...parsed,
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return defaultState(slug);
  }
}

export function writeState(slug, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const file = statePath(slug);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
  return state;
}

export function completedFromResults(results, stageCount) {
  const byNumber = new Map(results.map((result) => [result.number, result]));
  const completed = [];
  for (let number = 1; number <= stageCount; number++) {
    if (byNumber.get(number)?.ok) completed.push(number);
    else break;
  }
  return completed;
}

export function nextStage(completed, stageCount) {
  for (let number = 1; number <= stageCount; number++) {
    if (!completed.includes(number)) return number;
  }
  return stageCount;
}

function summarize(results) {
  const passed = results.filter((result) => result.ok).map((result) => result.number);
  const failed = results.filter((result) => !result.ok).map((result) => result.number);
  return { passed, failed };
}

export function recordSubmission(slug, input) {
  const state = readState(slug);
  const {
    results = [],
    output = "",
    commit = null,
    durationMs = 0,
    stageCount,
    compileFailed = false,
    attemptedStage = state.currentStage,
  } = input;
  const completed = compileFailed ? state.completed : completedFromResults(results, stageCount);
  const now = new Date().toISOString();
  const summary = summarize(results);
  const advanced = !compileFailed && completed.includes(attemptedStage);

  const lastRun = {
    kind: "submit",
    commit,
    at: now,
    durationMs,
    compileFailed,
    attemptedStage,
    advanced,
    passed: summary.passed,
    failed: summary.failed,
    results,
    output: output.slice(-MAX_OUTPUT),
  };

  const next = {
    ...state,
    completed,
    currentStage: nextStage(completed, stageCount),
    attempts: (state.attempts ?? 0) + 1,
    createdAt: state.createdAt ?? now,
    updatedAt: now,
    lastRun,
    history: [
      {
        kind: "submit",
        commit,
        at: now,
        durationMs,
        passed: summary.passed,
        failed: summary.failed,
      },
      ...state.history,
    ].slice(0, MAX_HISTORY),
  };

  return writeState(slug, next);
}

export function recordTest(slug, input) {
  const state = readState(slug);
  const {
    results = [],
    output = "",
    durationMs = 0,
    compileFailed = false,
    attemptedStage = state.currentStage,
  } = input;
  const now = new Date().toISOString();
  const summary = summarize(results);
  const next = {
    ...state,
    updatedAt: now,
    lastTest: {
      kind: "test",
      at: now,
      durationMs,
      compileFailed,
      attemptedStage,
      passed: summary.passed,
      failed: summary.failed,
      results,
      output: output.slice(-MAX_OUTPUT),
    },
  };
  return writeState(slug, next);
}

export function resetState(slug, language = "java") {
  const state = defaultState(slug, language);
  state.createdAt = new Date().toISOString();
  return writeState(slug, state);
}
