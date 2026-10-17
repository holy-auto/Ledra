/**
 * ログインコードの試行の予約（markCodeAttempt / markGlobalCodeAttempt）。
 * 同時に来た誤入力が同じ回数を読んでも、更新できるのは1つだけ —— 上限を超えて照合されない。
 * 更新の条件（読んだ回数のまま・未使用）を外すと、2回目の予約も通ってこのテストは落ちる。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.CUSTOMER_AUTH_PEPPER = "test-pepper";
});

type Row = { id: string; attempts: number; used_at: string | null };
const rows: Row[] = [];

// update(...).eq/is(...).select() だけを持つ最小の PostgREST 代わり。条件に合う行だけを更新して返す
function from() {
  return {
    update(patch: Partial<Row>) {
      const filters: ((r: Row) => boolean)[] = [];
      const q = {
        eq(col: keyof Row, v: unknown) {
          filters.push((r) => r[col] === v);
          return q;
        },
        is(col: keyof Row, v: null) {
          filters.push((r) => r[col] === v);
          return q;
        },
        async select() {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          hit.forEach((r) => Object.assign(r, patch));
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        },
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => ({ from }) }));

import { markCodeAttempt } from "@/lib/customerPortalServer";
import { markGlobalCodeAttempt } from "@/lib/customerPortalGlobal";

beforeEach(() => {
  rows.length = 0;
});

describe.each([
  ["markCodeAttempt", markCodeAttempt],
  ["markGlobalCodeAttempt", markGlobalCodeAttempt],
])("%s", (_name, reserve) => {
  it("同じ回数を読んだ2つ目の予約は通らない", async () => {
    rows.push({ id: "r", attempts: 0, used_at: null });
    expect(await reserve("r", 0)).toBe(true);
    expect(await reserve("r", 0)).toBe(false);
    expect(rows[0].attempts).toBe(1);
  });

  it("使用済みのコードは予約できない", async () => {
    rows.push({ id: "r", attempts: 0, used_at: "2026-10-17T00:00:00Z" });
    expect(await reserve("r", 0)).toBe(false);
  });
});
