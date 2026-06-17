import { describe, it, expect } from "vitest";
import { computePortalResponse, type PortalResponseInput } from "../portalResponse";

function lines(...specs: Array<[string, number, number?]>): PortalResponseInput["lines"] {
  return specs.map(([itemId, ordered, accepted]) => ({
    itemId,
    orderedQuantity: ordered,
    acceptedQuantity: accepted,
  }));
}

describe("computePortalResponse (メーカー回答の構造化)", () => {
  it("accept: 全行を発注数量どおり受注、欠品なし", () => {
    const r = computePortalResponse({ action: "accept", lines: lines(["a", 10], ["b", 5]) });
    expect(r).toEqual({
      ok: true,
      response: "accepted",
      declineReason: null,
      lines: [
        { itemId: "a", acceptedQuantity: 10, backorderQuantity: 0 },
        { itemId: "b", acceptedQuantity: 5, backorderQuantity: 0 },
      ],
      totalAccepted: 15,
      totalBackorder: 0,
    });
  });

  it("decline: 理由つきで全行欠品 (受注 0)", () => {
    const r = computePortalResponse({ action: "decline", declineReason: "discontinued", lines: lines(["a", 10]) });
    expect(r).toEqual({
      ok: true,
      response: "declined",
      declineReason: "discontinued",
      lines: [{ itemId: "a", acceptedQuantity: 0, backorderQuantity: 10 }],
      totalAccepted: 0,
      totalBackorder: 10,
    });
  });

  it("decline: 理由なしは拒否", () => {
    const r = computePortalResponse({ action: "decline", lines: lines(["a", 10]) });
    expect(r).toEqual({ ok: false, reason: "decline_reason_required" });
  });

  it("partial: 一部欠品で backorder を算出", () => {
    const r = computePortalResponse({ action: "partial", lines: lines(["a", 10, 7], ["b", 5, 5]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.response).toBe("partial");
    expect(r.lines).toEqual([
      { itemId: "a", acceptedQuantity: 7, backorderQuantity: 3 },
      { itemId: "b", acceptedQuantity: 5, backorderQuantity: 0 },
    ]);
    expect(r.totalAccepted).toBe(12);
    expect(r.totalBackorder).toBe(3);
  });

  it("partial: 結果的に全量受注なら accepted に格上げ", () => {
    const r = computePortalResponse({ action: "partial", lines: lines(["a", 10, 10], ["b", 5, 5]) });
    expect(r.ok && r.response).toBe("accepted");
  });

  it("partial: acceptedQuantity 未指定の行は発注数量どおり扱う", () => {
    const r = computePortalResponse({ action: "partial", lines: lines(["a", 10], ["b", 5, 2]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]).toEqual({ itemId: "a", acceptedQuantity: 10, backorderQuantity: 0 });
    expect(r.response).toBe("partial");
  });

  it("partial: 受注数量が発注数量を超えたら拒否", () => {
    const r = computePortalResponse({ action: "partial", lines: lines(["a", 10, 11]) });
    expect(r).toEqual({ ok: false, reason: "accepted_exceeds_ordered" });
  });

  it("partial: 負数は拒否", () => {
    const r = computePortalResponse({ action: "partial", lines: lines(["a", 10, -1]) });
    expect(r).toEqual({ ok: false, reason: "negative_accepted_quantity" });
  });

  it("partial: 全数 0 は辞退で表現させる (partial_all_zero)", () => {
    const r = computePortalResponse({ action: "partial", lines: lines(["a", 10, 0], ["b", 5, 0]) });
    expect(r).toEqual({ ok: false, reason: "partial_all_zero" });
  });

  it("空の発注は拒否", () => {
    const r = computePortalResponse({ action: "accept", lines: [] });
    expect(r).toEqual({ ok: false, reason: "empty_order" });
  });

  it("発注数量が 0 以下なら拒否", () => {
    const r = computePortalResponse({ action: "accept", lines: lines(["a", 0]) });
    expect(r).toEqual({ ok: false, reason: "invalid_ordered_quantity" });
  });
});
