#!/usr/bin/env node
/**
 * Idempotent runner for worker/migrate_v2.sql.
 *
 * SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so this reads the current columns of each
 * table (`PRAGMA table_info`) and executes only the statements whose column is missing. Running it
 * again is a no-op, and a partially applied migration is completed.
 *
 *   node scripts/migrate-v2.mjs --remote                      # live D1 database
 *   node scripts/migrate-v2.mjs --local [--persist-to <dir>]  # wrangler dev database
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE = "spinventory-db";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = join(root, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
const targetArgs = process.argv.slice(2);

if (!targetArgs.includes("--local") && !targetArgs.includes("--remote")) {
  console.error("Usage: node scripts/migrate-v2.mjs --local|--remote [--persist-to <dir>]");
  process.exit(1);
}

const sql = readFileSync(join(root, "worker", "migrate_v2.sql"), "utf8");
const statements = [...sql.matchAll(/^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\b[^;]*;/gim)].map(
  ([statement, table, column]) => ({ statement: statement.trim(), table, column }),
);

/** Runs SQL through `wrangler d1 execute --json` and returns its result sets. */
function execute(command) {
  const output = execFileSync(wrangler, ["d1", "execute", DATABASE, ...targetArgs, "--yes", "--json", "--command", command], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  // Tolerate banners around the JSON payload.
  return JSON.parse(output.slice(output.indexOf("["), output.lastIndexOf("]") + 1));
}

const columns = new Map();
for (const table of new Set(statements.map((item) => item.table))) {
  const [result] = execute(`PRAGMA table_info(${table})`);
  const names = (result?.results ?? []).map((row) => row.name);
  if (!names.length) {
    console.error(`Table "${table}" does not exist yet: apply worker/schema.sql instead (pnpm run db:migrate:local|remote).`);
    process.exit(1);
  }
  columns.set(table, new Set(names));
}

const missing = statements.filter(({ table, column }) => !columns.get(table).has(column));
if (!missing.length) {
  console.log(`✔ ${DATABASE}: all ${statements.length} v2 columns already exist, nothing to do.`);
} else {
  console.log(`Adding ${missing.length} column(s) to ${DATABASE}: ${missing.map(({ table, column }) => `${table}.${column}`).join(", ")}`);
  execute(missing.map(({ statement }) => statement).join("\n"));
  console.log("✔ Migration v2 applied; existing rows are unchanged.");
}
