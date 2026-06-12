import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

type DocRow = {
  doc_type: string | null;
  total: number | string | null;
  issued_at: string | null;
  vehicle_info_json: { maker?: string | null } | null;
  vehicle: { maker: string | null } | null;
};

// Chainable query stub: builder methods return `this`; awaiting resolves the result.
function makeQuery(result: { data: DocRow[] | null; error: { message: string } | null }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "not", "in", "order", "limit"]) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve: (v: typeof result) => unknown) => resolve(result);
  return q;
}

let nextResult: { data: DocRow[] | null; error: { message: string } | null } = { data: [], error: null };
const fromSpy = vi.fn(() => makeQuery(nextResult));

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: { from: fromSpy }, tenantId: "tenant-1" }),
}));

import { getSalesBreakdown, SALES_WINDOW_MONTHS } from "@/lib/analytics/salesBreakdown";

function setRows(rows: DocRow[]) {
  nextResult = { data: rows, error: null };
}

describe("getSalesBreakdown", () => {
  beforeEach(() => {
    fromSpy.mockClear();
    nextResult = { data: [], error: null };
  });

  it("materializes the correct number of monthly buckets per window", async () => {
    setRows([]);
    const r = await getSalesBreakdown({ tenantId: "tenant-1", window: "12m" });
    expect(r.monthly).toHaveLength(SALES_WINDOW_MONTHS["12m"]);
    expect(r.window).toBe("12m");
    expect(r.totals.count).toBe(0);
    // Months are ascending YYYY-MM and unique.
    const keys = r.monthly.map((m) => m.month);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  });

  it("aggregates revenue by doc_type sorted desc", async () => {
    setRows([
      { doc_type: "invoice", total: 10000, issued_at: "2026-06-01", vehicle_info_json: null, vehicle: null },
      { doc_type: "invoice", total: 5000, issued_at: "2026-06-02", vehicle_info_json: null, vehicle: null },
      { doc_type: "estimate", total: 30000, issued_at: "2026-05-10", vehicle_info_json: null, vehicle: null },
    ]);
    const r = await getSalesBreakdown({ tenantId: "tenant-1", window: "12m" });
    expect(r.by_doc_type[0]).toEqual({ doc_type: "estimate", total_revenue: 30000, count: 1 });
    expect(r.by_doc_type[1]).toEqual({ doc_type: "invoice", total_revenue: 15000, count: 2 });
    expect(r.totals.total_revenue).toBe(45000);
    expect(r.totals.count).toBe(3);
  });

  it("prefers FK vehicle.maker, falls back to vehicle_info_json.maker, then 不明", async () => {
    setRows([
      {
        doc_type: "invoice",
        total: 1000,
        issued_at: "2026-06-01",
        vehicle_info_json: null,
        vehicle: { maker: "トヨタ" },
      },
      {
        doc_type: "invoice",
        total: 2000,
        issued_at: "2026-06-01",
        vehicle_info_json: { maker: "日産" },
        vehicle: null,
      },
      { doc_type: "invoice", total: 500, issued_at: "2026-06-01", vehicle_info_json: null, vehicle: null },
      // FK maker wins even if vehicle_info_json also present.
      {
        doc_type: "invoice",
        total: 4000,
        issued_at: "2026-06-01",
        vehicle_info_json: { maker: "ホンダ" },
        vehicle: { maker: "トヨタ" },
      },
    ]);
    const r = await getSalesBreakdown({ tenantId: "tenant-1", window: "12m" });
    const byMaker = Object.fromEntries(r.by_maker.map((m) => [m.maker, m]));
    expect(byMaker["トヨタ"]).toEqual({ maker: "トヨタ", total_revenue: 5000, count: 2 });
    expect(byMaker["日産"].total_revenue).toBe(2000);
    expect(byMaker["不明"].total_revenue).toBe(500);
    // Sorted by revenue desc → トヨタ first.
    expect(r.by_maker[0].maker).toBe("トヨタ");
  });

  it("caps by_maker at top 10", async () => {
    const rows: DocRow[] = [];
    for (let i = 0; i < 15; i += 1) {
      rows.push({
        doc_type: "invoice",
        total: (15 - i) * 1000,
        issued_at: "2026-06-01",
        vehicle_info_json: null,
        vehicle: { maker: `M${i}` },
      });
    }
    setRows(rows);
    const r = await getSalesBreakdown({ tenantId: "tenant-1", window: "12m" });
    expect(r.by_maker).toHaveLength(10);
    expect(r.by_maker[0].maker).toBe("M0"); // highest revenue
  });

  it("buckets revenue into the right month and zero-fills the rest", async () => {
    setRows([{ doc_type: "invoice", total: 7000, issued_at: "2026-06-15", vehicle_info_json: null, vehicle: null }]);
    const r = await getSalesBreakdown({ tenantId: "tenant-1", window: "3m" });
    const june = r.monthly.find((m) => m.month === "2026-06");
    expect(june?.total_revenue).toBe(7000);
    expect(june?.count).toBe(1);
    const others = r.monthly.filter((m) => m.month !== "2026-06");
    for (const o of others) {
      expect(o.total_revenue).toBe(0);
      expect(o.count).toBe(0);
    }
  });

  it("coerces string totals to numbers", async () => {
    setRows([{ doc_type: "invoice", total: "12000", issued_at: "2026-06-01", vehicle_info_json: null, vehicle: null }]);
    const r = await getSalesBreakdown({ tenantId: "tenant-1", window: "12m" });
    expect(r.totals.total_revenue).toBe(12000);
  });

  it("propagates query errors", async () => {
    nextResult = { data: null, error: { message: "boom" } };
    await expect(getSalesBreakdown({ tenantId: "tenant-1", window: "12m" })).rejects.toThrow(/boom/);
  });
});
