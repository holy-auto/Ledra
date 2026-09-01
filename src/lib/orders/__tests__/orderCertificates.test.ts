import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORDER_CERTIFICATE_ALLOWED_COLUMNS,
  ORDER_CERTIFICATE_COLUMNS,
  ORDER_CERTIFICATE_FORBIDDEN_COLUMNS,
  ORDER_CERTIFICATE_SELECT,
} from "@/lib/orders/orderCertificates";

/**
 * この列リストは /api/admin/orders/[id] が **相手方テナントにも返す**。
 * 元請けが発行した証明書を外注先に見せるのが目的なので、うっかり顧客由来の列を
 * 足すと他社への個人情報漏洩になる。壊れたら落ちる番人をここに置く。
 */
describe("ORDER_CERTIFICATE_COLUMNS", () => {
  it("許可リストと完全に一致する（列を足すと必ず落ちる）", () => {
    // 番人の本体。禁止リスト方式では「まだ誰も禁止と書いていない列」
    // （content_preset_json など、スタッフの入力がそのまま入る json）が
    // 素通りするため、許可リストとの完全一致で fail closed にしてある。
    expect([...ORDER_CERTIFICATE_COLUMNS]).toEqual([...ORDER_CERTIFICATE_ALLOWED_COLUMNS]);
  });

  it("既知の顧客 PII と他社マスタへの識別子を含まない", () => {
    for (const forbidden of ORDER_CERTIFICATE_FORBIDDEN_COLUMNS) {
      expect(ORDER_CERTIFICATE_COLUMNS).not.toContain(forbidden);
      expect(ORDER_CERTIFICATE_SELECT.split(/\s*,\s*/)).not.toContain(forbidden);
    }
  });

  it("相手方が証明書へ辿り着くのに必要な public_id を含む", () => {
    // public_id が落ちると、受注先は自分が施工した記録を開く手段を失う。
    expect(ORDER_CERTIFICATE_COLUMNS).toContain("public_id");
  });

  it("ルートハンドラ側の literal と一致する", () => {
    // ルートは同じ文字列を literal で持つ（check-schema.mjs が同一ファイル内の
    // const しか解決できないため）。片方だけ育つと PII ガードが素通りになる。
    const src = readFileSync(resolve(process.cwd(), "src/app/api/admin/orders/[id]/route.ts"), "utf8");
    const m = src.match(/const ORDER_CERTIFICATE_SELECT = "([^"]+)";/);
    expect(m?.[1]).toBe(ORDER_CERTIFICATE_SELECT);
  });

  it("発行元が引っ込めた証明書（is_hidden / void）を相手方に出さない", () => {
    // is_hidden は「ミスがあった証明書を一覧から外す」フラグ（20260619000000）。
    // 自社の一覧は除外するのに相手方には出し続ける、という状態を作らない。
    const src = readFileSync(resolve(process.cwd(), "src/app/api/admin/orders/[id]/route.ts"), "utf8");
    const certQuery = src.slice(src.indexOf("ORDER_CERTIFICATE_SELECT)"), src.indexOf("// チャット最新5件"));
    expect(certQuery).toContain('.neq("status", "void")');
    expect(certQuery).toContain('.eq("is_hidden", false)');
  });
});
