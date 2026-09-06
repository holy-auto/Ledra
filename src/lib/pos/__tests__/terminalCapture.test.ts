import { describe, it, expect, vi, beforeEach } from "vitest";

import { captureTerminalPayment } from "@/lib/pos/terminalCapture";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

const retrieve = vi.fn();
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({ paymentIntents: { retrieve: (...a: unknown[]) => retrieve(...a) } }),
}));

vi.mock("@/lib/pos/inventoryDeduction", () => ({
  deductInventoryForPosItems: vi.fn().mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0, retryQueued: 0 }),
}));

/** `payments` に既存行があるかどうかだけを差し替えられる最小のダブル */
function fakeAdmin(opts: { existingPayment: { id: string; tenant_id: string; document_id: string | null } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: { payment_id: "pay-new" }, error: null });
  const updates: Array<Record<string, unknown>> = [];

  const from = vi.fn((table: string) => {
    if (table === "tenants") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { stripe_connect_account_id: null, stripe_connect_onboarded: false },
            }),
          }),
        }),
      };
    }
    if (table === "stores") {
      const node: Record<string, unknown> = {
        eq: () => node,
        limit: async () => ({ data: [{ id: "store-1" }], error: null }),
        maybeSingle: async () => ({ data: { id: "store-1" }, error: null }),
      };
      return { select: () => node };
    }
    if (table === "documents") {
      // 再送時に既存の領収書から公開トークンを読み直す（要件5.10: 再送でも送れる）
      const node: Record<string, unknown> = {
        eq: () => node,
        is: async () => ({ error: null }),
        maybeSingle: async () => ({ data: { public_id: "tok-1" }, error: null }),
      };
      return { select: () => node, update: () => node };
    }
    if (table === "payments") {
      // `.eq()` の回数は呼び方で変わるので、何回でも繋げられるようにする
      const chain = (result: () => Promise<unknown>) => {
        const node: Record<string, unknown> = { eq: () => node, maybeSingle: result };
        return node;
      };
      return {
        select: (cols: string) =>
          cols.includes("stripe_payment_intent_id")
            ? chain(async () => ({ data: { stripe_payment_intent_id: "pi_123" }, error: null }))
            : chain(async () => ({ data: opts.existingPayment, error: null })),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      };
    }
    throw new Error(`想定外のテーブル: ${table}`);
  });

  return { admin: { from, rpc }, rpc, updates };
}

let current: ReturnType<typeof fakeAdmin>;
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: current.admin }),
}));

const CALLER = { tenantId: "t-1", userId: "u-1" };
const INPUT = { payment_intent_id: "pi_123", tax_rate: 10 };

describe("captureTerminalPayment", () => {
  beforeEach(() => {
    retrieve.mockReset();
  });

  it("PaymentIntent が succeeded でなければ記録しない", async () => {
    current = fakeAdmin({ existingPayment: null });
    retrieve.mockResolvedValue({ id: "pi_123", status: "requires_payment_method", amount: 1000 });

    const res = await captureTerminalPayment(CALLER, INPUT);
    expect(res.ok).toBe(false);
    expect(current.rpc).not.toHaveBeenCalled();
  });

  it("初回は pos_checkout を呼び、PaymentIntent の ID を残す", async () => {
    current = fakeAdmin({ existingPayment: null });
    retrieve.mockResolvedValue({ id: "pi_123", status: "succeeded", amount: 5000 });

    const res = await captureTerminalPayment(CALLER, INPUT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.already_recorded).toBe(false);
    expect(current.rpc).toHaveBeenCalledTimes(1);
    // 金額は Stripe 側の実額を使う（端末から渡された値ではない）
    expect(current.rpc.mock.calls[0][1]).toMatchObject({ p_amount: 5000, p_received_amount: 5000 });
    // ID を残さないと、後から突き合わせて重複を見つけられない
    expect(current.updates).toEqual([{ stripe_payment_intent_id: "pi_123" }]);
  });

  it("**同じ PaymentIntent で再送されたら2件目を作らない**（カードは既に切られている）", async () => {
    current = fakeAdmin({ existingPayment: { id: "pay-existing", tenant_id: "t-1", document_id: "doc-1" } });
    retrieve.mockResolvedValue({ id: "pi_123", status: "succeeded", amount: 5000 });

    const res = await captureTerminalPayment(CALLER, INPUT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.already_recorded).toBe(true);
    expect(res.result).toEqual({ payment_id: "pay-existing", document_id: "doc-1" });
    // ここが本題。2回目で pos_checkout を呼ぶと売上が二重に立つ
    expect(current.rpc).not.toHaveBeenCalled();
  });
});
