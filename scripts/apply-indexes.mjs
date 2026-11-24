import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SQL_FILE = path.join(ROOT, "prisma", "sql", "indexes.sql");
const CONTAINER = process.env.PW_POSTGRES_CONTAINER ?? "pw-postgres";

const sql = readFileSync(SQL_FILE, "utf8");

const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "wizard",
    "-d",
    "programming_wizard",
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
  ],
  { input: sql, stdio: ["pipe", "inherit", "inherit"] }
);

if (result.error) {
  console.error(`\nNão foi possível executar o Docker: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `\nFalha ao aplicar índices no container ${CONTAINER}. ` +
      "Confira se o Postgres está de pé (npm run db:up)."
  );
  process.exit(result.status ?? 1);
}

console.log(`Índices aplicados em ${CONTAINER}.`);
