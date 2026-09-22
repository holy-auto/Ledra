import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { INSURER_USABLE_STATUSES } from "../insurerAuth";

/**
 * 「保険会社が使える状態」の規則が**1箇所にあること**を検査する。
 *
 * これは**構造の検査であって、振る舞いの証明ではない**（MISTAKE_LEDGER 型 G）。
 * 実際に停止中が弾かれるかは DB 側の
 * `scripts/replay/checks/insurer_rls_suspension_gate.sql` が行を入れて確かめている。
 * ここが守るのは「同じ規則を別の場所に書き直していないか」だけ。
 *
 * なぜ要るか: 2026-09-21 まで、この規則は**3箇所に別々の値で**書かれていた。
 *   - resolveInsurerCaller  … active + active_pending_review（正しい）
 *   - /api/insurer/switch GET  … active のみ（**審査中が切替リストに出ない**）
 *   - /api/insurer/switch POST … insurers を一度も見ない（**停止中でも切り替わる**）
 * 型も lint も通る食い違いなので、文字列を数えるしかない。
 */
describe("INSURER_USABLE_STATUSES", () => {
  it("停止中だけを外した2つである", () => {
    expect([...INSURER_USABLE_STATUSES].sort()).toEqual(["active", "active_pending_review"]);
    expect(INSURER_USABLE_STATUSES as readonly string[]).not.toContain("suspended");
  });

  it("insurers を status で絞る箇所が、定数を使わず文字列を直書きしていない", () => {
    // 対象は保険会社の文脈を解決する経路だけ。管理画面（/admin/insurers）は
    // 状態そのものを編集する画面なので、直書きが正当であり対象外。
    const files = ["src/lib/api/insurerAuth.ts", "src/app/api/insurer/switch/route.ts"];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      // コメント行は除く（この食い違いの経緯をコメントで説明しているため）
      const code = src
        .split("\n")
        .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
        .join("\n");
      expect(code, `${f} が status を直書きしている`).not.toMatch(/\.eq\(\s*["']status["']\s*,\s*["']active["']\s*\)/);
      expect(code, `${f} が status の配列を直書きしている`).not.toMatch(
        /\.in\(\s*["']status["']\s*,\s*\[\s*["']active["']/,
      );
    }
  });

  it("DB 側の2つの関数が、同じ集合を使っている", () => {
    // SQL 側にも同じ規則がある。ここがずれると「アプリは通すのに DB が弾く」
    // （またはその逆）になり、画面が理由の分からない失敗をする。
    const dir = join(process.cwd(), "supabase/migrations");
    const wanted = [...INSURER_USABLE_STATUSES].sort().join(",");
    // 関数を最後に定義しているマイグレーションを、版番号順の末尾から探す
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const fn of ["current_insurer_access", "my_insurer_ids"]) {
      // **本体を取り出すのと同じ正規表現で選ぶ。** `FUNCTION public.<名前>(` だけで
      // 選ぶと GRANT / REVOKE / COMMENT / DROP ... ON FUNCTION にも当たり、
      // 後から権限だけ触るマイグレーションが来た瞬間に「本体が無い」で落ちる
      // （/code-review 指摘）。
      const defRe = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}\\s*\\(`, "i");
      const last = [...files].reverse().find((f) => defRe.test(readFileSync(join(dir, f), "utf8")));
      expect(last, `${fn} を定義しているマイグレーションが無い`).toBeDefined();
      const file = readFileSync(join(dir, last as string), "utf8");
      // **関数本体だけを見る。** ファイル全体を対象にすると、同じファイルの別の関数や
      // 先頭のコメントにある `status IN (...)` を拾う。最初にこの検査を書いたときに
      // 実際に拾い、コメントの「...」を状態集合として比べて落ちた。
      const bodyMatch = file.match(
        new RegExp(
          `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
          "i",
        ),
      );
      expect(bodyMatch, `${fn} の本体が見つからない`).not.toBeNull();
      const body = (bodyMatch as RegExpMatchArray)[1];
      const m = body.match(/status\s+IN\s*\(([^)]*)\)/i);
      expect(m, `${fn} の本体に status の条件が無い（停止ゲートが外れている可能性）`).not.toBeNull();
      const got = (m as RegExpMatchArray)[1]
        .split(",")
        .map((x) => x.trim().replace(/^'|'$/g, ""))
        .sort()
        .join(",");
      expect(got, `${fn}（${last}）の状態集合が TS 側とずれている`).toBe(wanted);
    }
  });
});
