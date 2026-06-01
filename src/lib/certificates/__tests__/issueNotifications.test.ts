import { describe, it, expect } from "vitest";
import { buildPartnerIssueEmail } from "@/lib/certificates/issueNotifications";

describe("buildPartnerIssueEmail", () => {
  const base = {
    partnerName: "あいおいニッセイ",
    shopName: "デモ施工店",
    serviceType: "ガラスコーティング",
    publicId: "ABCD-1234",
    portalUrl: "https://ledra.co.jp/insurer",
  };

  it("includes the non-PII context (shop / service / id / portal link)", () => {
    const { subject, html } = buildPartnerIssueEmail(base);
    expect(subject).toContain("デモ施工店");
    expect(html).toContain("デモ施工店");
    expect(html).toContain("ガラスコーティング");
    expect(html).toContain("ABCD-1234");
    expect(html).toContain("https://ledra.co.jp/insurer");
    expect(html).toContain("あいおいニッセイ");
  });

  it("does NOT leak customer PII — the builder cannot even receive a customer name", () => {
    const { html } = buildPartnerIssueEmail(base);
    // 顧客名・ナンバーは型に存在しないので混入しようがない。代表的なPII語が無いことも確認。
    expect(html).not.toMatch(/顧客名|お客様名|ナンバー|車両番号/);
  });

  it("escapes HTML in partner/shop/service to avoid injection", () => {
    const { html } = buildPartnerIssueEmail({
      ...base,
      shopName: "<script>alert(1)</script>",
      serviceType: "A & B <b>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
  });

  it("falls back to safe defaults when optional fields are blank", () => {
    const { html } = buildPartnerIssueEmail({ ...base, serviceType: "  " });
    expect(html).toContain("施工証明書");
  });
});
