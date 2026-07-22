import { describe, it, expect } from "vitest";
import { matchAskRoute } from "@/lib/ai/askRouter";

describe("matchAskRoute", () => {
  it("routes a certificate question to the certificates screen", () => {
    expect(matchAskRoute("証明書はどこで発行できますか？")).toMatchObject({ href: "/admin/certificates" });
  });

  it("routes an invoice question to the invoices screen", () => {
    expect(matchAskRoute("請求書を送りたい")).toMatchObject({ href: "/admin/invoices" });
  });

  it("does not let a generic '発行' verb hijack unrelated object+verb questions", () => {
    expect(matchAskRoute("請求書を発行したい")).toMatchObject({ href: "/admin/invoices" });
    expect(matchAskRoute("発注書を発行して")).toMatchObject({ href: "/admin/inventory" });
  });

  it("returns null for an empty or unmatched question", () => {
    expect(matchAskRoute("")).toBeNull();
    expect(matchAskRoute("   ")).toBeNull();
    expect(matchAskRoute("コーティングの施工手順を教えて")).toBeNull();
  });

  it("matches case-insensitively for latin keywords", () => {
    expect(matchAskRoute("BILLING plan を見たい")).toMatchObject({ href: "/admin/billing" });
  });
});
