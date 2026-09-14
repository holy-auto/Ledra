/**
 * `apiError()` の応答は `{ error: コード文字列, message: 人間向け }` の2本立て。
 * 画面が `message` より先に `error` を読むと、ユーザーには `"internal_error"` のような
 * **コード文字列だけ**が出て、原因調査のたびにサーバーログを見に行くことになる。
 *
 * 2026-09-05 に 53 ファイル / 103 箇所を一括で `message` 優先へ寄せた
 * （DECISION_LOG 2026-09-05）。ここはその状態を固定する検査。
 *
 * ## 対象の絞り方
 *
 * `.error` を読む行を全部見てはいけない。`.error` は他にも山ほどある——
 * Supabase の `{ data, error }`、IndexedDB の `tx.error`、Zod の `parsed.error`、
 * 音声認識イベントの `ev.error`、Slack OAuth の `res.error`。
 * これらは `apiError()` とは無関係で、直すと壊れる。
 * **`await res.json()` / `await parseJsonSafe(res)` から来た変数だけ**を見る。
 *
 * 起票時の「83ファイル」は、この絞り込みをせずに数えた値だったとみられる
 * （同じ広さで数え直すと 79 ファイルになる）。実際の該当は 53 ファイルだった。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** パース済み API 応答が入る変数名。`.json()` 直呼びと `parseJsonSafe` ヘルパーの両方。 */
const JSON_ASSIGN =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*\(?\s*await\s+[^;\n]*?(?:\.json\(\)|parseJsonSafe\s*(?:<[^>]*>)?\s*\()/g;

/**
 * `message` より先に `error` を読んでいる箇所を返す。
 *
 * **行単位で見てはいけない。** 実際のコードは
 * `json?.message ??\n  json?.error ??\n  "…"` のように改行をまたぐ。
 * 行で切ると、正しい形を違反と誤検出し（`MaterialsManager.tsx`）、
 * 逆に直前行の `message` が見えず二重に挿入する事故も起きる
 * （この一括修正の初回で実際に1件やった。MISTAKE_LEDGER M-041）。
 * 直前の文区切り（`;` `{` `}`）まで遡った範囲で判定する。
 */
export function findErrorBeforeMessage(text: string): { index: number; snippet: string }[] {
  const vars = new Set<string>();
  for (const m of text.matchAll(JSON_ASSIGN)) vars.add(m[1]);
  if (vars.size === 0) return [];

  const out: { index: number; snippet: string }[] = [];
  for (const v of vars) {
    const re = new RegExp(String.raw`\b${v}\??\.error\b\s*(?:\?\?|\|\|)`, "g");
    for (const m of text.matchAll(re)) {
      const at = m.index!;
      // 直前の文区切りまで遡る。無ければ 300 文字前まで。
      const from = Math.max(0, at - 300);
      const window = text.slice(from, at);
      const cut = Math.max(window.lastIndexOf(";"), window.lastIndexOf("{"), window.lastIndexOf("}"));
      const scope = cut >= 0 ? window.slice(cut + 1) : window;
      if (new RegExp(String.raw`\b${v}\??\.message\b\s*(?:\?\?|\|\|)`).test(scope)) continue;
      out.push({ index: at, snippet: text.slice(Math.max(0, at - 60), at + 60).replace(/\s+/g, " ") });
    }
  }
  return out;
}

describe("findErrorBeforeMessage（検出器そのものの検査）", () => {
  it("message を読まずに error を読む形を拾う", () => {
    const src = `const j = await res.json();\nthrow new Error(j?.error ?? "失敗");`;
    expect(findErrorBeforeMessage(src)).toHaveLength(1);
  });

  it("message を先に読む正しい形は拾わない", () => {
    const src = `const j = await res.json();\nthrow new Error(j?.message ?? j?.error ?? "失敗");`;
    expect(findErrorBeforeMessage(src)).toHaveLength(0);
  });

  // 実際にこの形が repo にある（MaterialsManager.tsx）。行単位だと誤検出する。
  it("改行をまたいだ正しい形も拾わない", () => {
    const src = `const json = await res.json();\nsetMsg(\n  json?.message ??\n    json?.error ??\n    "失敗",\n);`;
    expect(findErrorBeforeMessage(src)).toHaveLength(0);
  });

  it("ヘルパー経由（parseJsonSafe）の代入も対象にする", () => {
    const src = `const j = await parseJsonSafe<Foo>(res);\nthrow new Error(j?.error ?? "失敗");`;
    expect(findErrorBeforeMessage(src)).toHaveLength(1);
  });

  // 直したら壊れるもの。`apiError()` とは無関係の `.error`。
  it("json 由来でない `.error` は対象外", () => {
    const supabase = `const { data, error } = await admin.from("x").select();\nif (error || !data) return;`;
    expect(findErrorBeforeMessage(supabase)).toHaveLength(0);
    const idb = `req.onerror = () => reject(req.error ?? new Error("open failed"));`;
    expect(findErrorBeforeMessage(idb)).toHaveLength(0);
  });
});

describe("apiError の応答は message を先に読む", () => {
  it("`error` をユーザー向け表示に先に使っている箇所が無い", () => {
    const files = [...walk(join(REPO, "src")), ...walk(join(REPO, "apps"))].filter((f) => !f.includes("__tests__"));
    // 検査が空振りしていないことを確かめる（型 A）。
    expect(files.length).toBeGreaterThan(500);

    const bad: string[] = [];
    for (const f of files) {
      for (const h of findErrorBeforeMessage(readFileSync(f, "utf8"))) {
        bad.push(`${f.slice(REPO.length + 1)}  …${h.snippet}…`);
      }
    }
    expect(
      bad,
      `\n${bad.join("\n")}\n\n  apiError() は { error: コード, message: 人間向け } を返す。\n  ユーザーに出すのは message。\`j?.message ?? j?.error ?? フォールバック\` の順にすること。`,
    ).toEqual([]);
  });
});
