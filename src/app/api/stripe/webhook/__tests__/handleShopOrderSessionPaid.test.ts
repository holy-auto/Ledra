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
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/shopOrderEmail", () => ({
  sendShopOrderEmail: vi.fn(async () => {}),
  sendShopOrderOpsNotification: vi.fn(async () => {}),
}));

import { sendShopOrderEmail, sendShopOrderOpsNotification } from "@/lib/email/shopOrderEmail";
import { handleShopOrderSessionPaid } from "../route";

function makeSupabase(opts: { updateError?: { message: string } | null } = {}) {
  const updateCalls: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const insertCalls: Array<{ table: string; rows: unknown[] }> = [];

  const supabase: any = {
    from: (table: string) => {
      if (table === "shop_orders") {
        return {
          update: (patch: Record<string, unknown>) => {
            updateCalls.push({ table, patch });
            return { eq: async () => ({ error: opts.updateError ?? null }) };
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
    expect(sendShopOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", shopOrderId: "order-1", kind: "paid" }),
    );
  });
});
