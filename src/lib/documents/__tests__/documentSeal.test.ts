import { describe, it, expect, beforeEach } from "vitest";
import { computeDocumentContentHash, buildIntegritySeal, type SealableDocument } from "@/lib/documents/documentSeal";

const baseDoc: SealableDocument = {
  doc_type: "invoice",
  doc_number: "INV-0001",
  issued_at: "2026-07-27",
  due_date: "2026-08-31",
  customer_id: "cust-1",
  recipient_name: "株式会社テスト",
  subtotal: 10000,
  tax: 1000,
  total: 11000,
  tax_rate: 10,
  tax_breakdown: { "10": { subtotal: 10000, tax: 1000 } },
  items_json: [{ name: "コーティング", qty: 1, price: 10000 }],
  is_invoice_compliant: true,
};

describe("computeDocumentContentHash", () => {
  it("同じ内容なら同じハッシュ（決定的）", () => {
    expect(computeDocumentContentHash(baseDoc)).toBe(computeDocumentContentHash({ ...baseDoc }));
  });

  it("ネストしたオブジェクトのキー順が違っても同じハッシュ（安定シリアライズ）", () => {
    const reordered: SealableDocument = {
      ...baseDoc,
      tax_breakdown: { "10": { tax: 1000, subtotal: 10000 } }, // キー順を逆に
    };
    expect(computeDocumentContentHash(reordered)).toBe(computeDocumentContentHash(baseDoc));
  });

  it("金額が変わればハッシュが変わる（改ざん検知の要）", () => {
    const tampered: SealableDocument = { ...baseDoc, total: 99000 };
    expect(computeDocumentContentHash(tampered)).not.toBe(computeDocumentContentHash(baseDoc));
  });
});

describe("buildIntegritySeal", () => {
  beforeEach(() => {
    // TSA を未設定にして「ハッシュのみ封印」への degrade を検証する。
    delete process.env.DOCUMENT_TSA_URL;
    delete process.env.DOCUMENT_TSA_ENABLED;
    delete process.env.PHOTO_TSA_URL;
    delete process.env.PHOTO_TSA_ENABLED;
  });

  it("TSA 未設定ならハッシュのみ（TS を付いていると騙らない）", async () => {
    const seal = await buildIntegritySeal(baseDoc);
    expect(seal.hash_sha256).toBe(computeDocumentContentHash(baseDoc));
    expect(seal.algo).toBe("SHA-256");
    expect(seal.timestamp_token_b64).toBeNull();
    expect(seal.timestamp_at).toBeNull();
    expect(seal.timestamp_authority).toBeNull();
    expect(typeof seal.sealed_at).toBe("string");
  });
});
