/**
 * Square POS アプリで会計した分の引き当ての検証。
 *
 * 守りたいこと（どれも金額が絡む）:
 *  1. 完了していない決済を引き当てない
 *  2. 金額が一致しない決済を引き当てない
 *  3. **候補が1件に絞れないときは引き当てない**（同額の会計が2件あると取り違える）
 *  4. 既に Ledra に記録済みの決済を再び引き当てない（2件目の売上が消える）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { findRecentPayment } from "@/lib/square/qrCheckout";

const squareFetch = vi.fn();
vi.mock("@/lib/square/client", () => ({
  squareFetch: (...args: unknown[]) => squareFetch(...args),
}));

const NOW = new Date("2026-08-26T12:00:00Z");
const base = { accessToken: "tok", locationId: "L1", amountJpy: 10_000, withinMinutes: 30, now: NOW };

function payment(over: Partial<{ id: string; status: string; amount: number; source: string }> = {}) {
  return {
    id: over.id ?? "sqpmt_1",
    status: over.status ?? "COMPLETED",
    source_type: over.source ?? "WALLET",
    amount_money: { amount: over.amount ?? 10_000, currency: "JPY" },
  };
}

describe("findRecentPayment", () => {
  beforeEach(() => squareFetch.mockReset());

  it("同額・完了済みの決済が1件だけなら引き当てる", async () => {
    squareFetch.mockResolvedValue({ payments: [payment()] });

    const res = await findRecentPayment(base);

    expect(res).toEqual({ ok: true, payment: expect.objectContaining({ id: "sqpmt_1" }) });
  });

  it("未完了・金額違いは引き当てない", async () => {
    squareFetch.mockResolvedValue({
      payments: [payment({ id: "a", status: "PENDING" }), payment({ id: "b", amount: 9_000 })],
    });

    expect(await findRecentPayment(base)).toEqual({ ok: false, reason: "not_found" });
  });

  it("同額が複数あるときは引き当てない（取り違えより未記帳を選ぶ）", async () => {
    squareFetch.mockResolvedValue({ payments: [payment({ id: "a" }), payment({ id: "b" })] });

    expect(await findRecentPayment(base)).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("Square アプリで切った同額のカード・現金は引き当てない", async () => {
    squareFetch.mockResolvedValue({
      payments: [payment({ id: "card", source: "CARD" }), payment({ id: "cash", source: "CASH" })],
    });

    expect(await findRecentPayment(base)).toEqual({ ok: false, reason: "not_found" });
  });

  it("既に記録済みの決済は候補から外す", async () => {
    squareFetch.mockResolvedValue({ payments: [payment({ id: "recorded" }), payment({ id: "fresh" })] });

    const res = await findRecentPayment({ ...base, excludeIds: ["recorded"] });

    expect(res).toEqual({ ok: true, payment: expect.objectContaining({ id: "fresh" }) });
  });

  it("引き当ての窓を Square 側の検索条件に渡す", async () => {
    squareFetch.mockResolvedValue({ payments: [] });

    await findRecentPayment(base);

    const url = squareFetch.mock.calls[0][1] as string;
    expect(url).toContain("location_id=L1");
    // 30 分前 = 11:30Z
    expect(decodeURIComponent(url)).toContain("2026-08-26T11:30:00.000Z");
  });
});
