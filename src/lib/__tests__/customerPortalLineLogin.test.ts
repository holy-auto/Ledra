/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// LINE ログイントークンの安全性を検証する。ここが破れると、他人のマイページに
// 入れてしまうので、検証の要点は「使えるのは 1 回だけ・期限内だけ・正しい形だけ」。

const mocks = vi.hoisted(() => ({ createServiceRoleAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: mocks.createServiceRoleAdmin }));

import { issuePortalLoginToken, consumePortalLoginToken, releasePortalLoginToken } from "@/lib/customerPortalLineLogin";
import { maskPortalLoginToken } from "@/lib/line/messageStore";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-2222-2222-222222222222";

process.env.CUSTOMER_AUTH_PEPPER = "test-pepper";

/**
 * 1 行だけを持つ最小のトークンストア。
 * `claimable` は「used_at IS NULL 条件付き UPDATE が刺さるか」= 単回使用の再現。
 */
function adminMock(opts: {
  row?: { id: string; tenant_id: string; customer_id: string; expires_at: string; used_at: string | null } | null;
  claimable?: boolean;
}) {
  const inserted: any[] = [];
  const api = {
    inserted,
    from() {
      const b: any = {
        insert: (v: any) => {
          inserted.push(v);
          return Promise.resolve({ error: null });
        },
        select: () => b,
        update: () => b,
        eq: () => b,
        is: () => b,
        maybeSingle: async () =>
          b._afterUpdate
            ? { data: opts.claimable === false ? null : { id: "row-1" }, error: null }
            : { data: opts.row === undefined ? null : opts.row, error: null },
      };
      // update() を通った後の maybeSingle() は「クレーム結果」を返す
      const origUpdate = b.update;
      b.update = (...args: any[]) => {
        b._afterUpdate = true;
        return origUpdate(...args);
      };
      return b;
    },
  };
  return api;
}

const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();
const validRow = (over: Partial<Record<string, any>> = {}) => ({
  id: "row-1",
  tenant_id: TENANT,
  customer_id: CUSTOMER,
  expires_at: future(),
  used_at: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("issuePortalLoginToken", () => {
  it("64桁hexのトークンを返し、DBには生トークンではなくハッシュを保存する", async () => {
    const db = adminMock({});
    mocks.createServiceRoleAdmin.mockReturnValue(db);

    const token = await issuePortalLoginToken(TENANT, CUSTOMER);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const row = db.inserted[0];
    expect(row.tenant_id).toBe(TENANT);
    expect(row.customer_id).toBe(CUSTOMER);
    expect(row.token_hash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });
});

describe("consumePortalLoginToken", () => {
  it("有効なトークンは tenant/customer を返す", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ row: validRow() }));

    const res = await consumePortalLoginToken("a".repeat(64));

    expect(res).toEqual({ tenantId: TENANT, customerId: CUSTOMER });
  });

  it("tenant はトークン側の値を使う (URL パラメータでの上書きを許さない設計)", async () => {
    const other = "33333333-3333-3333-3333-333333333333";
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ row: validRow({ tenant_id: other }) }));

    const res = await consumePortalLoginToken("a".repeat(64));

    expect(res?.tenantId).toBe(other);
  });

  it("期限切れは拒否する", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ row: validRow({ expires_at: past() }) }));
    expect(await consumePortalLoginToken("a".repeat(64))).toBeNull();
  });

  it("使用済みは拒否する", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ row: validRow({ used_at: past() }) }));
    expect(await consumePortalLoginToken("a".repeat(64))).toBeNull();
  });

  it("並行タップでクレームに負けたら拒否する (単回使用)", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ row: validRow(), claimable: false }));
    expect(await consumePortalLoginToken("a".repeat(64))).toBeNull();
  });

  it("存在しないトークンは拒否する", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ row: null }));
    expect(await consumePortalLoginToken("a".repeat(64))).toBeNull();
  });

  it("形が違うトークンは DB を引く前に拒否する", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ row: validRow() }));

    for (const bad of ["", "  ", "xyz", "A".repeat(64), "a".repeat(63), "a".repeat(65), "' OR 1=1--"]) {
      expect(await consumePortalLoginToken(bad)).toBeNull();
    }
    expect(mocks.createServiceRoleAdmin).not.toHaveBeenCalled();
  });
});

describe("releasePortalLoginToken", () => {
  it("形が違うトークンでは DB を触らない", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({}));
    await releasePortalLoginToken("nope");
    expect(mocks.createServiceRoleAdmin).not.toHaveBeenCalled();
  });

  it("正しい形なら未使用に戻す (セッションを張れなかったときリンクを焼き切らない)", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({}));
    await releasePortalLoginToken("a".repeat(64));
    expect(mocks.createServiceRoleAdmin).toHaveBeenCalled();
  });
});

describe("maskPortalLoginToken", () => {
  // 受信箱 (customer_messages) に生トークンが残ると、店舗スタッフがコピーして
  // 顧客本人としてログインできてしまう。記録前に必ず伏せる。
  it("ログイン URL のトークンを伏せる", () => {
    const token = "b".repeat(64);
    const masked = maskPortalLoginToken(`ご案内\nhttps://app.example.com/my/line?t=${token}\n以上`);

    expect(masked).not.toContain(token);
    expect(masked).toContain("/my/line?t=***");
    expect(masked).toContain("ご案内");
  });

  it("トークンを含まない本文は変えない", () => {
    const body = "ご予約ありがとうございます。https://app.example.com/my?tenant=demo";
    expect(maskPortalLoginToken(body)).toBe(body);
  });
});
