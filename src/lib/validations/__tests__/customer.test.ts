import { describe, it, expect } from "vitest";
import { customerCreateSchema } from "../customer";

const BASE = { name: "テスト商事" };

describe("customerCreateSchema — 法人番号 / インボイス登録番号", () => {
  it("13桁の法人番号を受理する", () => {
    const r = customerCreateSchema.safeParse({ ...BASE, corporate_number: "1234567890123" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.corporate_number).toBe("1234567890123");
  });

  it("桁数が違う法人番号を弾く", () => {
    const r = customerCreateSchema.safeParse({ ...BASE, corporate_number: "123" });
    expect(r.success).toBe(false);
  });

  it("T+13桁のインボイス登録番号を受理する", () => {
    const r = customerCreateSchema.safeParse({ ...BASE, invoice_registration_number: "T1234567890123" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.invoice_registration_number).toBe("T1234567890123");
  });

  it("T接頭辞がないインボイス登録番号を弾く", () => {
    const r = customerCreateSchema.safeParse({ ...BASE, invoice_registration_number: "1234567890123" });
    expect(r.success).toBe(false);
  });

  it("空文字は null に正規化される", () => {
    const r = customerCreateSchema.safeParse({ ...BASE, corporate_number: "", invoice_registration_number: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.corporate_number).toBeNull();
      expect(r.data.invoice_registration_number).toBeNull();
    }
  });
});

describe("customerCreateSchema — 顧客区分に紐づく新規項目", () => {
  it("法人 + 支払いサイクルなしは弾かれる (既存ルール維持)", () => {
    const r = customerCreateSchema.safeParse({ ...BASE, customer_type: "corporate" });
    expect(r.success).toBe(false);
  });

  it("NDA・基本契約書の締結状況は既定で未設定", () => {
    const r = customerCreateSchema.safeParse({ ...BASE });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nda_status).toBe("unsigned");
      expect(r.data.basic_contract_status).toBe("unsigned");
    }
  });

  it("敬称・振込手数料負担・書類送付方法は任意で null に正規化される", () => {
    const r = customerCreateSchema.safeParse({ ...BASE });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.honorific).toBeNull();
      expect(r.data.transfer_fee_payer).toBeNull();
      expect(r.data.document_delivery_method).toBeNull();
    }
  });
});
