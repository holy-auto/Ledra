import { describe, expect, it } from "vitest";
import { buildStoreUsage, monthRangeJst, currentMonthJst, type TenantMeta } from "@/lib/analytics/storeUsage";

const TENANTS: TenantMeta[] = [
  { id: "t1", name: "店舗A", plan_tier: "pro", is_active: true },
  { id: "t2", name: "店舗B", plan_tier: "free", is_active: true },
  { id: "t3", name: "店舗C", plan_tier: "free", is_active: false },
];

describe("monthRangeJst", () => {
  it("returns JST month boundaries as UTC ISO (UTC+9 offset)", () => {
    const r = monthRangeJst("2026-07");
    // 2026-07-01T00:00:00+09:00 === 2026-06-30T15:00:00Z
    expect(r?.monthStart).toBe("2026-06-30T15:00:00.000Z");
    // 2026-08-01T00:00:00+09:00 === 2026-07-31T15:00:00Z
    expect(r?.monthEnd).toBe("2026-07-31T15:00:00.000Z");
  });

  it("rejects malformed / out-of-range input", () => {
    expect(monthRangeJst("2026-13")).toBeNull();
    expect(monthRangeJst("2026-00")).toBeNull();
    expect(monthRangeJst("nope")).toBeNull();
  });
});

describe("currentMonthJst", () => {
  it("rolls over to the next JST day at UTC 15:00 boundary", () => {
    // 2026-07-31T15:30:00Z === 2026-08-01 00:30 JST
    expect(currentMonthJst(new Date("2026-07-31T15:30:00Z"))).toBe("2026-08");
    // 2026-07-31T14:30:00Z === 2026-07-31 23:30 JST
    expect(currentMonthJst(new Date("2026-07-31T14:30:00Z"))).toBe("2026-07");
  });
});

describe("buildStoreUsage", () => {
  const base = {
    month: "2026-07",
    monthStart: "2026-06-30T15:00:00.000Z",
    monthEnd: "2026-07-31T15:00:00.000Z",
    tenants: TENANTS,
    memberships: [
      { tenant_id: "t1", user_id: "u1" },
      { tenant_id: "t1", user_id: "u2" },
      { tenant_id: "t2", user_id: "u3" },
    ],
    lastSignInByUser: new Map<string, string | null>([
      ["u1", "2026-07-10T02:00:00Z"], // 当月ログイン
      ["u2", "2026-05-01T02:00:00Z"], // 当月外
      ["u3", "2026-07-20T02:00:00Z"], // 当月ログイン
    ]),
    operationsRows: [{ tenant_id: "t1" }, { tenant_id: "t1" }, { tenant_id: "t2" }],
    reservationRows: [{ tenant_id: "t1" }, { tenant_id: "t2" }],
    invoiceRows: [{ tenant_id: "t1" }],
    certificateRows: [{ tenant_id: "t1" }],
    customerRows: [{ tenant_id: "t1" }, { tenant_id: "t2" }],
    paymentRows: [] as { tenant_id: string | null }[],
    cumulative: { reservations: 42, work_records: 130, invoices: 17 },
  };

  it("counts per-store monthly operations / reservations / invoices", () => {
    const r = buildStoreUsage(base);
    const t1 = r.stores.find((s) => s.tenant_id === "t1")!;
    const t2 = r.stores.find((s) => s.tenant_id === "t2")!;
    const t3 = r.stores.find((s) => s.tenant_id === "t3")!;
    expect(t1.operations).toBe(2);
    expect(t1.reservations).toBe(1);
    expect(t1.invoices).toBe(1);
    expect(t2.operations).toBe(1);
    expect(t3.operations).toBe(0);
    // 操作回数降順ソート → t1 が先頭。
    expect(r.stores[0].tenant_id).toBe("t1");
  });

  it("counts active members from last_sign_in_at within the month only", () => {
    const r = buildStoreUsage(base);
    const t1 = r.stores.find((s) => s.tenant_id === "t1")!;
    // u1 は当月、u2 は当月外 → t1 のアクティブ会員は 1。
    expect(t1.active_members).toBe(1);
    // 最終ログインは全期間の最新 (u1 の 07-10)。
    expect(t1.last_login_at).toBe("2026-07-10T02:00:00Z");
    const t2 = r.stores.find((s) => s.tenant_id === "t2")!;
    expect(t2.active_members).toBe(1);
  });

  it("computes feature adoption over the active-store denominator", () => {
    const r = buildStoreUsage(base);
    // アクティブ店舗は t1,t2 の 2。
    expect(r.active_store_count).toBe(2);
    const reservations = r.feature_adoption.find((f) => f.key === "reservations")!;
    // 予約を使った店舗 = t1,t2 → 2/2 = 1.0
    expect(reservations.tenants_using).toBe(2);
    expect(reservations.adoption_rate).toBe(1);
    const invoices = r.feature_adoption.find((f) => f.key === "invoices")!;
    // 請求は t1 のみ → 1/2 = 0.5
    expect(invoices.adoption_rate).toBe(0.5);
    const payments = r.feature_adoption.find((f) => f.key === "payments")!;
    expect(payments.tenants_using).toBe(0);
    expect(payments.adoption_rate).toBe(0);
  });

  it("caps adoption at 100% by counting only active stores in the numerator", () => {
    // 非アクティブ店舗 t3 が期中に請求を作成 → 分子に混ぜると 2/2=100% を超える。
    const r = buildStoreUsage({
      ...base,
      invoiceRows: [{ tenant_id: "t1" }, { tenant_id: "t3" }],
    });
    const invoices = r.feature_adoption.find((f) => f.key === "invoices")!;
    // t3 は非アクティブなので分子に含めない → t1 のみ 1/2 = 0.5。
    expect(invoices.tenants_using).toBe(1);
    expect(invoices.adoption_rate).toBe(0.5);
    expect(r.feature_adoption.every((f) => (f.adoption_rate ?? 0) <= 1)).toBe(true);
  });

  it("passes through cumulative totals unchanged", () => {
    const r = buildStoreUsage(base);
    expect(r.cumulative).toEqual({ reservations: 42, work_records: 130, invoices: 17 });
  });
});
