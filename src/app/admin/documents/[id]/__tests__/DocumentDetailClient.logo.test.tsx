// @vitest-environment jsdom
/**
 * 帳票詳細プレビューが、テナントのロゴ・角印を「実画像」として表示することを確認する。
 * 以前はプレースホルダ (「LOGO」/「印」) しか描画せず、アップロード済みでも見積書等に
 * 反映されなかった (署名付きURLを props で受け取り <img> を描画する回帰防止)。
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DocumentDetailClient from "../DocumentDetailClient";
import type { DocumentRow } from "@/types/document";

const baseDoc = {
  id: "doc-1",
  doc_type: "estimate",
  doc_number: "EST-001",
  status: "draft",
  issued_at: "2026-07-08",
  subtotal: 10000,
  tax: 1000,
  total: 11000,
  tax_rate: 10,
  items_json: [],
  is_invoice_compliant: false,
  show_logo: true,
  show_seal: true,
  show_bank_info: false,
  recipient_name: "テスト株式会社",
} as unknown as DocumentRow;

const tenant = {
  name: "Ledra株式会社",
  address: null,
  contact_email: null,
  contact_phone: null,
  registration_number: null,
  logo_asset_path: "tenants/t1/logos/logo.png",
  company_seal_path: "tenants/t1/logos/seal.png",
  bank_info: null,
};

describe("DocumentDetailClient ロゴ・角印表示", () => {
  it("署名付きURLが渡された場合は実画像 <img> を描画する", () => {
    render(
      <DocumentDetailClient
        document={baseDoc}
        customerName={null}
        tenant={tenant}
        logoUrl="https://example.com/logo.png?sig=abc"
        sealUrl="https://example.com/seal.png?sig=def"
      />,
    );
    expect(screen.getByAltText("会社ロゴ").getAttribute("src")).toBe("https://example.com/logo.png?sig=abc");
    expect(screen.getByAltText("角印").getAttribute("src")).toBe("https://example.com/seal.png?sig=def");
    // プレースホルダ文言は出さない
    expect(screen.queryByText("LOGO")).toBeNull();
  });

  it("URL 未設定 (アップロード無し) の場合はプレースホルダを表示する", () => {
    render(
      <DocumentDetailClient document={baseDoc} customerName={null} tenant={tenant} logoUrl={null} sealUrl={null} />,
    );
    expect(screen.queryByAltText("会社ロゴ")).toBeNull();
    expect(screen.getByText("LOGO")).toBeDefined();
    expect(screen.getByText("印")).toBeDefined();
  });
});
