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
 * マイグレーションが作るテーブル / ビューの一覧。
 *
 * 本番にしか無いオブジェクト（repo に CREATE が無い「ドリフト」）を
 * `DROP ... IF EXISTS ... ON <table>` で触ると、**PostgreSQL 16 では NOTICE で
 * skip されるが 15 では relation does not exist で落ちる。**
 * 手元の再生は 16、Supabase は 15 なので、再生では一度も再現しない。
 */
const CREATED_RELATIONS = (() => {
  const set = new Set();
  for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
    let m;
    while ((m = re.exec(sql)) !== null) set.add(m[1].toLowerCase());
  }
  return set;
})();

/**
 * Each rule receives the SQL text (with `--`-style comments stripped) and
 * returns an array of human-readable violation messages.
 */
const RULES = [
  {
    id: "create-index-without-concurrently",
    description: "CREATE INDEX must use CONCURRENTLY (otherwise locks the table for writes).",
    check(sql) {
      // Tables CREATE TABLE'd in this same migration: index-on-empty-table is OK,
      // because there are no concurrent writers to block. CONCURRENTLY in a
      // separate file is impractical anyway since Supabase wraps each migration
      // file in a transaction (CONCURRENTLY cannot run inside a transaction).
      const createdTables = new Set();
      const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
      let tm;
      while ((tm = tableRe.exec(sql)) !== null) {
        createdTables.add(tm[1].toLowerCase());
      }

      // Find every CREATE INDEX statement (with or without CONCURRENTLY / IF NOT EXISTS).
      const indexRe =
        /^[ \t]*CREATE\s+(?:UNIQUE\s+)?INDEX\b[^;]*?\bON\s+([a-zA-Z_][a-zA-Z0-9_]*)/gim;
      const violations = [];
      let im;
      while ((im = indexRe.exec(sql)) !== null) {
        const stmt = im[0];
        if (/\bCONCURRENTLY\b/i.test(stmt)) continue;
        const table = im[1].toLowerCase();
        if (createdTables.has(table)) continue; // empty new table → safe
        // First word(s) of the statement for a tidy message
        const head = stmt.match(/^[ \t]*CREATE\s+(?:UNIQUE\s+)?INDEX\b[^\n]*/i);
        violations.push(
          `${(head ? head[0] : stmt).trim()} — add CONCURRENTLY (and split into its own migration; CONCURRENTLY cannot run inside a transaction).`,
        );
      }
      return violations;
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
      // Capture the full statement up to `;` so the `NOT VALID` clause
      // (which appears AFTER the CHECK expression's closing paren) is visible
      // to the filter below.
      const re = /ADD\s+(CONSTRAINT\s+\S+\s+)?CHECK\s*\([^;]*/gi;
      const matches = sql.match(re) ?? [];
      return matches
        .filter((m) => !/NOT\s+VALID/i.test(m))
        .map((m) => {
          // Trim back to the CHECK (...) header for a tidy error message.
          const head = m.match(/ADD\s+(CONSTRAINT\s+\S+\s+)?CHECK\s*\([^)]*\)/i);
          return `${(head ? head[0] : m).trim()} — add NOT VALID, then VALIDATE CONSTRAINT separately.`;
        });
    },
  },
  {
    id: "security-definer-mutable-search-path",
    description:
      "SECURITY DEFINER functions must SET search_path = '' (empty) to prevent search_path hijacking; reference objects with a schema qualifier (e.g. public.foo).",
    check(sql) {
      // Inspect each CREATE [OR REPLACE] FUNCTION's FULL statement, including
      // options that appear AFTER the dollar-quoted body — Postgres accepts both
      // `... SECURITY DEFINER AS $$..$$` and `... AS $$..$$ LANGUAGE sql SECURITY
      // DEFINER`, so bounding at the first `AS` would miss the trailing form.
      // Comments are already stripped by stripComments(), so a "no SECURITY
      // DEFINER" note in a comment won't trigger this.
      const violations = [];
      const startRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([^\s(]+)/gi;
      let m;
      while ((m = startRe.exec(sql)) !== null) {
        const name = m[1];
        const startIdx = m.index;
        // Locate the dollar-quoted body opening (e.g. $$ or $func$) after the
        // signature, then its matching close, then extend to the next ';'.
        const after = sql.slice(startRe.lastIndex);
        const open = /\$([A-Za-z0-9_]*)\$/.exec(after);
        let stmtText;
        if (open) {
          const tag = open[1];
          const bodyOpenAbs = startRe.lastIndex + open.index + open[0].length;
          const closeIdxRel = sql.slice(bodyOpenAbs).indexOf(`$${tag}$`);
          if (closeIdxRel !== -1) {
            const closeEnd = bodyOpenAbs + closeIdxRel + tag.length + 2;
            const semi = sql.indexOf(";", closeEnd);
            stmtText = sql.slice(startIdx, semi === -1 ? sql.length : semi);
            startRe.lastIndex = closeEnd; // don't re-scan inside this body
          } else {
            stmtText = sql.slice(startIdx);
          }
        } else {
          const semi = sql.indexOf(";", startRe.lastIndex);
          stmtText = sql.slice(startIdx, semi === -1 ? sql.length : semi);
        }

        if (!/\bSECURITY\s+DEFINER\b/i.test(stmtText)) continue;
        // Accept only an explicitly-empty search_path: `= ''` or `TO ''`.
        const okEmpty = /\bSET\s+search_path\s*(?:=|TO)\s*''/i.test(stmtText);
        if (!okEmpty) {
          const found = /\bSET\s+search_path[^\n]*/i.exec(stmtText);
          violations.push(
            `${name} — SECURITY DEFINER function must "SET search_path = ''" (found: ${
              found ? found[0].trim() : "no search_path"
            }).`,
          );
        }
      }
      return violations;
    },
  },
  {
    id: "concurrently-in-multi-statement-file",
    description:
      "A file using CONCURRENTLY must contain exactly ONE statement (Supabase sends multi-statement migrations as a pipeline, and CONCURRENTLY cannot run in one).",
    check(sql) {
      // 2026-09-04 に実物のプレビュー DB で判明した制約。ファイル名順・1パスで流す
      // Supabase のブランチ機能は、1ファイルに複数文があるとパイプラインで送るため
      //   ERROR: CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)
      // で 2 文目以降が落ちる。手元の psql -f では再現しないので、静的に止める。
      if (!/\bCONCURRENTLY\b/i.test(sql)) return [];
      const statements = sql.split(";").filter((s) => s.trim());
      if (statements.length <= 1) return [];
      return [
        `CONCURRENTLY を含むのに ${statements.length} 文あります — CONCURRENTLY の文だけを別ファイルに分けてください（Supabase はパイプラインで送るため 2 文目以降が SQLSTATE 25001 で落ちます）。`,
      ];
    },
  },
  {
    id: "drop-if-exists-on-uncreated-relation",
    description:
      "DROP POLICY/TRIGGER IF EXISTS on a relation that no migration creates fails on PostgreSQL 15 (Supabase) even though PostgreSQL 16 skips it silently. Guard it with to_regclass.",
    check(sql) {
      const violations = [];
      // ON の後ろは schema.table か table。public 以外のスキーマ（storage.objects 等）は対象外。
      const re =
        /DROP\s+(POLICY|TRIGGER)\s+IF\s+EXISTS\s+[^;]*?\sON\s+(?:"?([a-z_][a-z0-9_]*)"?\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?/gi;
      let m;
      while ((m = re.exec(sql)) !== null) {
        const schema = (m[2] || "public").toLowerCase();
        const rel = m[3].toLowerCase();
        if (schema !== "public") continue;
        if (CREATED_RELATIONS.has(rel)) continue;
        // 同じファイル内で to_regclass ガードしていれば OK
        if (new RegExp(`to_regclass\\(\\s*'(?:public\\.)?${rel}'`, "i").test(sql)) continue;
        violations.push(
          `${m[0].trim()} — ${rel} を作るマイグレーションが無い（本番にしか無いオブジェクト）。PostgreSQL 15 では relation does not exist で落ちるので、to_regclass で存在を見てから実行してください。`,
        );
      }
      return violations;
    },
  }
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

// Structural check (runs on ALL files, allowlist included): two migration files
// must never share the same version prefix (the leading digits before the first
// `_`). `supabase db push` keys applied state on that version, so a second file
// with the same version is silently treated as already-applied — and push then
// fails as an out-of-order insert. This bit us once when two parallel PRs both
// picked `20260720000000` (webauthn vs customers_payment_cycle). Rename the
// newer file to a unique, later timestamp to resolve.
const versionOf = (filename) => {
  const m = /^(\d+)/.exec(filename);
  return m ? m[1] : filename.replace(/\.sql$/, "");
};
const byVersion = new Map();
for (const file of files) {
  const v = versionOf(file);
  if (!byVersion.has(v)) byVersion.set(v, []);
  byVersion.get(v).push(file);
}
for (const [version, group] of byVersion) {
  if (group.length < 2) continue;
  hasErrors = true;
  console.error(`\n❌ duplicate migration version ${version}:`);
  for (const f of group) console.error(`   - ${f}`);
  console.error(
    `   [duplicate-version] rename the newer file to a unique, later timestamp — supabase db push keys on the version prefix and will skip/refuse the collision.`,
  );
}

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
