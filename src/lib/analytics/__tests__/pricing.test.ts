import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

const mockAdmin = {
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: mockAdmin, tenantId: "tenant-1" }),
}));

import { getPricingElasticity, pricingWindowToSince } from "@/lib/analytics/pricing";

describe("pricingWindowToSince", () => {
  it("returns ~90 days back for '90d'", () => {
    const since = pricingWindowToSince("90d");
    const diffDays = (Date.now() - since.getTime()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(89.9);
    expect(diffDays).toBeLessThan(90.1);
  });

  it("returns ~365 days for '365d'", () => {
    const since = pricingWindowToSince("365d");
    const diffDays = (Date.now() - since.getTime()) / 86_400_000;
    expect(Math.round(diffDays)).toBe(365);
  });
});

describe("getPricingElasticity", () => {
  beforeEach(() => {
    mockAdmin.rpc.mockReset();
  });

  it("groups by title and pads missing months", async () => {
    // Use a 90-day window so we expect ~4 months in the axis.
    mockAdmin.rpc.mockResolvedValueOnce({
      data: [
        {
          period_month: "2026-04-01",
          title: "PPF全面",
          reservation_count: 5,
          completed_count: 4,
          cancelled_count: 1,
          avg_estimated_amount: 200_000,
          min_estimated_amount: 180_000,
          max_estimated_amount: 220_000,
          total_completed_revenue: 800_000,
        },
        {
          period_month: "2026-05-01",
          title: "PPF全面",
          reservation_count: 3,
          completed_count: 2,
          cancelled_count: 1,
          avg_estimated_amount: 210_000,
          min_estimated_amount: 200_000,
          max_estimated_amount: 220_000,
          total_completed_revenue: 420_000,
        },
        {
          period_month: "2026-05-01",
          title: "コーティング",
          reservation_count: 8,
          completed_count: 6,
          cancelled_count: 2,
          avg_estimated_amount: 60_000,
          min_estimated_amount: 50_000,
          max_estimated_amount: 80_000,
          total_completed_revenue: 360_000,
        },
      ],
      error: null,
    });

    const r = await getPricingElasticity({ tenantId: "tenant-1", window: "90d" });

    expect(r.offerings).toHaveLength(2);

    // Sorted by revenue desc: PPF has 1,220,000 total revenue, coating has 360,000
    expect(r.offerings[0].title).toBe("PPF全面");
    expect(r.offerings[0].total_revenue).toBe(1_220_000);
    expect(r.offerings[0].total_completed_count).toBe(6);
    expect(r.offerings[0].overall_close_rate).toBeCloseTo(6 / 8, 4);
    expect(r.offerings[0].min_price_overall).toBe(180_000);
    expect(r.offerings[0].max_price_overall).toBe(220_000);

    // Each offering should have one monthly point per month in the axis.
    const monthCount = r.months.length;
    expect(monthCount).toBeGreaterThanOrEqual(3);
    expect(r.offerings[0].monthly).toHaveLength(monthCount);
    expect(r.offerings[1].monthly).toHaveLength(monthCount);

    // Months not in the RPC payload should be zeroed.
    for (const m of r.offerings[1].monthly) {
      if (m.period_month !== "2026-05-01") {
        expect(m.reservation_count).toBe(0);
        expect(m.avg_estimated_amount).toBeNull();
      }
    }
  });

  it("computes revenue-weighted average price overall", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({
      data: [
        {
          period_month: "2026-04-01",
          title: "A",
          reservation_count: 1,
          completed_count: 1,
          cancelled_count: 0,
          avg_estimated_amount: 100_000,
          min_estimated_amount: 100_000,
          max_estimated_amount: 100_000,
          total_completed_revenue: 100_000,
        },
        {
          period_month: "2026-05-01",
          title: "A",
          reservation_count: 3,
          completed_count: 3,
          cancelled_count: 0,
          avg_estimated_amount: 200_000,
          min_estimated_amount: 200_000,
          max_estimated_amount: 200_000,
          total_completed_revenue: 600_000,
        },
      ],
      error: null,
    });

    const r = await getPricingElasticity({ tenantId: "tenant-1", window: "90d" });

    // Weighted avg = (100k * 1 + 200k * 3) / (1 + 3) = 175k
    expect(r.offerings[0].avg_price_overall).toBeCloseTo(175_000, 0);
  });

  it("returns empty result when RPC returns no rows", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({ data: [], error: null });
    const r = await getPricingElasticity({ tenantId: "tenant-1", window: "365d" });
    expect(r.offerings).toEqual([]);
    expect(r.totals.offering_count).toBe(0);
    expect(r.months.length).toBeGreaterThan(0); // axis still materialized
  });

  it("propagates RPC errors", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({ data: null, error: { message: "bad rpc" } });
    await expect(getPricingElasticity({ tenantId: "tenant-1", window: "90d" })).rejects.toThrow(/bad rpc/);
  });
});
