import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STAFF_PORTFOLIO_CERT_COLUMNS, STAFF_PORTFOLIO_CERT_FORBIDDEN_COLUMNS } from "@/lib/staff/portfolioDisclosure";
import { CODE_ALPHABET, CODE_LENGTH, REJECTION_THRESHOLD, generateCode, normalizeCode } from "@/lib/staff/linkCode";

/**
 * 外注テナントが自分の管理画面から見る「自分が作業した記録」の番人。
 *
 * ここは**他社（元請け）のデータを別会社に見せる面**なので、絞り込みか開示列を1つ
 * 誤ると、元請けの顧客情報や無関係な記録がそのまま渡る。検査対象は実際に走るクエリ
 * （tenantLink.ts のソース）で、定数の写しではなく本体を読む。
 */
const LIB_PATH = "src/lib/staff/tenantLink.ts";
const libSource = readFileSync(resolve(process.cwd(), LIB_PATH), "utf8");

/** certificates を引くクエリチェーン（.from から文末まで）。 */
function certificateQuery(): string {
  const start = libSource.indexOf('.from("certificates")');
  if (start < 0) throw new Error(`${LIB_PATH} に certificates のクエリが見つかりません`);
  const end = libSource.indexOf(";", start);
  if (end < 0) throw new Error(`${LIB_PATH} の certificates クエリの終端が見つかりません`);
  return libSource.slice(start, end);
}

function selectedColumns(): string[] {
  const m = certificateQuery().match(/\.select\("([^"]+)"\)/);
  if (!m) throw new Error(`${LIB_PATH} の certificates クエリから select を読み取れませんでした`);
  return m[1].split(/\s*,\s*/);
}

describe("外注テナントへの開示範囲", () => {
  it("取得列は許可リストと完全に一致する（列を足すと必ず落ちる）", () => {
    expect(selectedColumns()).toEqual([...STAFF_PORTFOLIO_CERT_COLUMNS]);
  });

  it("顧客名を含まない（代表判断: 顧客名は Ledra では表示しない）", () => {
    const columns = selectedColumns();
    for (const forbidden of STAFF_PORTFOLIO_CERT_FORBIDDEN_COLUMNS) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("自分が作業した記録だけに絞る（元請けと craftsman の両方で縛る）", () => {
    // craftsman_staff_id が落ちると、元請けのテナント中の全証明書が外注に渡る。
    const query = certificateQuery();
    expect(query).toContain('.eq("tenant_id", row.tenant_id)');
    expect(query).toContain('.eq("craftsman_staff_id", row.id)');
  });

  it("元請けが引っ込めた証明書（is_hidden / void）を出さない", () => {
    const query = certificateQuery();
    expect(query).toContain('.neq("status", "void")');
    expect(query).toContain('.eq("is_hidden", false)');
  });

  it("休止中の職人は連携していても表示しない", () => {
    // 在籍管理に相乗りさせた失効。消えると、切ったはずの相手に記録が出続ける。
    expect(libSource).toContain("const active = rows.filter((r) => r.is_active);");
  });

  it("引き換えは期限・使用済み・自テナントを弾く", () => {
    expect(libSource).toContain('return { ok: false, reason: "used" };');
    expect(libSource).toContain('return { ok: false, reason: "expired" };');
    expect(libSource).toContain('return { ok: false, reason: "self" };');
  });

  it("他社に稼働先が見える関数を生やさない", () => {
    // 「この職人と連携しているテナント一覧」を返す関数を作ると制約が壊れる。
    // linked_tenant_id での逆引きは、引く側が自分自身であるときだけ許される。
    const reverseLookups = libSource.match(/\.eq\("linked_tenant_id", [^)]*\)/g) ?? [];
    expect(reverseLookups).toEqual(['.eq("linked_tenant_id", subcontractorTenantId)']);
  });

  it("raw code を保存しない", () => {
    // DB に入るのはハッシュだけ。code をそのまま書く列があってはいけない。
    expect(libSource).toContain("code_hash: staffLinkCodeHash(code)");
    expect(libSource).not.toMatch(/\bcode: code\b/);
  });
});

describe("連携コードの書式", () => {
  it("小文字・空白・ハイフンを吸収する（口頭・電話での伝達ミスで弾かない）", () => {
    expect(normalizeCode(" a3f7-k9m2 qx ")).toBe("A3F7K9M2QX");
  });

  it("紛らわしい文字を含まない（0/O, 1/I/L）", () => {
    // 読み違えは「コードが違う」で終わり、原因が分からないまま運用が詰まる。
    for (const ch of "01OIL") expect(CODE_ALPHABET).not.toContain(ch);
  });

  it("拒否閾値がアルファベット長の倍数（= 剰余が偏らない）", () => {
    // 256 は 31 で割り切れないので、そのまま % を取ると先頭8文字だけ出現機会が
    // 1回多くなる。閾値未満だけ採用することで等確率になる（CodeQL 指摘の修正）。
    expect(REJECTION_THRESHOLD % CODE_ALPHABET.length).toBe(0);
    expect(REJECTION_THRESHOLD).toBeLessThanOrEqual(256);
    expect(256 - REJECTION_THRESHOLD).toBeLessThan(CODE_ALPHABET.length);
  });

  it("生成したコードは長さと文字種を満たす", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });
});
