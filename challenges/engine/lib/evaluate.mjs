import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run, tail } from "./proc.mjs";
import { barePath, TMP_DIR, displayPath } from "./paths.mjs";
import { runtimePaths } from "./catalog.mjs";
import { recordSubmission, recordTest, readState, nextStage } from "./state.mjs";

function formatResult(result) {
  const number = String(result.number).padStart(2, "0");
  const line = `${result.ok ? "✅" : "❌"} Stage ${number} · ${result.title}`;
  return result.ok ? line : `${line}\n   ${result.error ?? "falhou"}`;
}

function formatResults(results) {
  return results.map(formatResult).join("\n");
}

function append(current, text) {
  if (!text) return current;
  return current ? `${current}\n${text}` : text;
}

async function compileWorkspace(dir, course) {
  const runtime = runtimePaths(course);
  const compile = runtime.compile;
  if (!compile) return { ok: true, output: "" };
  let command = compile.command;
  let args = compile.args;
  if (process.platform === "win32") {
    command = process.env.ComSpec ?? "cmd.exe";
    args = ["/d", "/s", "/c", [compile.command, ...compile.args].join(" ")];
  }
  const result = await run(command, args, {
    cwd: dir,
    shell: false,
    timeoutMs: compile.timeoutMs ?? 240_000,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return {
    ok: result.code === 0,
    output: tail(output, 8000),
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    code: result.code,
  };
}

export async function evaluateDirectory({ slug, dir, course, kind = "test", commit = null, onProgress }) {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Workspace não encontrado em ${dir}. Rode "npm run cc -- start ${slug}" primeiro.`
    );
  }

  const startedAt = Date.now();
  const previous = readState(slug);
  const attemptedStage = nextStage(previous.completed, course.stages.length);
  const compileSpec = course.runtime?.compile;
  let output = `$ cd ${displayPath(dir)}`;
  if (compileSpec) output += `\n$ ${[compileSpec.command, ...compileSpec.args].join(" ")}`;
  const compile = await compileWorkspace(dir, course);

  if (!compile.ok) {
    output = append(
      output,
      `\n[compile] falhou após ${compile.durationMs}ms${compile.timedOut ? " (timeout)" : ""}\n${compile.output}`
    );
    const state = kind === "submit"
      ? recordSubmission(slug, {
          results: [],
          output,
          commit,
          durationMs: Date.now() - startedAt,
          stageCount: course.stages.length,
          compileFailed: true,
          attemptedStage,
        })
      : recordTest(slug, {
          results: [],
          output,
          durationMs: Date.now() - startedAt,
          compileFailed: true,
          attemptedStage,
        });
    return {
      ok: false,
      compileFailed: true,
      attemptedStage,
      advanced: false,
      results: [],
      output,
      durationMs: Date.now() - startedAt,
      state,
    };
  }

  output = append(output, "[compile] ok");

  const runtime = runtimePaths(course);
  const runner = await import(pathToFileURL(runtime.runner).href);
  if (typeof runner.runStages !== "function") {
    throw new Error(`${runtime.runner} não exporta runStages().`);
  }

  const results = [];
  let stageOutput = "";
  const runResult = await runner.runStages({
    workspaceDir: dir,
    build: false,
    port: runtime.port,
    onProgress(event) {
      if (event.type === "stage-end") {
        results.push(event.result);
        stageOutput = append(stageOutput, formatResult(event.result));
        onProgress?.(event);
      } else {
        onProgress?.(event);
      }
    },
  });

  const passed = runResult.results.filter((result) => result.ok).length;
  const failed = runResult.results.length - passed;
  output = append(
    output,
    [
      stageOutput,
      "",
      `${passed}/${runResult.results.length} stages passaram.`,
      runResult.logs?.trim() ? `\n[server]\n${tail(runResult.logs, 4000)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );

  const payload = {
    results: runResult.results,
    output,
    durationMs: Date.now() - startedAt,
    commit,
    attemptedStage,
  };
  const state = kind === "submit"
    ? recordSubmission(slug, { ...payload, stageCount: course.stages.length })
    : recordTest(slug, payload);
  const advanced = kind === "submit" ? Boolean(state.lastRun?.advanced) : undefined;

  return {
    ok: failed === 0,
    compileFailed: false,
    attemptedStage,
    advanced,
    results: runResult.results,
    passed,
    failed,
    output,
    durationMs: Date.now() - startedAt,
    state,
    port: runResult.port,
  };
}

export async function evaluateSubmission(slug, commit, course) {
  const bare = barePath(slug);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP_DIR, `${slug}-${Date.now()}-`));

  try {
    const add = await run(
      "git",
      ["--git-dir", bare, "worktree", "add", "--detach", dir, commit],
      { shell: false, timeoutMs: 60_000 }
    );
    if (add.code !== 0) {
      throw new Error(`não foi possível fazer checkout do commit ${commit}:\n${add.stderr || add.stdout}`);
    }
    return await evaluateDirectory({
      slug,
      dir,
      course,
      kind: "submit",
      commit,
    });
  } finally {
    await run("git", ["--git-dir", bare, "worktree", "remove", "--force", dir], {
      shell: false,
      timeoutMs: 60_000,
    });
    fs.rmSync(dir, { recursive: true, force: true });
    await run("git", ["--git-dir", bare, "worktree", "prune"], {
      shell: false,
      timeoutMs: 30_000,
    });
  }
}

export { formatResults, formatResult };
