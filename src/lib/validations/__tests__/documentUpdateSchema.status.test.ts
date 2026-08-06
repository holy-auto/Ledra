import { describe, it, expect } from "vitest";
import { documentUpdateSchema } from "@/lib/validations/document";

// 送付済み請求書の入金済への変更がブロックされていた根本原因の回帰テスト。
// .partial() が default を剥がさず、status のみの更新でも boolean 系 content フィールドが
// false として parse 結果に混入 → PUT の isContentEdit=true 誤発火 → 誤ブロック、だった。
describe("documentUpdateSchema — default が更新に漏れない", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it("ステータスのみの更新で content フィールドの default が混入しない", () => {
    const p = documentUpdateSchema.parse({ id: ID, status: "paid", payment_date: "2026-08-06" });
    expect(p.show_seal).toBeUndefined();
    expect(p.show_logo).toBeUndefined();
    expect(p.show_bank_info).toBeUndefined();
    expect(p.is_invoice_compliant).toBeUndefined();
    expect(p.is_tax_inclusive).toBeUndefined();
    expect(p.status).toBe("paid");
  });

  it("status 未指定の内容更新で status が draft に化けない", () => {
    const p = documentUpdateSchema.parse({ id: ID, note: "メモ更新" });
    expect(p.status).toBeUndefined();
  });

  it("実際に content フィールドを送ればその値は保持される（正当な編集判定は生きる）", () => {
    const p = documentUpdateSchema.parse({ id: ID, show_seal: true });
    expect(p.show_seal).toBe(true);
  });
});
