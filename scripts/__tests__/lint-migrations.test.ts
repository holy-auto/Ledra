import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const LINT_SCRIPT = path.resolve(__dirname, "..", "lint-migrations.js");

function runLint(
  workdir: string,
  env: NodeJS.ProcessEnv = {},
): { code: number; stdout: string; stderr: string } {
  // The script resolves migrations relative to __dirname, so invoke the
  // sandbox copy (not the source one) so it sees the sandbox migrations.
  const scriptInSandbox = path.join(workdir, "scripts", "lint-migrations.js");
  try {
    const stdout = execFileSync("node", [scriptInSandbox], {
      cwd: workdir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "", ...env },
    }).toString();
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

function setupSandbox(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "lint-migrations-"));
  mkdirSync(path.join(dir, "supabase", "migrations"), { recursive: true });
  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  cpSync(LINT_SCRIPT, path.join(dir, "scripts", "lint-migrations.js"));
  return dir;
}

describe("lint-migrations", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupSandbox();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes for an empty migrations directory", () => {
    const r = runLint(dir);
    expect(r.code).toBe(0);
  });

  it("passes for CREATE INDEX CONCURRENTLY", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_idx.sql"),
      "CREATE INDEX CONCURRENTLY foo_idx ON foo (bar);",
    );
    expect(runLint(dir).code).toBe(0);
  });

  it("flags CREATE INDEX without CONCURRENTLY", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_idx.sql"),
      "CREATE INDEX foo_idx ON foo (bar);",
    );
    const r = runLint(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("create-index-without-concurrently");
  });

  it("flags ADD COLUMN NOT NULL without DEFAULT", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_col.sql"),
      "ALTER TABLE foo ADD COLUMN bar text NOT NULL;",
    );
    const r = runLint(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("add-column-not-null-without-default");
  });

  it("passes ADD COLUMN NOT NULL DEFAULT", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_col.sql"),
      "ALTER TABLE foo ADD COLUMN bar text NOT NULL DEFAULT '';",
    );
    expect(runLint(dir).code).toBe(0);
  });

  it("flags ALTER COLUMN TYPE", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_type.sql"),
      "ALTER TABLE foo ALTER COLUMN bar TYPE bigint;",
    );
    const r = runLint(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("alter-column-type");
  });

  it("flags RENAME COLUMN", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_rename.sql"),
      "ALTER TABLE foo RENAME COLUMN bar TO baz;",
    );
    const r = runLint(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("rename-column");
  });

  it("flags FOREIGN KEY without NOT VALID", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_fk.sql"),
      "ALTER TABLE foo ADD CONSTRAINT fk_x FOREIGN KEY (x) REFERENCES bar(id);",
    );
    const r = runLint(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("add-foreign-key-without-not-valid");
  });

  it("passes FOREIGN KEY NOT VALID", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_fk.sql"),
      "ALTER TABLE foo ADD CONSTRAINT fk_x FOREIGN KEY (x) REFERENCES bar(id) NOT VALID;",
    );
    expect(runLint(dir).code).toBe(0);
  });

  it("flags ADD CHECK without NOT VALID", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_check.sql"),
      "ALTER TABLE foo ADD CONSTRAINT chk_x CHECK (x >= 0);",
    );
    const r = runLint(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("add-check-without-not-valid");
  });

  it("passes ADD CHECK NOT VALID", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_check.sql"),
      "ALTER TABLE foo ADD CONSTRAINT chk_x CHECK (x >= 0) NOT VALID;",
    );
    expect(runLint(dir).code).toBe(0);
  });

  it("skips files in the allowlist", () => {
    const filename = "20990101000000_legacy.sql";
    writeFileSync(path.join(dir, "supabase", "migrations", filename), "CREATE INDEX foo_idx ON foo (bar);");
    writeFileSync(path.join(dir, "supabase", "migrations.allowlist"), `# legacy\n${filename}\n`);
    const r = runLint(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("1 grandfathered");
  });

  it("flags two migration files sharing the same version prefix", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_alpha.sql"),
      "CREATE TABLE alpha (id uuid);",
    );
    writeFileSync(path.join(dir, "supabase", "migrations", "20990101000000_beta.sql"), "CREATE TABLE beta (id uuid);");
    const r = runLint(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("duplicate migration version 20990101000000");
    expect(r.stderr).toContain("20990101000000_alpha.sql");
    expect(r.stderr).toContain("20990101000000_beta.sql");
  });

  it("does not flag distinct version prefixes", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_alpha.sql"),
      "CREATE TABLE alpha (id uuid);",
    );
    writeFileSync(path.join(dir, "supabase", "migrations", "20990101000001_beta.sql"), "CREATE TABLE beta (id uuid);");
    expect(runLint(dir).code).toBe(0);
  });

  it("flags a duplicate version even when one file is allowlisted", () => {
    // A collision is structural — the allowlist (which only waives lock-safety
    // rules) must not hide it.
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_alpha.sql"),
      "CREATE TABLE alpha (id uuid);",
    );
    writeFileSync(path.join(dir, "supabase", "migrations", "20990101000000_beta.sql"), "CREATE TABLE beta (id uuid);");
    writeFileSync(path.join(dir, "supabase", "migrations.allowlist"), "# legacy\n20990101000000_alpha.sql\n");
    expect(runLint(dir).code).toBe(1);
  });

  it("ignores comments inside SQL", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_comment.sql"),
      "-- CREATE INDEX foo_idx ON foo (bar);\nCREATE INDEX CONCURRENTLY foo_idx ON foo (bar);",
    );
    expect(runLint(dir).code).toBe(0);
  });

  // ── migration-version-before-base-head ───────────────────────────────────
  //
  // 本番の `supabase db push` は、本番の schema_migrations の最新より古い未適用が
  // あると out-of-order で停止し、以降のマイグレーションが本番へ届かなくなる。
  //
  // **当初は「base に在るどれよりも後なら安全」という十分条件で判定していた。
  // これは誤りだった。** apply_migration で本番へ直接当てた版は main を通らないので、
  // base の最新が本番の最新より前になりうる。実際 #1020 の4本はそれで緑のまま通り、
  // 本番の適用を止めた。しきい値は base と `migrations.production-ledger` の
  // 本番最新の**大きい方**を使う。

  function writeLedger(workdir: string, body: string) {
    writeFileSync(path.join(workdir, "supabase", "migrations.production-ledger"), body);
  }

  // 免除欄は `<版> <sha256>` の対で書く。中身を固定しないと、免除された版の
  // ファイルを後から書き換えて本番と静かに食い違わせられる。
  const EXEMPT_SQL = "ALTER TABLE documents ADD COLUMN IF NOT EXISTS public_id text;";
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");

  function initRepoWithBase(workdir: string, baseFiles: string[]) {
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: workdir, stdio: ["ignore", "pipe", "pipe"] });
    git("init", "--initial-branch=main", "--quiet");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    for (const f of baseFiles) {
      writeFileSync(path.join(workdir, "supabase", "migrations", f), "select 1;");
    }
    git("add", "-A");
    git("commit", "--quiet", "-m", "base");
  }

  it("flags a migration added by the branch that sorts before the base head", () => {
    initRepoWithBase(dir, ["20990101000000_base.sql"]);
    // base より前の日付を後から足す＝本番の db push が out-of-order で止まる形
    writeFileSync(path.join(dir, "supabase", "migrations", "20180101000000_backdated.sql"), "select 1;");
    const r = runLint(dir, { CI: "1" });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("migration-version-before-base-head");
  });

  it("passes when the migration added by the branch sorts after the base head", () => {
    initRepoWithBase(dir, ["20990101000000_base.sql"]);
    writeFileSync(path.join(dir, "supabase", "migrations", "20990101000001_later.sql"), "select 1;");
    expect(runLint(dir, { CI: "1" }).code).toBe(0);
  });

  // 以下4件は、この検査が **#1020 の実際の失敗を止められるか** を見る回帰テスト。
  // 当時の値をそのまま使う: base(main) の最新 20260905142740、本番の最新 20260906094735
  // （#966 が apply_migration で直接当てていた）、追加した4本 20260906000000〜000003。

  it("flags the #1020 case: newer than base head but older than the production head", () => {
    initRepoWithBase(dir, ["20260905142740_base.sql"]);
    writeLedger(dir, `max: 20260906094735\n20260906094512  ${sha(EXEMPT_SQL)}\n`);
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20260906000000_certificates_job_order_link.sql"),
      "select 1;",
    );
    const r = runLint(dir, { CI: "1" });
    // base とだけ比べていた頃はここが 0 で通り、本番の適用が止まった。
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("migration-version-before-base-head");
    expect(r.stderr).toContain("本番の台帳");
  });

  it("exempts a version the production ledger records as already applied", () => {
    // 不変条件1（本番に在る版のファイルが repo に在ること）を直すための補い。
    // 本番が適用済みなので db push は再実行せず、out-of-order を起こしようがない。
    initRepoWithBase(dir, ["20260906100003_base.sql"]);
    writeLedger(dir, `max: 20260906094735\n20260906094512  ${sha(EXEMPT_SQL)}\n`);
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20260906094512_documents_public_id.sql"),
      EXEMPT_SQL,
    );
    expect(runLint(dir, { CI: "1" }).code).toBe(0);
  });

  it("still flags a backdated version that the ledger does NOT record as applied", () => {
    // 免除欄は「本番が適用済み」という事実の記録であって、汎用の逃げ道ではない。
    initRepoWithBase(dir, ["20260906100003_base.sql"]);
    writeLedger(dir, `max: 20260906094735\n20260906094512  ${sha(EXEMPT_SQL)}\n`);
    writeFileSync(path.join(dir, "supabase", "migrations", "20260906094600_other.sql"), "select 1;");
    expect(runLint(dir, { CI: "1" }).code).toBe(1);
  });

  it("flags an exempt version whose file content drifted from the pinned hash", () => {
    // 免除を版番号だけの鍵にすると、免除された版のファイルの中身を後から書き換えられる。
    // 本番は適用済みなので db push は再実行せず、空 DB への再生だけが新しい方を流す。
    // どの検査も鳴らないまま本番と repo が食い違う（/code-review の指摘）。
    initRepoWithBase(dir, ["20260906100003_base.sql"]);
    writeLedger(dir, `max: 20260906094735\n20260906094512  ${sha(EXEMPT_SQL)}\n`);
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20260906094512_documents_public_id.sql"),
      `${EXEMPT_SQL}\n-- 後から足された行`,
    );
    const r = runLint(dir, { CI: "1" });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("sha256");
  });

  it("KNOWN CEILING: a stale ledger max degrades to the base-only comparison, which MISSES", () => {
    // **これは「緩まない」ではない。** max が古いとしきい値が base へ落ち、それは
    // #1020 を通した当時の検査そのもの。当初「古くても緩まない」と4つの文書に書いたが
    // 誤りで、実際は見逃す（M-064）。このテストは天井を明示的に固定する。
    //
    // 検出は lint ではなく .github/workflows/db-migrate.yml 側（本番の資格情報を持つ）。
    // ここが 0 のままなのは仕様であって、直したくなったら db-migrate の方を見ること。
    initRepoWithBase(dir, ["20260905142740_base.sql"]);
    writeLedger(dir, "max: 20260905142740\n"); // 本番は実際には 20260906094735 まで進んでいる
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20260906000000_certificates_job_order_link.sql"),
      "select 1;",
    );
    expect(runLint(dir, { CI: "1" }).code).toBe(0);
  });

  it("falls back to the base comparison when the ledger is absent or stale", () => {
    // 台帳が古い（max が base より前）なら base が効くだけで、緩まない。
    initRepoWithBase(dir, ["20990101000000_base.sql"]);
    writeLedger(dir, "max: 20260101000000\n");
    writeFileSync(path.join(dir, "supabase", "migrations", "20180101000000_backdated.sql"), "select 1;");
    expect(runLint(dir, { CI: "1" }).code).toBe(1);
  });

  it("fails loudly on a ledger line it cannot parse", () => {
    // しきい値を静かに読み違えると、検査は緑のまま守っていない状態になる。
    initRepoWithBase(dir, ["20990101000000_base.sql"]);
    writeLedger(dir, "max: 20260906094735\nnot-a-version\n");
    const r = runLint(dir, { CI: "1" });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("production-ledger");
  });

  it("does not fail in CI when the sandbox is not a git repository at all", () => {
    // 「repo なのに base ref が無い」（CI の設定ミス）だけを落とす。git 管理外の
    // ディレクトリまで落とすと、このテスト自身を含め無関係な呼び出しが全部赤くなる。
    writeFileSync(path.join(dir, "supabase", "migrations", "20990101000000_ok.sql"), "select 1;");
    expect(runLint(dir, { CI: "1" }).code).toBe(0);
  });
});
