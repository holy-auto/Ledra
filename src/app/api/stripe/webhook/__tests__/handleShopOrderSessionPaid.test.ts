/**
 * handleShopOrderSessionPaid のテスト。
 *
 * E2-2/E2-3 是正の回帰確認:
 *   - E2-3: payment_status が "paid" でない checkout はステータス更新をせず
 *     早期 return する（コンビニ/銀行振込等の非同期決済で入金確定前に
 *     NFC タグがプロビジョニングされる事故を防ぐ）。
 *   - E2-2: shop_orders の更新が失敗したら例外を投げる（呼び出し元の
 *     stripe webhook ハンドラが catch し、processed_at を立てずに
 *     Stripe の再送を許す設計）。
 *
 * code-review 回帰確認 (2026-09-08):
 *   - コンビニ/銀行振込等で支払いが遅れている間に運営が注文を cancelled に
 *     した後、遅れて async_payment_succeeded が届いても paid へ戻さない
 *     （更新を pending 系ステータスからの遷移だけに限定し、対象行が0件なら
 *     NFC プロビジョニング・通知も発火させない）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/shopOrderEmail", () => ({
  sendShopOrderEmail: vi.fn(async () => {}),
  sendShopOrderOpsNotification: vi.fn(async () => {}),
}));

import { sendShopOrderEmail, sendShopOrderOpsNotification } from "@/lib/email/shopOrderEmail";
import { handleShopOrderSessionPaid } from "../route";

function makeSupabase(opts: { updateError?: { message: string } | null; matchesPrePaidStatus?: boolean } = {}) {
  const updateCalls: Array<{ table: string; patch: Record<string, unknown>; statusFilter?: unknown }> = [];
  const insertCalls: Array<{ table: string; rows: unknown[] }> = [];
  const matches = opts.matchesPrePaidStatus ?? true;

  const supabase: any = {
    from: (table: string) => {
      if (table === "shop_orders") {
        return {
          update: (patch: Record<string, unknown>) => {
            const call: { table: string; patch: Record<string, unknown>; statusFilter?: unknown } = {
              table,
              patch,
            };
            updateCalls.push(call);
            return {
              eq: () => ({
                in: (_col: string, statuses: unknown) => {
                  call.statusFilter = statuses;
                  return {
                    select: async () => ({
                      data: opts.updateError ? null : matches ? [{ id: "order-1" }] : [],
                      error: opts.updateError ?? null,
                    }),
                  };
                },
              }),
            };
          },
        };
      }
      if (table === "shop_order_items") {
        return {
          select: () => ({
            eq: async () => ({ data: [{ meta: { quantity_per_pack: 0 }, quantity: 1 }] }),
          }),
        };
      }
      if (table === "nfc_tags") {
        return {
          insert: (rows: unknown[]) => {
            insertCalls.push({ table, rows });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { supabase, updateCalls, insertCalls };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    payment_intent: "pi_test_1",
    metadata: { shop_order_id: "order-1", tenant_id: "tenant-1" },
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.mocked(sendShopOrderEmail).mockClear();
  vi.mocked(sendShopOrderOpsNotification).mockClear();
});

describe("handleShopOrderSessionPaid", () => {
  it("shop_order_id が無ければ何もしない", async () => {
    const { supabase, updateCalls } = makeSupabase();
    await handleShopOrderSessionPaid(supabase, makeSession({ metadata: {} }), "evt_1");
    expect(updateCalls.length).toBe(0);
  });

  it("payment_status が paid でなければ更新せず早期 return する (E2-3 回帰確認)", async () => {
    const { supabase, updateCalls } = makeSupabase();
    await handleShopOrderSessionPaid(supabase, makeSession({ payment_status: "unpaid" }), "evt_1");
    expect(updateCalls.length).toBe(0);
    expect(sendShopOrderEmail).not.toHaveBeenCalled();
  });

  it("DB 更新が失敗したら例外を投げる (E2-2 回帰確認)", async () => {
    const { supabase } = makeSupabase({ updateError: { message: "connection reset" } });
    await expect(handleShopOrderSessionPaid(supabase, makeSession(), "evt_1")).rejects.toThrow(
      /shop order update failed/,
    );
    // 更新失敗時はメール送信まで到達しない
    expect(sendShopOrderEmail).not.toHaveBeenCalled();
  });

  it("paid かつ更新成功なら注文完了メールを送る", async () => {
    const { supabase, updateCalls } = makeSupabase();
    await handleShopOrderSessionPaid(supabase, makeSession(), "evt_1");
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].patch.status).toBe("paid");
    // pending 系ステータスからの遷移だけを許可している（cancelled 等には効かない）。
    expect(updateCalls[0].statusFilter).toEqual(["pending", "pending_checkout", "pending_payment"]);
    expect(sendShopOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", shopOrderId: "order-1", kind: "paid" }),
    );
  });

  // code-review 回帰確認 (2026-09-08): 遅延決済(コンビニ/銀行振込)の間に運営が
  // 注文を cancelled にした後、遅れて async_payment_succeeded が届いても
  // paid へ戻さない。更新の対象行が0件（既に cancelled 等）なら、
  // NFC プロビジョニング・通知も発火させずに処理を止める。
  it("既に pending 系以外（cancelled等）に遷移済みなら paid へ戻さず、通知も送らない", async () => {
    const { supabase, updateCalls, insertCalls } = makeSupabase({ matchesPrePaidStatus: false });
    await handleShopOrderSessionPaid(supabase, makeSession(), "evt_1");
    expect(updateCalls.length).toBe(1); // update 自体は投げるが対象行は0件
    expect(insertCalls.length).toBe(0); // NFC タグは作らない
    expect(sendShopOrderEmail).not.toHaveBeenCalled();
    expect(sendShopOrderOpsNotification).not.toHaveBeenCalled();
  });
});
