/**
 * `scripts/check-schema.mjs` の**解析部分**のテスト。
 *
 * なぜ要るか: この検査は「壊れたクエリを落とす」ためのものなのに、解析が甘いと
 * **落とすべきものを黙って通す**。実際に3回それが起きた。
 *   1. `.from("a").update(...)` の直後の `.from("b").select(...)` を取り違える
 *   2. `"a, b" + "c, d"` の連結を1つ目のリテラルだけで判断する
 *   3. 括弧の対応が取れないときに空文字を返し、引数なしの `.select()` と同じ扱いになる
 * どれも4行の入力で再現できたので、ここに固定する。
 *
 * 実際のスキーマとの照合は本体（npm run check:schema）が見る。ここは
 * 「どの文字列を列として読み取るか」だけを確かめる。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

/**
 * 一時ディレクトリに1ファイルだけ置いて検査を走らせ、出力を返す。
 * 走査対象は環境変数で差し替える（本体は CHECK_SCHEMA_DIRS を見る）。
 */
function runChecker(source: string): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "schema-check-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "sample.ts"), source);
    try {
      const out = execFileSync("node", [join(ROOT, "scripts", "check-schema.mjs")], {
        encoding: "utf8",
        env: { ...process.env, CHECK_SCHEMA_DIRS: join(dir, "src") },
      });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 実在しない列。どの書き方でもこれが検出されなければ検査が効いていない */
const BAD = "nosuch_column_xyz";

describe("check-schema の解析", () => {
  it("素直な文字列リテラルの誤りを落とす（土台の確認）", () => {
    const r = runChecker(`supabase.from("agents").select("id, ${BAD}");`);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("**連結された**文字列の2つ目に混ざった誤りも落とす", () => {
    const r = runChecker(`supabase.from("agents").select("id, name, " + "status, ${BAD}");`);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("式の途中にコメントがあっても列として読む（不明扱いに落とさない）", () => {
    const r = runChecker(`supabase.from("agents").select("id, ${BAD}" /* 注 */, { count: "exact" });`);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("三項演算子は**両方の枝**を見る", () => {
    const r = runChecker(
      `const A = "id, name";\nconst B = "id, ${BAD}";\nsupabase.from("agents").select(cond ? A : B);`,
    );
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("定数で渡した列も追う", () => {
    const r = runChecker(`const COLS = \`id, ${BAD}\`;\nsupabase.from("agents").select(COLS);`);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("書き込みのキーも見る。文字列の中の波括弧で切れない", () => {
    const r = runChecker(`supabase.from("agents").insert({ notes: "a } b", ${BAD}: 1 });`);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("解決できない書き方は**通さず**「読めない」として数える", () => {
    const r = runChecker(`supabase.from("agents").select(buildCols());`);
    expect(r.out).toContain("中身を読めないクエリ 1 件");
  });

  it("引数なしの .select() は全列。誤検出しない", () => {
    const r = runChecker(`supabase.from("agents").insert({ name: "A" }).select();`);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("解決できない");
  });

  it("JSDoc の @example の中のクエリは実コードとして扱わない", () => {
    const r = runChecker(`/**\n * @example\n * supabase.from("agents").select("id, ${BAD}")\n */\nexport const x = 1;`);
    expect(r.code).toBe(0);
  });

  it("`const rows = xs.map((x) => ({...}))` の書き込みも中身を見る", () => {
    const r = runChecker(
      `const rows = items.map((i) => ({ name: i.name, ${BAD}: i.v }));\n` +
        `await db.from("agents").insert(rows);`,
    );
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("map の定義を**文をまたいで**別の変数と取り違えない", () => {
    // `let n = 0;` の次の行の map を n の定義として拾っていた
    const r = runChecker(
      `let n = 0;\n` +
        `const rows = items.map((i) => ({ name: i.name, ${BAD}: 1 }));\n` +
        `await db.from("agents").insert(rows);`,
    );
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("フィルタの列名も見る（存在しない列でフィルタしても 400 になる）", () => {
    const r = runChecker(`supabase.from("agents").select("id").eq("${BAD}", 1);`);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it(".or() の中の列名も見る", () => {
    const r = runChecker(`supabase.from("agents").select("id").or("status.eq.active,${BAD}.is.null");`);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`agents.${BAD}`);
  });

  it("埋め込み先のフィルタ（`表.列`）は対象外。誤検知しない", () => {
    const r = runChecker(
      `supabase.from("agents").select("id, tenants!inner(name)").eq("tenants.${BAD}", 1);`,
    );
    expect(r.code).toBe(0);
  });

  it("入れ子のチェーンのフィルタを親テーブルの列と取り違えない", () => {
    const r = runChecker(
      `await db.from("agents").select("id").in("id", (await db.from("tenants").select("id").eq("${BAD}", 1)).data);`,
    );
    // 内側は tenants のフィルタ。agents の列として報告してはいけない
    expect(r.out).not.toContain(`agents.${BAD}`);
  });

  it("同じ文の中の**別の**チェーンのフィルタを吸い込まない", () => {
    // Promise.all の要素が `;` 無しで続く形。実際にこれで 2 件誤検知した
    const r = runChecker(
      `await Promise.all([\n` +
        `  supabase.from("agents").select("id").eq("status", "a"),\n` +
        `  q5.eq("${BAD}", 1),\n` +
        `]);`,
    );
    expect(r.out).not.toContain(`agents.${BAD}`);
  });

  it("`.from(a).update(...)` の直後の `.from(b).select(...)` を取り違えない", () => {
    const r = runChecker(
      `await supabase.from("agents").update({ name: "A" }).eq("id", id);\n` +
        `await supabase.from("tenants").select("id, name");`,
    );
    expect(r.code).toBe(0);
  });
});
