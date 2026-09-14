import { describe, it, expect } from "vitest";

import { resolveStoreId } from "@/lib/stores/resolveStoreId";

/**
 * `stores` だけを返す最小のダブル。
 * `.eq()` を何回でも繋げられるようにして、末尾が `maybeSingle()`（指定の検証）か
 * `limit()`（有効な店舗の列挙）かで返す物を変える。
 */
function fakeClient(opts: {
  list?: Array<{ id: string }>;
  found?: { id: string } | null;
  error?: { message: string };
}) {
  const node: Record<string, unknown> = {
    eq: () => node,
    limit: async () => ({ data: opts.error ? null : (opts.list ?? []), error: opts.error ?? null }),
    maybeSingle: async () => ({ data: opts.error ? null : (opts.found ?? null), error: opts.error ?? null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => ({ select: () => node }) } as any;
}

describe("resolveStoreId", () => {
  it("指定が無く、有効な店舗が1つなら、それを入れる", async () => {
    const res = await resolveStoreId(fakeClient({ list: [{ id: "store-1" }] }), "t-1");
    expect(res).toEqual({ ok: true, storeId: "store-1" });
  });

  it("指定が無く、有効な店舗が2つ以上なら**推測で入れない**", async () => {
    const res = await resolveStoreId(fakeClient({ list: [{ id: "s-1" }, { id: "s-2" }] }), "t-1");
    expect(res).toEqual({ ok: true, storeId: null });
  });

  it("指定が無く、店舗が1つも無ければ null", async () => {
    const res = await resolveStoreId(fakeClient({ list: [] }), "t-1");
    expect(res).toEqual({ ok: true, storeId: null });
  });

  it("指定があり、そのテナントの店舗なら、そのまま使う", async () => {
    const res = await resolveStoreId(fakeClient({ found: { id: "store-9" } }), "t-1", "store-9");
    expect(res).toEqual({ ok: true, storeId: "store-9" });
  });

  it("**他テナントの店舗 ID は通さない**（store_id の外部キーにテナントの条件が無い）", async () => {
    const res = await resolveStoreId(fakeClient({ found: null, list: [{ id: "store-1" }] }), "t-1", "store-other");
    expect(res).toEqual({ ok: false, error: "store_not_in_tenant" });
  });

  it("**照合に失敗したら「テナントの店舗ではない」と読まない**（正しい作成を弾く）", async () => {
    const res = await resolveStoreId(fakeClient({ error: { message: "connection reset" } }), "t-1", "store-9");
    expect(res).toEqual({ ok: false, error: "store_lookup_failed" });
  });

  it("**既定を数えるのに失敗したら「店舗が無い」と読まない**（黙って null を書く）", async () => {
    const res = await resolveStoreId(fakeClient({ error: { message: "connection reset" } }), "t-1");
    expect(res).toEqual({ ok: false, error: "store_lookup_failed" });
  });

  it("空文字や空白だけの指定は「指定なし」として扱う（既定に落ちる）", async () => {
    const res = await resolveStoreId(fakeClient({ list: [{ id: "store-1" }], found: null }), "t-1", "  ");
    expect(res).toEqual({ ok: true, storeId: "store-1" });
  });
});
