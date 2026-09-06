import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { describe, it, expect } from "vitest";

/**
 * db-migrate.yml の「失敗を Slack に通知」ステップを実際に走らせる。
 *
 * なぜ要るか: このステップは `if: failure()` の中にあるので、**本番の適用が実際に
 * 失敗するまで一度も実行されない**。2026-09-06 まで、jq のプログラムを
 * シングルクォートで囲みながら本文に `'<対象>'` と書いていたためシェルが
 * `<対象>` をリダイレクトと解釈し、ステップは毎回 exit 1 していた。
 * つまり **db-migrate の失敗通知は一度も配信されていなかった**（M-047）。
 *
 * 「ワークフローを実行せずには検証できない」と書いていたが、ステップの run: を
 * 抜き出して走らせれば手元で確認できる。curl だけ差し替えて payload 生成までを見る。
 */
const WORKFLOW = path.resolve(__dirname, "..", "..", ".github", "workflows", "db-migrate.yml");

function notifyStepScript(): string {
  const doc = yaml.load(readFileSync(WORKFLOW, "utf8")) as {
    jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }>;
  };
  const step = doc.jobs.migrate.steps.find((s) => (s.name ?? "").includes("Slack"));
  if (!step?.run) throw new Error("db-migrate.yml に Slack 通知ステップが見つからない");
  // 実際に Slack へ POST はしない。payload が組めるかだけを見る。
  const i = step.run.indexOf("curl -sS");
  if (i < 0) throw new Error("通知ステップの curl が見つからない（構造が変わった？）");
  return step.run.slice(0, i) + 'printf %s "$payload" | jq -e . >/dev/null\n';
}

function runNotify(commitMsg: string): { code: number; stderr: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "notify-"));
  try {
    const sh = path.join(dir, "notify.sh");
    writeFileSync(sh, notifyStepScript());
    execFileSync("bash", [sh], {
      env: {
        ...process.env,
        SLACK_WEBHOOK_URL: "https://example.invalid/hook",
        RUN_URL: "https://example.invalid/run",
        COMMIT_MSG: commitMsg,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer };
    return { code: err.status ?? 1, stderr: err.stderr?.toString() ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("db-migrate の失敗通知", () => {
  it("素直なコミットメッセージで payload を組める", () => {
    expect(runNotify("fix: 何かを直した").code).toBe(0);
  });

  it("バッククォート・シングルクォート・複数行を含んでも壊れない", () => {
    // 実際に落ちたときのコミットメッセージがこの形だった。
    const msg = "feat: 見出し\n\n本文に `バッククォート` と 'シングルクォート' と \"ダブル\" を含む";
    expect(runNotify(msg).code).toBe(0);
  });

  it("jq のプログラム本文にシングルクォートが無い（あるとシェルが文字列を閉じる）", () => {
    const script = notifyStepScript();
    const start = script.indexOf("jq -n");
    const program = script.slice(script.indexOf("'{", start), script.lastIndexOf("}')") + 2);
    expect(program.length).toBeGreaterThan(10);
    // 先頭と末尾のクォートを除いた中身に ' があってはいけない。
    expect(program.slice(1, -1)).not.toContain("'");
  });
});
