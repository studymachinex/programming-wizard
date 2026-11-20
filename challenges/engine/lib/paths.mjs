import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ROOT = path.resolve(ENGINE_DIR, "..", "..");
export const CONTENT_DIR = path.join(ROOT, "content", "codecrafters");
export const WORKSPACES_DIR = path.join(ROOT, "challenges", ".workspaces");
export const REMOTES_DIR = path.join(WORKSPACES_DIR, ".remotes");
export const STATE_DIR = path.join(WORKSPACES_DIR, ".state");
export const TMP_DIR = path.join(WORKSPACES_DIR, ".tmp");
export const ACTIVE_FILE = path.join(WORKSPACES_DIR, ".active.json");

export function workspacePath(slug, language = "java") {
  return path.join(WORKSPACES_DIR, `${slug}-${language}`);
}

export function barePath(slug) {
  return path.join(REMOTES_DIR, `${slug}.git`);
}

export function statePath(slug) {
  return path.join(STATE_DIR, `${slug}.json`);
}

export function challengeDir(slug) {
  return path.join(ROOT, "challenges", slug);
}

export function relativeToRoot(target) {
  return path.relative(ROOT, target).split(path.sep).join("/");
}

export function displayPath(target) {
  return relativeToRoot(target) || ".";
}
