/**
 * 返金 (refund) ルートの累計ガードを検証する。
 *
 * 修正前の不具合: refund_amount を上書きし、既存返金額を無視して単発額だけを元金額と比較していた。
 * その結果 partial_refund から再返金でき、累計が元金額を超えて記録が壊れた。
 * ここでは「累計で上限判定」「refund_amount を累計で保存」「累計到達で refunded」を固定する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCaller,
  requireMinRole: () => true,
}));

import { POST } from "@/app/api/admin/payments/[id]/refund/route";

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  reservation_id: string | null;
  refund_amount: number | null;
};

/** refund ルートが使う supabase 呼び出しを最小限モックし、update ペイロードを捕捉する。 */
function makeSupabase(paymentRow: PaymentRow | null) {
  const captured: { update?: Record<string, unknown> } = {};
  const client = {
    from(table: string) {
      if (table === "payments") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: paymentRow, error: paymentRow ? null : { message: "not found" } }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            captured.update = payload;
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({ single: async () => ({ data: { ...paymentRow, ...payload }, error: null }) }),
                }),
              }),
            };
          },
        };
      }
      if (table === "reservations") {
        return { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as never, captured };
}

function reqWith(refundAmount: number) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refund_amount: refundAmount }),
  }) as never;
}

const ctx = { params: Promise.resolve({ id: "pay-1" }) };

beforeEach(() => {
  mocks.resolveCaller.mockResolvedValue({ userId: "u1", tenantId: "t1", role: "admin" });
});

describe("payments refund — 累計ガード", () => {
  it("初回の一部返金は partial_refund + 単発額を記録", async () => {
    const { client, captured } = makeSupabase({
      id: "pay-1",
      amount: 10000,
      status: "paid",
      reservation_id: null,
      refund_amount: 0,
    });
    mocks.createClient.mockResolvedValue(client);

    const res = await POST(reqWith(6000), ctx);
    expect(res.status).toBe(200);
    expect(captured.update).toMatchObject({ status: "partial_refund", refund_amount: 6000 });
  });

  it("既存返金 6000 + 追加 6000 は元金額 10000 を超えるため拒否 (回帰の核)", async () => {
    const { client, captured } = makeSupabase({
      id: "pay-1",
      amount: 10000,
      status: "partial_refund",
      reservation_id: null,
      refund_amount: 6000,
    });
    mocks.createClient.mockResolvedValue(client);

    const res = await POST(reqWith(6000), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("refund_exceeds_amount");
    expect(captured.update).toBeUndefined(); // 更新まで到達しない
  });

  it("既存返金 4000 + 追加 6000 で累計が元金額に到達 → refunded、累計 10000 を保存", async () => {
    const { client, captured } = makeSupabase({
      id: "pay-1",
      amount: 10000,
      status: "partial_refund",
      reservation_id: null,
      refund_amount: 4000,
    });
    mocks.createClient.mockResolvedValue(client);

    const res = await POST(reqWith(6000), ctx);
    expect(res.status).toBe(200);
    expect(captured.update).toMatchObject({ status: "refunded", refund_amount: 10000 });
  });
});
