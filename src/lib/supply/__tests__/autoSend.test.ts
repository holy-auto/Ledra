import { describe, it, expect } from "vitest";
import { decideAutoSend, type AutoSendContext } from "../autoSend";

function ctx(p: Partial<AutoSendContext>): AutoSendContext {
  return {
    optInEnabled: true,
    partnerTrusted: true,
    partnerHasApi: true,
    orderTotalJpy: 10000,
    maxOrderJpy: 50000,
    monthlyCapJpy: 200000,
    monthlySentJpy: 0,
    ...p,
  };
}

describe("decideAutoSend (壁3 隣接の全ガード)", () => {
  it("allows when every condition is met", () => {
    expect(decideAutoSend(ctx({}))).toEqual({ ok: true });
  });

  it("denies when not opted in (既定 OFF)", () => {
    expect(decideAutoSend(ctx({ optInEnabled: false }))).toEqual({ ok: false, reason: "opt_out" });
  });

  it("denies untrusted partner", () => {
    expect(decideAutoSend(ctx({ partnerTrusted: false }))).toEqual({ ok: false, reason: "partner_not_trusted" });
  });

  it("denies partner without structured transport (メールのみは自動送信しない)", () => {
    expect(decideAutoSend(ctx({ partnerHasApi: false }))).toEqual({ ok: false, reason: "no_api_transport" });
  });

  it("allows trusted portal partner without API (ポータルは構造化搬送)", () => {
    expect(decideAutoSend(ctx({ partnerHasApi: false, partnerHasPortal: true }))).toEqual({ ok: true });
  });

  it("denies when neither API nor portal is available", () => {
    expect(decideAutoSend(ctx({ partnerHasApi: false, partnerHasPortal: false }))).toEqual({
      ok: false,
      reason: "no_api_transport",
    });
  });

  it("denies empty/zero order", () => {
    expect(decideAutoSend(ctx({ orderTotalJpy: 0 }))).toEqual({ ok: false, reason: "empty_order" });
  });

  it("denies when per-order cap is unset or non-positive (安全側)", () => {
    expect(decideAutoSend(ctx({ maxOrderJpy: null }))).toEqual({ ok: false, reason: "no_per_order_cap" });
    expect(decideAutoSend(ctx({ maxOrderJpy: 0 }))).toEqual({ ok: false, reason: "no_per_order_cap" });
  });

  it("denies when order exceeds per-order cap", () => {
    expect(decideAutoSend(ctx({ orderTotalJpy: 60000, maxOrderJpy: 50000 }))).toEqual({
      ok: false,
      reason: "exceeds_per_order_cap",
    });
  });

  it("denies when monthly cap is unset", () => {
    expect(decideAutoSend(ctx({ monthlyCapJpy: null }))).toEqual({ ok: false, reason: "no_monthly_cap" });
  });

  it("denies when order would exceed remaining monthly cap", () => {
    expect(decideAutoSend(ctx({ orderTotalJpy: 30000, monthlyCapJpy: 200000, monthlySentJpy: 180000 }))).toEqual({
      ok: false,
      reason: "exceeds_monthly_cap",
    });
  });

  it("allows when order exactly hits the remaining monthly budget", () => {
    expect(decideAutoSend(ctx({ orderTotalJpy: 20000, monthlyCapJpy: 200000, monthlySentJpy: 180000 }))).toEqual({
      ok: true,
    });
  });
});
