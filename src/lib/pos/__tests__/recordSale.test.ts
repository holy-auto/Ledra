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
  /** テナントの有効な店舗。省略時は1店舗（自動で入る） */
  stores?: Array<{ id: string }>;
  /** 指定された店舗がテナントのものか。省略時は「ある」 */
  requestedStoreFound?: boolean;
  /** pos_checkout が返す領収書の ID。省略時は null（＝領収書を作らなかった） */
  rpcDocumentId?: string | null;
  /** 再送時に既存の領収書が持っている公開トークン */
  existingPublicId?: string | null;
  /** 公開トークンの書き込みが失敗する場合 */
  docUpdateError?: { message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue({
    data: { payment_id: "pay-new", document_id: opts.rpcDocumentId ?? null },
    error: null,
  });
  const updates: Array<Record<string, unknown>> = [];
  const docUpdates: Array<Record<string, unknown>> = [];
  let selects = 0;

  const chain = (result: () => Promise<unknown>) => {
    const node: Record<string, unknown> = {
      eq: () => node,
      maybeSingle: result,
    };
    return node;
  };

  const from = vi.fn((table: string) => {
    if (table === "stores") {
      // `.eq()` を重ねた末に `maybeSingle()`（指定の検証）か、そのまま await（一覧）
      const list = opts.stores ?? [{ id: "store-1" }];
      const node: Record<string, unknown> = {
        eq: () => node,
        limit: async () => ({ data: list, error: null }),
        maybeSingle: async () => ({
          data: opts.requestedStoreFound === false ? null : { id: "store-req" },
          error: null,
        }),
      };
      return { select: () => node };
    }
    if (table === "documents") {
      // 再送時の読み直し（公開トークン）と、初回の書き込み
      return {
        select: () =>
          chain(async () => ({
            data: { public_id: opts.existingPublicId ?? null },
            error: null,
          })),
        update: (patch: Record<string, unknown>) => {
          docUpdates.push(patch);
          const node: Record<string, unknown> = {
            eq: () => node,
            is: async () => ({ error: opts.docUpdateError ?? null }),
          };
          return node;
        },
      };
    }
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
  return { admin: { from, rpc } as any, rpc, updates, docUpdates, selectCount: () => selects };
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
    const a = fakeAdmin({
      existing: { id: "pay-existing", tenant_id: "t-1", amount: 5000, document_id: "doc-1" },
      existingPublicId: "tok-1",
    });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyRecorded).toBe(true);
    expect(res.paymentId).toBe("pay-existing");
    expect(res.recordedAmount).toBe(5000);
    // ここが本題。2回目で pos_checkout を呼ぶと売上が二重に立つ
    expect(a.rpc).not.toHaveBeenCalled();
    // 再送では documents を触らない。トークンは初回に書かれたものが残る
    expect(a.docUpdates).toEqual([]);
  });

  it("領収書ができたら公開トークンを書く（要件5.10 の共有URLの鍵）", async () => {
    const a = fakeAdmin({ rpcDocumentId: "doc-1" });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(a.docUpdates).toHaveLength(1);
    // 22文字 base64url（makePublicId / CSPRNG）。ここが空だと共有ボタンが出ない
    expect(a.docUpdates[0].public_id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("**公開トークンが書けなくても売上は失敗にしない**（カードは既に切られている）", async () => {
    const a = fakeAdmin({ rpcDocumentId: "doc-1", docUpdateError: { message: "boom" } });
    const res = await recordPosSale(a.admin, CALLER, ARGS, "pi_123");
    // 共有ボタンが出なくなるだけ。売上は残す
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.paymentId).toBe("pay-new");
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

describe("recordPosSale の店舗", () => {
  it("店舗の指定が無ければ、有効な店舗が1つのときだけ自動で入れる", async () => {
    const a = fakeAdmin({ stores: [{ id: "store-1" }] });
    const res = await recordPosSale(a.admin, CALLER, ARGS, null);
    expect(res.ok).toBe(true);
    expect(a.rpc.mock.calls[0][1]).toMatchObject({ p_store_id: "store-1" });
  });

  it("有効な店舗が2つ以上なら**推測で入れない**", async () => {
    const a = fakeAdmin({ stores: [{ id: "store-1" }, { id: "store-2" }] });
    const res = await recordPosSale(a.admin, CALLER, ARGS, null);
    expect(res.ok).toBe(true);
    expect(a.rpc.mock.calls[0][1]).toMatchObject({ p_store_id: null });
  });

  it("**他テナントの店舗 ID は入れない**（外部キーにテナントの条件が無い）", async () => {
    const a = fakeAdmin({ requestedStoreFound: false });
    const res = await recordPosSale(a.admin, CALLER, { ...ARGS, store_id: "store-other" }, null);
    expect(res.ok).toBe(true);
    // **売上は記録する。** ここに来た時点でカードは切れているので、
    // 失敗として返すと「金は取れたが記録が無い」が固定される
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0][1]).toMatchObject({ p_store_id: null });
  });
});
