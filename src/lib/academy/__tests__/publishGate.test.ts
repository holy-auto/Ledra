/**
 * 事例公開の2段階を固定する。
 *
 * ## なぜ2段階なのか
 *
 * 要約の入力には証明書の `content_free_text`（店が手で書く自由記述）が入る。
 * 顧客名や車両番号が書かれていれば、**全加盟店に共有される文面に混ざりうる**。
 *
 * 以前は要約を**公開の瞬間に生成**していた。つまり「公開する」を押す人は、
 * 何が共有されるのかを押す前に見られなかった。**見られないものは確認できない。**
 * 確認ダイアログを足しても、確認する対象が存在しないので形だけになる。
 *
 * そこで preview（生成して行に保存・公開はしない）→ 人が読む → publish（反転のみ）
 * に分けた（2026-09-05 代表判断「目視確認を入れる」）。
 *
 * ## ここで固定する2点
 *
 * 1. **publish は AI を呼ばない。** 呼ぶと、確認した文面と公開される文面が
 *    別物になりうる（生成は毎回同じ結果を返さない）。
 * 2. **未確認（要約が無い）事例は公開できない。** preview を通っていなければ
 *    `ai_summary` は入らないので、そこを見て弾く。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE = join(process.cwd(), "src", "app", "api", "admin", "academy", "cases", "route.ts");

/**
 * コメントを落としてから照合する。この検査自身が説明コメントに書いた
 * 関数名に反応する事故を何度かやっている（MISTAKE_LEDGER M-022）。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** `if (action === "<name>") { ... }` の本体を取り出す。 */
function actionBlock(src: string, name: string): string {
  const start = src.indexOf(`if (action === "${name}")`);
  expect(start, `${name} の分岐が無い`).toBeGreaterThan(-1);
  let depth = 0;
  let i = src.indexOf("{", start);
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(from, i + 1);
  }
  throw new Error(`${name} の分岐が閉じていない`);
}

describe("Academy 事例公開の2段階ゲート", () => {
  const src = stripComments(readFileSync(ROUTE, "utf8"));

  it("preview の分岐が AI 要約を生成し、同じ分岐でレート制限も掛けている", () => {
    // 空振り防止。preview 側が生成しなくなったら、確認する中身が無くなる。
    const block = actionBlock(src, "preview");
    expect(block).toMatch(/generateAcademyCaseSummary\s*\(/);
    // AI 呼び出しをヘルパーへ出すと、ハンドラ単位で追う aiRouteRateLimit.test.ts から
    // 見えなくなり「制限の無い AI 呼び出し」になる。実際に一度そうしてしまった。
    // 呼び出しと制限が同じ分岐に並んでいることをここでも押さえる。
    expect(block).toMatch(/checkRateLimit\s*\(/);
  });

  it("publish の分岐は AI を呼び直さない（確認した文面がそのまま公開される）", () => {
    const block = actionBlock(src, "publish");
    expect(block).not.toMatch(/generateAcademyCaseSummary\s*\(/);
  });

  it("publish は要約が無い事例を弾く（preview を通っていない＝未確認）", () => {
    const block = actionBlock(src, "publish");
    expect(block).toMatch(/ai_summary/);
    expect(block).toMatch(/apiValidationError/);
  });

  it("preview は is_published を触らない（確認前に公開されない）", () => {
    expect(actionBlock(src, "preview")).not.toMatch(/is_published/);
  });
});
