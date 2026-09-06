/**
 * `stripComments()` は構造テスト全部が通る入口なので、ここが甘いと下流が全部甘くなる。
 *
 * 自前の正規表現（行頭の `//` だけを落とす）だったとき、**行末コメントが残り**、
 * そこに書かれた呼び出しを検出器が本物と読んだ（Codex の指摘）。逆に素朴に `//` を
 * 全部消すと `"https://..."` の中まで壊れる。TypeScript のパーサに解かせている。
 */
import { describe, it, expect } from "vitest";
import { stripComments } from "./sourceScan";

describe("stripComments", () => {
  it("行末コメントも落とす", () => {
    // ガードを消して同じ内容をコメントに残す、が通用しないこと。
    expect(stripComments('void 0; // const limited = await checkRateLimit(req, "ai");')).not.toContain(
      "checkRateLimit",
    );
  });

  it("文字列の中の // は壊さない", () => {
    expect(stripComments('const u = "https://example.com/x";')).toBe('const u = "https://example.com/x";');
  });

  it("ブロックコメントを落とし、行番号を保つ", () => {
    const out = stripComments("a();\n/* x\n y */\nb();");
    expect(out).not.toContain("x");
    expect(out.split("\n").length).toBe(4);
  });

  it("JSX とテンプレートリテラルを壊さない", () => {
    // スキャナ単体だと `${...}` を跨いだ時点で文脈を失い、ここで落ちた。
    const out = stripComments("const el = <A b={`x${y}//z`} />; // drop");
    expect(out).toContain("`x${y}//z`");
    expect(out).not.toContain("drop");
  });
});
