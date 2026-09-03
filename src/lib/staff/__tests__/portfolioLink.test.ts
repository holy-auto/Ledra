import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STAFF_PORTFOLIO_CERT_COLUMNS, STAFF_PORTFOLIO_CERT_FORBIDDEN_COLUMNS } from "@/lib/staff/portfolioDisclosure";

/**
 * /w/[token] は**ログイン不要で開ける**面で、しかもリンクは職人の退職後も手元に残りうる。
 * うっかり顧客由来の列を足すと、恒久的な顧客名簿を配ったことになる。
 *
 * 検査対象は実際に走るクエリ（portfolioLink.ts のソース）。定数の写しではなく本体を見る。
 */
const LIB_PATH = "src/lib/staff/portfolioLink.ts";
const libSource = readFileSync(resolve(process.cwd(), LIB_PATH), "utf8");

/** certificates を引くクエリチェーン（.from から文末まで）。 */
function certificateQuery(): string {
  const start = libSource.indexOf('.from("certificates")');
  if (start < 0) throw new Error(`${LIB_PATH} に certificates のクエリが見つかりません`);
  const end = libSource.indexOf(";", start);
  if (end < 0) throw new Error(`${LIB_PATH} の certificates クエリの終端が見つかりません`);
  return libSource.slice(start, end);
}

/** そのクエリが実際に取得する列。 */
function selectedColumns(): string[] {
  const m = certificateQuery().match(/\.select\("([^"]+)"\)/);
  if (!m) throw new Error(`${LIB_PATH} の certificates クエリから select を読み取れませんでした`);
  return m[1].split(/\s*,\s*/);
}

describe("職人の実績リンクの開示範囲", () => {
  it("取得列は許可リストと完全に一致する（列を足すと必ず落ちる）", () => {
    expect(selectedColumns()).toEqual([...STAFF_PORTFOLIO_CERT_COLUMNS]);
  });

  it("顧客 PII を含まない", () => {
    const columns = selectedColumns();
    for (const forbidden of STAFF_PORTFOLIO_CERT_FORBIDDEN_COLUMNS) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("本人の施工だけに絞る（テナントと craftsman の両方で縛る）", () => {
    // craftsman_staff_id が落ちるとテナント中の全証明書が本人以外にも見える。
    const query = certificateQuery();
    expect(query).toContain('.eq("tenant_id", link.tenant_id)');
    expect(query).toContain('.eq("craftsman_staff_id", link.staff_member_id)');
  });

  it("発行元が引っ込めた証明書（is_hidden / void）を出さない", () => {
    const query = certificateQuery();
    expect(query).toContain('.neq("status", "void")');
    expect(query).toContain('.eq("is_hidden", false)');
  });

  it("在籍していない職人のリンクは失効する", () => {
    // 「離職したらどう止めるか」への答えがこの1行。消えると退職者がリンクを持ち続ける。
    expect(libSource).toContain("if (!staff?.is_active) return null;");
  });

  it("リンク自体が無効化されていれば開けない", () => {
    expect(libSource).toContain("if (!link?.is_active) return null;");
  });
});
