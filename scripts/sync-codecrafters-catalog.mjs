#!/usr/bin/env node
/**
 * Sincroniza o catálogo público do CodeCrafters para content/codecrafters/catalog.json.
 *
 * Uso:
 *   node scripts/sync-codecrafters-catalog.mjs
 *
 * O site expõe a lista de stages nas páginas /courses/<slug>/overview.
 * O conteúdo das instruções de cada stage exige login, então aqui só
 * capturamos metadados públicos (título, dificuldade e ordem).
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const COURSES = [
  {
    slug: "http-server",
    title: "Build your own HTTP server",
    description: "TCP servers, protocolo HTTP, headers, arquivos e conexões persistentes.",
    access: "members",
  },
  {
    slug: "redis",
    title: "Build your own Redis",
    description: "TCP servers, protocolo RESP, estruturas de dados, replicação, RDB, AOF e pub/sub.",
    access: "free",
    freeUntil: "2026-12-31",
  },
  {
    slug: "git",
    title: "Build your own Git",
    description: "Objetos Git, index, tree objects, commits e plumbing commands.",
    access: "members",
  },
  {
    slug: "dns-server",
    title: "Build your own DNS server",
    description: "Protocolo DNS, parsing de pacotes, records e forwarding.",
    access: "members",
  },
  {
    slug: "sqlite",
    title: "Build your own SQLite",
    description: "Formato de arquivo SQLite, B-trees, pages e executor SQL.",
    access: "members",
  },
  {
    slug: "bittorrent",
    title: "Build your own BitTorrent",
    description: "Arquivos .torrent, bencode, tracker e peer wire protocol.",
    access: "members",
  },
  {
    slug: "kafka",
    title: "Build your own Kafka",
    description: "TCP servers, wire protocol Kafka, partições e consumer groups.",
    access: "members",
  },
  {
    slug: "grep",
    title: "Build your own grep",
    description: "Regex, character classes, quantifiers e backtracking.",
    access: "members",
  },
  {
    slug: "shell",
    title: "Build your own Shell",
    description: "Parsing de comandos, execução de programas, pipes e builtins.",
    access: "members",
  },
  {
    slug: "interpreter",
    title: "Build your own Interpreter",
    description: "Tokenizer, AST, tree-walk interpreter e runtime de linguagem.",
    access: "members",
  },
  {
    slug: "claude-code",
    title: "Build your own Claude Code",
    description: "LLM APIs, tool calling, agent loop e edição de arquivos.",
    access: "beta",
  },
  {
    slug: "tokenizer",
    title: "Build your own Tokenizer",
    description: "Byte-pair encoding, UTF-8 e vocabulário de tokenizer.",
    access: "early-access",
  },
];

const OUTPUT = path.join(process.cwd(), "content", "codecrafters", "catalog.json");

function stripHtml(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseStages(html) {
  const sections = [];
  const sectionRe = /<h3[^>]*data-test-course-extension-heading[^>]*>([\s\S]*?)<\/h3>/g;
  for (const match of html.matchAll(sectionRe)) {
    sections.push({ index: match.index ?? 0, title: stripHtml(match[1]) });
  }

  const stageRe = /<a[^>]*data-test-stage-list-item[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const stages = [];
  for (const match of html.matchAll(stageRe)) {
    const href = match[1];
    const block = match[2];
    const titleMatch = block.match(/class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const difficultyMatch = block.match(
      /data-test-course-difficulty-label[^>]*>([\s\S]*?)<\/div>/
    );
    if (!titleMatch) continue;
    const section = [...sections]
      .reverse()
      .find((entry) => entry.index < (match.index ?? 0));
    stages.push({
      order: stages.length + 1,
      id: href.split("/").filter(Boolean).pop(),
      title: stripHtml(titleMatch[1]),
      difficulty: difficultyMatch ? stripHtml(difficultyMatch[1]) : "unknown",
      section: section?.title ?? "Core",
      url: `https://app.codecrafters.io${href}`,
    });
  }
  return stages;
}

async function fetchCourse(course) {
  const url = `https://app.codecrafters.io/courses/${course.slug}/overview`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${course.slug}: HTTP ${response.status}`);
  }
  const html = await response.text();
  const stages = parseStages(html);
  return {
    ...course,
    catalogUrl: url,
    stageCount: stages.length,
    stages,
  };
}

async function main() {
  const results = [];
  for (const course of COURSES) {
    process.stdout.write(`→ ${course.slug} ... `);
    const data = await fetchCourse(course);
    results.push(data);
    console.log(`${data.stageCount} stages`);
  }

  const catalog = {
    source: "https://app.codecrafters.io/catalog",
    syncedAt: new Date().toISOString(),
    challenges: results.sort((a, b) => a.stageCount - b.stageCount),
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`\n✅ ${results.length} desafios salvos em ${path.relative(process.cwd(), OUTPUT)}`);
  console.log(
    `   Total de stages: ${results.reduce((sum, course) => sum + course.stageCount, 0)}`
  );
}

main().catch((error) => {
  console.error("\n💥 Falha ao sincronizar catálogo:", error.message);
  process.exit(1);
});
