import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `resolveInsurerCaller` の**振る舞い**の再現テスト（#1122）。
 *
 * 直したバグ（Before）: クッキーで指定された保険会社の会員行を**先に1件へ絞ってから**
 * 使用可否（active / active_pending_review）を見ていた。指定先が停止（suspended）だと、
 * 会員行は見つかる → 状態フィルタで弾かれ null → **別に使える保険会社があるのに
 * 401 になる**。複数保険会社に所属するユーザーが締め出された。
 *
 * After: 会員行を全部取り、使える保険会社の集合を出してから選ぶ。
 * クッキー先が使えるならそれ、使えなければ最古の使える会員行、無ければ null。
 *
 * これは構造ではなく振る舞いの検査（insurerUsableStatuses.test.ts が構造側）。
 */

const cookieValue = { current: undefined as string | undefined };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "active_insurer_id" && cookieValue.current ? { value: cookieValue.current } : undefined,
  })),
}));

const authUser = { current: { id: "u1" } as { id: string } | null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: authUser.current } }) },
  })),
}));

// DB fixtures the fake admin serves.
const db = {
  memberships: [] as Array<{ id: string; insurer_id: string; role: string }>,
  membershipsError: null as unknown,
  insurers: [] as Array<{ id: string; plan_tier: string; status: string }>,
  insurersError: null as unknown,
};

// Chainable, awaitable fake: every builder method returns the builder, and the
// builder resolves (thenable) to the dataset for whichever table `from` named.
function fakeAdmin() {
  const make = (table: string) => {
    const result =
      table === "insurer_users"
        ? { data: db.membershipsError ? null : db.memberships, error: db.membershipsError }
        : { data: db.insurersError ? null : db.insurers, error: db.insurersError };
    const builder: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    for (const m of ["select", "eq", "in", "order"]) builder[m] = () => builder;
    return builder;
  };
  return { from: (table: string) => make(table) };
}

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: vi.fn(() => fakeAdmin()) }));
vi.mock("@/lib/sentryContext", () => ({ setSentryInsurerContext: vi.fn() }));

import { resolveInsurerCaller } from "../insurerAuth";

beforeEach(() => {
  cookieValue.current = undefined;
  authUser.current = { id: "u1" };
  db.memberships = [];
  db.membershipsError = null;
  db.insurers = [];
  db.insurersError = null;
});

describe("resolveInsurerCaller", () => {
  it("未認証なら null", async () => {
    authUser.current = null;
    expect(await resolveInsurerCaller()).toBeNull();
  });

  it("会員行が無ければ null", async () => {
    db.memberships = [];
    expect(await resolveInsurerCaller()).toBeNull();
  });

  it("クッキー先が停止でも、別の使える保険会社にフォールバックする（#1122 の核心）", async () => {
    // A（停止, クッキー先） / B（有効, 最古）に所属。旧実装は A に絞って 401 だった。
    db.memberships = [
      { id: "iuB", insurer_id: "B", role: "insurer_staff" },
      { id: "iuA", insurer_id: "A", role: "insurer_staff" },
    ];
    db.insurers = [{ id: "B", plan_tier: "insurer_free", status: "active" }]; // A は suspended なので使える集合に無い
    cookieValue.current = "A";

    const ctx = await resolveInsurerCaller();
    expect(ctx).not.toBeNull();
    expect(ctx?.insurerId).toBe("B");
    expect(ctx?.insurerUserId).toBe("iuB");
  });

  it("クッキー先が使えるならそれを選ぶ（最古ではなく指定を優先）", async () => {
    db.memberships = [
      { id: "iuB", insurer_id: "B", role: "insurer_staff" }, // 最古
      { id: "iuA", insurer_id: "A", role: "insurer_admin" },
    ];
    db.insurers = [
      { id: "A", plan_tier: "insurer_pro", status: "active" },
      { id: "B", plan_tier: "insurer_free", status: "active_pending_review" },
    ];
    cookieValue.current = "A";

    const ctx = await resolveInsurerCaller();
    expect(ctx?.insurerId).toBe("A");
    expect(ctx?.insurerStatus).toBe("active");
  });

  it("クッキー無しなら最古の使える会員行を選ぶ", async () => {
    db.memberships = [
      { id: "iuB", insurer_id: "B", role: "insurer_staff" }, // 最古・使える
      { id: "iuA", insurer_id: "A", role: "insurer_admin" },
    ];
    db.insurers = [
      { id: "A", plan_tier: "insurer_pro", status: "active" },
      { id: "B", plan_tier: "insurer_free", status: "active" },
    ];

    const ctx = await resolveInsurerCaller();
    expect(ctx?.insurerId).toBe("B");
  });

  it("どの保険会社も使えなければ null", async () => {
    db.memberships = [{ id: "iuA", insurer_id: "A", role: "insurer_staff" }];
    db.insurers = []; // 全部 suspended 等
    expect(await resolveInsurerCaller()).toBeNull();
  });
});
