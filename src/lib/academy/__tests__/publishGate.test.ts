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
import { stripComments } from "@/lib/__tests__/sourceScan";

const ROUTE = join(process.cwd(), "src", "app", "api", "admin", "academy", "cases", "route.ts");

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

  it("preview は公開済みの行を書き換えない", () => {
    // 2人が同じ候補を触ったとき、片方が公開した後にもう片方の遅れて返ってきた
    // 生成結果が上書きすると、公開済みの文面が誰も見ていないものに差し替わる
    // （knowledge_chunks は古いまま）。Codex の指摘で気づいた。
    const block = actionBlock(src, "preview");
    expect(block).toMatch(/\.eq\(\s*"is_published"\s*,\s*false\s*\)/);
    // 0 行なら弾く。付けないと「更新できなかった」が成功として返る。
    expect(block).toMatch(/if\s*\(!saved\)/);
  });

  it("preview は要約を作れなかったら成功を返さない", () => {
    // 証明書が消えていると（FK は ON DELETE SET NULL）生成できない。
    // そこで成功を返すと、中身が無いのに確認のチェックが入り、publish が必ず弾かれる。
    expect(actionBlock(src, "preview")).toMatch(/if\s*\(!aiSummary\)/);
  });

  it("publish は見た文面そのものを要求し、読み書きの間に触られたら止める", () => {
    // 「要約が入っている」は「この人が今の中身を見た」の証明にならない。
    // 別の人が再生成すれば入れ替わるし、公開→非公開に戻した行にも要約は残る。
    const block = actionBlock(src, "publish");
    expect(block).toMatch(/if\s*\(!preview_token\)/);
    // 版の印は**中身のハッシュ**。時刻だと同じミリ秒に終わった2つの preview で
    // 衝突し、上書きされた文面を前の人のトークンで公開できてしまう（Codex の指摘）。
    expect(block).toMatch(/academyCaseToken\(reviewed\)\s*!==\s*preview_token/);
    // 読んでから書くまでの間に触られていないこと（compare-and-swap）。
    expect(block).toMatch(/\.eq\(\s*"updated_at"\s*,\s*reviewed\.updated_at/);
    // 更新が 0 行なら止める。knowledge_chunks を二重に入れないため。
    expect(block).toMatch(/publishedRows\?\.length/);
  });

  it("preview は DB が返した行から印と表示文面を作る（手元の値だと公開が常に弾かれる）", () => {
    // publish は行を読み直してハッシュする。preview が手元の値をハッシュすると、
    // 表記が1つでも違えば印は永久に一致しない。実際 updated_at で起きた:
    // JS の toISOString() は `...Z`、PostgREST は timestamptz を `+00:00` で返すため、
    // **公開が1件も通らなかった**（Codex の指摘。M-033）。
    // 直し方は「時刻だけ揃える」ではなく**両側を同じ出所にする**こと。
    const block = actionBlock(src, "preview");
    expect(block).toMatch(/\.select\(\s*"ai_summary, good_points, caution_points, tags, updated_at"\s*\)/);
    const body = block.slice(block.indexOf("preview_token:"));
    // 印は返ってきた行そのもの。生成した変数（aiSummary 等）を混ぜない。
    expect(body).toMatch(/preview_token:\s*academyCaseToken\(saved\)/);
    // 画面に見せるのも同じ出所。「見たもの ＝ 公開されるもの」を出所で揃える。
    expect(body).toMatch(/ai_summary:\s*saved\.ai_summary/);
    expect(body).not.toMatch(/\baiSummary\b/);
    // ハッシュの中身（衝突しない・1回で切れる）は casePresentation.test.ts が値で検査する。
  });
});
