import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const LINT_SCRIPT = path.resolve(__dirname, "..", "lint-migrations.js");

function runLint(workdir: string): { code: number; stdout: string; stderr: string } {
  // The script resolves migrations relative to __dirname, so invoke the
  // sandbox copy (not the source one) so it sees the sandbox migrations.
  const scriptInSandbox = path.join(workdir, "scripts", "lint-migrations.js");
  try {
    const stdout = execFileSync("node", [scriptInSandbox], {
      cwd: workdir,
      stdio: ["ignore", "pipe", "pipe"],
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

  it("skips files in the allowlist", () => {
    const filename = "20990101000000_legacy.sql";
    writeFileSync(path.join(dir, "supabase", "migrations", filename), "CREATE INDEX foo_idx ON foo (bar);");
    writeFileSync(path.join(dir, "supabase", "migrations.allowlist"), `# legacy\n${filename}\n`);
    const r = runLint(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("1 grandfathered");
  });

  it("ignores comments inside SQL", () => {
    writeFileSync(
      path.join(dir, "supabase", "migrations", "20990101000000_comment.sql"),
      "-- CREATE INDEX foo_idx ON foo (bar);\nCREATE INDEX CONCURRENTLY foo_idx ON foo (bar);",
    );
    expect(runLint(dir).code).toBe(0);
  });
});
