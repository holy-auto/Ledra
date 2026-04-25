#!/usr/bin/env node
/**
 * Migration safety lint.
 *
 * Scans supabase/migrations for patterns that risk taking ACCESS EXCLUSIVE
 * locks or rewriting whole tables synchronously, and exits non-zero when a
 * NEW migration file (not in the allowlist of already-shipped ones) violates
 * the rules.
 *
 * Why an allowlist? The 130+ migrations that already ran on production are
 * untouchable — re-running them is impossible and rewriting history would
 * desync local/CI/prod schemas. The allowlist freezes the state at the moment
 * we adopted this policy; everything added afterwards has to follow the rules.
 *
 * Run via:
 *   node scripts/lint-migrations.js
 *   npm run lint:migrations
 *
 * Exit codes:
 *   0  — clean
 *   1  — violations found
 */
const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");
const ALLOWLIST_FILE = path.join(__dirname, "..", "supabase", "migrations.allowlist");

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.log("[lint-migrations] no migrations directory, skipping");
  process.exit(0);
}

const allowlist = new Set(
  fs.existsSync(ALLOWLIST_FILE)
    ? fs.readFileSync(ALLOWLIST_FILE, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    : [],
);

/**
 * Each rule receives the SQL text (with `--`-style comments stripped) and
 * returns an array of human-readable violation messages.
 */
const RULES = [
  {
    id: "create-index-without-concurrently",
    description: "CREATE INDEX must use CONCURRENTLY (otherwise locks the table for writes).",
    check(sql) {
      const matches = sql.match(/^[ \t]*CREATE\s+(UNIQUE\s+)?INDEX\b(?!\s+CONCURRENTLY)/gim) ?? [];
      return matches.map((m) => `${m.trim()} — add CONCURRENTLY (and split into its own migration; CONCURRENTLY cannot run inside a transaction).`);
    },
  },
  {
    id: "drop-index-without-concurrently",
    description: "DROP INDEX must use CONCURRENTLY (otherwise blocks queries on the table).",
    check(sql) {
      const matches = sql.match(/^[ \t]*DROP\s+INDEX\b(?!\s+(CONCURRENTLY|IF))/gim) ?? [];
      const filtered = matches.filter((m) => !/CONCURRENTLY/i.test(m));
      return filtered.map((m) => `${m.trim()} — add CONCURRENTLY.`);
    },
  },
  {
    id: "add-column-not-null-without-default",
    description: "ADD COLUMN ... NOT NULL without DEFAULT rewrites the whole table and fails if rows exist.",
    check(sql) {
      // very conservative: split on commas inside one ALTER TABLE is hard, so
      // we only flag the simple form `ADD COLUMN foo TYPE NOT NULL` with no DEFAULT before the next `,` / `;`.
      const re = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+[^,;]*?\bNOT\s+NULL\b[^,;]*/gi;
      const matches = sql.match(re) ?? [];
      return matches
        .filter((m) => !/\bDEFAULT\b/i.test(m) && !/\bGENERATED\b/i.test(m))
        .map((m) => `${m.trim()} — add DEFAULT or split into ADD COLUMN nullable → backfill → SET NOT NULL.`);
    },
  },
  {
    id: "alter-column-type",
    description: "ALTER COLUMN ... TYPE rewrites the table and takes ACCESS EXCLUSIVE on it.",
    check(sql) {
      const matches = sql.match(/ALTER\s+(TABLE\s+\S+\s+)?ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b[^;]*/gi) ?? [];
      return matches.map((m) => `${m.trim()} — split into add-new-column → backfill → switch reads/writes → drop-old-column over multiple deploys.`);
    },
  },
  {
    id: "rename-column",
    description: "RENAME COLUMN breaks any running app code that still references the old name.",
    check(sql) {
      const matches = sql.match(/RENAME\s+COLUMN\s+\S+\s+TO\s+\S+/gi) ?? [];
      return matches.map((m) => `${m.trim()} — add the new column, dual-write, migrate readers, then drop the old column instead.`);
    },
  },
  {
    id: "rename-table",
    description: "RENAME TABLE breaks running app code.",
    check(sql) {
      const matches = sql.match(/ALTER\s+TABLE\s+\S+\s+RENAME\s+TO\s+\S+/gi) ?? [];
      return matches.map((m) => `${m.trim()} — create a view with the old name or do an expand/contract with two deploys.`);
    },
  },
  {
    id: "add-foreign-key-without-not-valid",
    description: "ADD CONSTRAINT ... FOREIGN KEY without NOT VALID validates every row under ACCESS EXCLUSIVE.",
    check(sql) {
      const re = /ADD\s+(CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\b[^;]*/gi;
      const matches = sql.match(re) ?? [];
      return matches
        .filter((m) => !/NOT\s+VALID/i.test(m))
        .map((m) => `${m.trim()} — add NOT VALID, then VALIDATE CONSTRAINT in a follow-up migration (lighter lock).`);
    },
  },
  {
    id: "add-check-without-not-valid",
    description: "ADD CONSTRAINT ... CHECK without NOT VALID scans the whole table under ACCESS EXCLUSIVE.",
    check(sql) {
      const re = /ADD\s+(CONSTRAINT\s+\S+\s+)?CHECK\s*\([^)]*\)/gi;
      const matches = sql.match(re) ?? [];
      return matches
        .filter((m) => !/NOT\s+VALID/i.test(m))
        .map((m) => `${m.trim()} — add NOT VALID, then VALIDATE CONSTRAINT separately.`);
    },
  },
];

function stripComments(sql) {
  // strip -- line comments
  return sql.replace(/--[^\n]*\n/g, "\n");
}

function lintFile(filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = stripComments(fs.readFileSync(filePath, "utf8"));
  const violations = [];
  for (const rule of RULES) {
    const issues = rule.check(sql);
    for (const issue of issues) {
      violations.push({ rule: rule.id, message: issue, description: rule.description });
    }
  }
  return violations;
}

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let hasErrors = false;
let scanned = 0;
let skipped = 0;

for (const file of files) {
  if (allowlist.has(file)) {
    skipped++;
    continue;
  }
  scanned++;
  const violations = lintFile(file);
  if (violations.length === 0) continue;

  hasErrors = true;
  console.error(`\n❌ ${file}`);
  for (const v of violations) {
    console.error(`   [${v.rule}] ${v.message}`);
    console.error(`     → ${v.description}`);
  }
}

if (hasErrors) {
  console.error(
    `\nlint-migrations: violations found (${scanned} new migration(s) scanned, ${skipped} grandfathered).`,
  );
  console.error(
    "If a violation is unavoidable for an emergency fix, add the file to supabase/migrations.allowlist with a comment explaining why and link the operations-guide entry.",
  );
  process.exit(1);
}

console.log(
  `✅ lint-migrations OK (${scanned} new migration(s) checked, ${skipped} grandfathered).`,
);
