import { describe, it, expect, vi } from "vitest";

import { recordPosSale } from "@/lib/pos/recordSale";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const CALLER = { tenantId: "t-1", userId: "u-1" };
const ARGS = { payment_method: "card", amount: 5000, tax_rate: 10 };

/**
 * `payments` の既存行と update の結果だけ差し替えられる最小のダブル。
 * `.eq()` は何回でも繋げられるようにする（照合はテナントで絞らず1本、
 * 更新後の読み直しは `id` 1本と、呼び方が揃っていないため）。
 */
function fakeAdmin(opts: {
  existing?: { id: string; tenant_id: string; amount: number; document_id: string | null } | null;
  lookupError?: { message: string } | null;
  updateError?: { code?: string; message: string } | null;
  /** 更新後の読み直しで返す鍵。省略時は「入った」ことにする */
  keyedAs?: string | null;
}) {
  const rpc = vi.fn().mockResolvedValue({ data: { payment_id: "pay-new" }, error: null });
  const updates: Array<Record<string, unknown>> = [];
  let selects = 0;

  const chain = (result: () => Promise<unknown>) => {
    const node: Record<string, unknown> = {
      eq: () => node,
      maybeSingle: result,
    };
    return node;
  };

  const from = vi.fn((table: string) => {
    if (table !== "payments") throw new Error(`想定外のテーブル: ${table}`);
    return {
      select: (cols: string) => {
        selects++;
        // 2回目の select は更新後の読み直し（鍵が入ったかの確認）
        if (cols.includes("stripe_payment_intent_id")) {
          return chain(async () => ({
            data: { stripe_payment_intent_id: opts.keyedAs === undefined ? "pi_123" : opts.keyedAs },
            error: null,
          }));
        }
        return chain(async () => ({ data: opts.existing ?? null, error: opts.lookupError ?? null }));
      },
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return { eq: () => ({ eq: async () => ({ error: opts.updateError ?? null }) }) };
      },
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: { from, rpc } as any, rpc, updates, selectCount: () => selects };
}

describe("recordPosSale", () => {
  it("PaymentIntent が無ければ、そのまま記録する（現金・振込）", async () => {
    const a = fakeAdmin({});
    const res = await recordPosSale(a.admin, CALLER, { ...ARGS, payment_method: "cash" }, null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyRecorded).toBe(false);
    expect(a.rpc).toHaveBeenCalledTimes(1);
    // 冪等キーが無いので、紐付けもしない
    expect(a.updates).toEqual([]);
  });

  it("初回は pos_checkout を呼び、PaymentIntent の ID を残す", async () => {
    const a = fakeAdmin({});
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.paymentId).toBe("pay-new");
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(a.updates).toEqual([{ stripe_payment_intent_id: "pi_123" }]);
  });

  it("**同じ PaymentIntent で再送されたら2件目を作らない**（カードは既に切られている）", async () => {
    const a = fakeAdmin({ existing: { id: "pay-existing", tenant_id: "t-1", amount: 5000, document_id: "doc-1" } });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyRecorded).toBe(true);
    expect(res.paymentId).toBe("pay-existing");
    expect(res.recordedAmount).toBe(5000);
    // ここが本題。2回目で pos_checkout を呼ぶと売上が二重に立つ
    expect(a.rpc).not.toHaveBeenCalled();
  });

  it("一意制約に当たったら**失敗として返す**（黙って ok にしない）", async () => {
    const a = fakeAdmin({ updateError: { code: "23505", message: "duplicate key" } });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(String((res.error as Error).message)).toContain("二重に記録");
  });

  it("`pi_` で始まらない値は冪等キーにしない（既存行を誤って返さない）", async () => {
    const a = fakeAdmin({ existing: { id: "pay-existing", tenant_id: "t-1", amount: 5000, document_id: null } });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "cs_123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyRecorded).toBe(false);
    expect(a.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("recordPosSale の守り", () => {
  it("**照合に失敗したら作らない**（失敗を「無かった」と読むと重複を作る）", async () => {
    const a = fakeAdmin({ lookupError: { message: "connection reset" } });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    expect(res.ok).toBe(false);
    expect(a.rpc).not.toHaveBeenCalled();
  });

  it("**他テナントに記録済みなら作らない**（一意インデックスはテナントを見ない）", async () => {
    const a = fakeAdmin({ existing: { id: "pay-x", tenant_id: "t-OTHER", amount: 5000, document_id: null } });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(String((res.error as Error).message)).toContain("別のテナント");
    expect(a.rpc).not.toHaveBeenCalled();
  });

  it("鍵が入らなかった場合でも売上は残す（失敗にすると本当に重複する）", async () => {
    const a = fakeAdmin({ keyedAs: null });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    expect(res.ok).toBe(true);
  });
});
