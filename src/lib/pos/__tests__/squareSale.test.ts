/**
 * Square 経由の会計を記帳する前の検証。
 *
 * 守りたいこと: **完了していない決済で売上を立てない**、**金額は Square の実額**、
 * 特定できないときは記帳しない。クライアントの申告は一切使わない。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { resolvePosAppSale, resolveTerminalSale } from "@/lib/pos/squareSale";

const getSquareContext = vi.fn();
const getTerminalCheckout = vi.fn();
const getPayment = vi.fn();
const findRecentPayment = vi.fn();

vi.mock("@/lib/square/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/square/client")>("@/lib/square/client");
  return { ...actual, getSquareContext: (...a: unknown[]) => getSquareContext(...a) };
});
vi.mock("@/lib/square/qrCheckout", () => ({
  getTerminalCheckout: (...a: unknown[]) => getTerminalCheckout(...a),
  getPayment: (...a: unknown[]) => getPayment(...a),
  findRecentPayment: (...a: unknown[]) => findRecentPayment(...a),
  paymentBrand: () => "PAYPAY",
}));

/** `payments` の既記録だけを返す最小のダブル。 */
function fakeAdmin(recorded: string[] = [], error: { message: string } | null = null) {
  const node: Record<string, unknown> = {
    select: () => node,
    eq: () => node,
    not: () => node,
    gte: async () => ({ data: error ? null : recorded.map((id) => ({ square_payment_id: id })), error }),
  };
  return { from: () => node } as never;
}

beforeEach(() => {
  getSquareContext.mockResolvedValue({ accessToken: "tok", locationId: "L1", terminalDeviceId: "D1" });
  getTerminalCheckout.mockReset();
  getPayment.mockReset();
  findRecentPayment.mockReset();
});

describe("resolveTerminalSale", () => {
  it("完了した端末決済は payment_id と実額を返す", async () => {
    getTerminalCheckout.mockResolvedValue({ id: "co_1", status: "COMPLETED", payment_ids: ["sqpmt_1"] });
    getPayment.mockResolvedValue({ id: "sqpmt_1", status: "COMPLETED", amount_money: { amount: 12_345 } });

    const res = await resolveTerminalSale(fakeAdmin(), "t1", "co_1");

    expect(res).toEqual({ ok: true, squarePaymentId: "sqpmt_1", amountTotal: 12_345, brand: "PAYPAY" });
  });

  it("端末で完了していない会計は記帳させない", async () => {
    getTerminalCheckout.mockResolvedValue({ id: "co_1", status: "IN_PROGRESS" });

    const res = await resolveTerminalSale(fakeAdmin(), "t1", "co_1");

    expect(res).toEqual({ ok: false, error: "square_checkout_not_completed: IN_PROGRESS" });
    expect(getPayment).not.toHaveBeenCalled();
  });

  it("決済が完了扱いでも Square 側の実績が未完了なら記帳させない", async () => {
    getTerminalCheckout.mockResolvedValue({ id: "co_1", status: "COMPLETED", payment_ids: ["sqpmt_1"] });
    getPayment.mockResolvedValue({ id: "sqpmt_1", status: "FAILED", amount_money: { amount: 12_345 } });

    expect(await resolveTerminalSale(fakeAdmin(), "t1", "co_1")).toEqual({
      ok: false,
      error: "square_not_completed: FAILED",
    });
  });

  it("決済が複数ある会計は記帳しない（先頭だけ記帳すると売上が小さくなる）", async () => {
    getTerminalCheckout.mockResolvedValue({ id: "co_1", status: "COMPLETED", payment_ids: ["a", "b"] });

    expect(await resolveTerminalSale(fakeAdmin(), "t1", "co_1")).toEqual({ ok: false, error: "square_payment_split" });
    expect(getPayment).not.toHaveBeenCalled();
  });

  it("端末に出した額と実際の受取額が違うときは記帳しない", async () => {
    getTerminalCheckout.mockResolvedValue({
      id: "co_1",
      status: "COMPLETED",
      payment_ids: ["sqpmt_1"],
      amount_money: { amount: 12_345 },
    });
    getPayment.mockResolvedValue({ id: "sqpmt_1", status: "COMPLETED", amount_money: { amount: 10_000 } });

    expect(await resolveTerminalSale(fakeAdmin(), "t1", "co_1")).toEqual({
      ok: false,
      error: "square_amount_mismatch: 12345 != 10000",
    });
  });
});

describe("resolvePosAppSale", () => {
  it("引き当てた決済の実額で記帳する", async () => {
    findRecentPayment.mockResolvedValue({
      ok: true,
      payment: { id: "sqpmt_9", status: "COMPLETED", amount_money: { amount: 8_800 } },
    });

    const res = await resolvePosAppSale(fakeAdmin(), "t1", 8_800);

    expect(res).toEqual({ ok: true, squarePaymentId: "sqpmt_9", amountTotal: 8_800, brand: "PAYPAY" });
  });

  it("既に記録済みの決済を引き当て対象から外す", async () => {
    findRecentPayment.mockResolvedValue({ ok: false, reason: "not_found" });

    await resolvePosAppSale(fakeAdmin(["sqpmt_old"]), "t1", 8_800);

    expect(findRecentPayment.mock.calls[0][0]).toMatchObject({ excludeIds: ["sqpmt_old"] });
  });

  it("既記録の照合に失敗したら引き当てない（今回の売上が消える経路を塞ぐ）", async () => {
    findRecentPayment.mockResolvedValue({
      ok: true,
      payment: { id: "x", status: "COMPLETED", amount_money: { amount: 8_800 } },
    });

    expect(await resolvePosAppSale(fakeAdmin([], { message: "boom" }), "t1", 8_800)).toEqual({
      ok: false,
      error: "square_recorded_lookup_failed",
    });
    expect(findRecentPayment).not.toHaveBeenCalled();
  });

  it("特定できないときは記帳しない", async () => {
    findRecentPayment.mockResolvedValue({ ok: false, reason: "ambiguous" });

    expect(await resolvePosAppSale(fakeAdmin(), "t1", 8_800)).toEqual({
      ok: false,
      error: "square_payment_ambiguous",
    });
  });
});
