/**
 * ショップ注文 帳票レンダラの実レンダリングテスト。
 * 請求書 / 納品書 / 領収書 の各種別が有効な PDF（%PDF- ヘッダ）を生成できることを確認する。
 * 軽減税率（8%）混在・収入印紙欄（領収書 5万円以上）などの分岐も通す。
 */
import { describe, it, expect } from "vitest";
import { renderShopOrderDocument, SHOP_DOCUMENT_KINDS, type ShopDocumentSender } from "../shopOrderDocument";

const order = {
  order_number: "SO-TEST123",
  subtotal: 10000,
  tax: 900,
  total: 10900,
  note: "テスト備考: 至急対応希望",
  created_at: "2026-06-04T00:00:00Z",
  shipped_at: "2026-06-05T00:00:00Z",
  completed_at: "2026-06-06T00:00:00Z",
};

// 標準税率(10%)と軽減税率(8%)を混在させ、税率内訳の分岐を通す。
const items = [
  { product_name: "NFCタグ", quantity: 2, unit_price: 2500, tax_rate: 0.1, amount: 5000 },
  { product_name: "ノベルティ菓子", quantity: 5, unit_price: 1000, tax_rate: 0.08, amount: 5000 },
];

const sender: ShopDocumentSender = {
  name: "Ledra株式会社",
  address: "東京都千代田区1-1-1",
  contact_email: "info@example.com",
  contact_phone: "03-0000-0000",
  registration_number: "T1234567890123",
  logo_asset_path: null,
  company_seal_path: null,
  bank_info: {
    bank_name: "テスト銀行",
    branch_name: "本店",
    account_type: "普通",
    account_number: "1234567",
    account_holder: "レドラ（カ",
  },
};

describe("renderShopOrderDocument", () => {
  it.each(SHOP_DOCUMENT_KINDS)(
    "renders %s to a valid PDF buffer",
    async (kind) => {
      const buf = await renderShopOrderDocument({ kind, order, items, sender, recipientName: "テスト商店" });
      expect(buf.byteLength).toBeGreaterThan(1000);
      expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    },
    60_000,
  );

  it("領収書は5万円以上で収入印紙欄ありでも生成できる", async () => {
    const buf = await renderShopOrderDocument({
      kind: "receipt",
      order: { ...order, subtotal: 50000, tax: 5000, total: 55000 },
      items,
      sender,
      recipientName: "テスト商店",
    });
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }, 60_000);
});
