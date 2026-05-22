import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

const mockAdmin = {
  rpc: vi.fn(),
  auth: {
    admin: {
      listUsers: vi.fn(),
    },
  },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: mockAdmin, tenantId: "tenant-1" }),
}));

import { authenticityGradeLabel, getStaffPerformance, windowToSince } from "@/lib/analytics/staff";

describe("windowToSince", () => {
  it("returns null for 'all'", () => {
    expect(windowToSince("all")).toBeNull();
  });
  it("returns ~30 days back for '30d'", () => {
    const d = windowToSince("30d");
    expect(d).not.toBeNull();
    const diffDays = (Date.now() - d!.getTime()) / 86_400_000;
    expect(diffDays).toBeGreaterThan(29.9);
    expect(diffDays).toBeLessThan(30.1);
  });
});

describe("authenticityGradeLabel", () => {
  it("returns '—' for null", () => {
    expect(authenticityGradeLabel(null)).toBe("—");
  });
  it("buckets numeric grade correctly", () => {
    expect(authenticityGradeLabel(0)).toBe("未認証");
    expect(authenticityGradeLabel(0.4)).toBe("未認証");
    expect(authenticityGradeLabel(0.5)).toBe("基本");
    expect(authenticityGradeLabel(1.5)).toBe("認証済み");
    expect(authenticityGradeLabel(2.5)).toBe("プレミアム");
    expect(authenticityGradeLabel(3)).toBe("プレミアム");
  });
});

describe("getStaffPerformance", () => {
  beforeEach(() => {
    mockAdmin.rpc.mockReset();
    mockAdmin.auth.admin.listUsers.mockReset();
    mockAdmin.from.mockReset();
  });

  function setupQuery(memberships: Array<{ user_id: string; role: string }>) {
    mockAdmin.from.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: memberships, error: null }),
      }),
    });
  }

  it("enriches RPC rows with user info and computes derived rates", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({
      data: [
        {
          user_id: "u1",
          cert_count: 10,
          cert_anchored_count: 8,
          avg_authenticity_grade: 2.5,
          review_count: 4,
          avg_review_rating: 4.5,
          reservations_completed: 6,
          reservations_cancelled: 2,
          avg_work_minutes: 75,
          distinct_customers: 7,
          returning_customers: 3,
        },
      ],
      error: null,
    });
    mockAdmin.auth.admin.listUsers.mockResolvedValueOnce({
      data: {
        users: [{ id: "u1", email: "u1@example.com", user_metadata: { display_name: "山田 太郎" } }],
      },
    });
    setupQuery([{ user_id: "u1", role: "admin" }]);

    const result = await getStaffPerformance({ tenantId: "tenant-1", window: "30d" });

    expect(result.staff).toHaveLength(1);
    const s = result.staff[0];
    expect(s.email).toBe("u1@example.com");
    expect(s.display_name).toBe("山田 太郎");
    expect(s.role).toBe("admin");
    expect(s.anchor_rate).toBeCloseTo(0.8, 4);
    expect(s.reservation_close_rate).toBeCloseTo(0.75, 4);
    expect(s.repeat_rate).toBeCloseTo(3 / 7, 4);
    expect(result.totals.staff_with_activity).toBe(1);
    expect(result.totals.total_cert_count).toBe(10);
  });

  it("handles staff with no certs (only reservations or reviews)", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({
      data: [
        {
          user_id: "u2",
          cert_count: 0,
          cert_anchored_count: 0,
          avg_authenticity_grade: null,
          review_count: 0,
          avg_review_rating: null,
          reservations_completed: 0,
          reservations_cancelled: 5,
          avg_work_minutes: null,
          distinct_customers: 0,
          returning_customers: 0,
        },
      ],
      error: null,
    });
    mockAdmin.auth.admin.listUsers.mockResolvedValueOnce({ data: { users: [] } });
    setupQuery([]);

    const result = await getStaffPerformance({ tenantId: "tenant-1", window: "all" });
    expect(result.staff[0].anchor_rate).toBeNull();
    expect(result.staff[0].reservation_close_rate).toBeCloseTo(0, 4); // 0 / (0+5)
    expect(result.staff[0].repeat_rate).toBeNull();
  });

  it("parses bigint-as-string returned by some PG drivers", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({
      data: [
        {
          user_id: "u3",
          cert_count: "12",
          cert_anchored_count: "10",
          avg_authenticity_grade: 1.8,
          review_count: "0",
          avg_review_rating: null,
          reservations_completed: "3",
          reservations_cancelled: "1",
          avg_work_minutes: 60,
          distinct_customers: "5",
          returning_customers: "2",
        },
      ],
      error: null,
    });
    mockAdmin.auth.admin.listUsers.mockResolvedValueOnce({ data: { users: [] } });
    setupQuery([]);

    const result = await getStaffPerformance({ tenantId: "tenant-1", window: "365d" });
    const s = result.staff[0];
    expect(s.cert_count).toBe(12);
    expect(s.anchor_rate).toBeCloseTo(10 / 12, 4);
    expect(s.reservation_close_rate).toBeCloseTo(0.75, 4);
  });

  it("sorts staff by cert_count descending", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({
      data: [
        {
          user_id: "u-low",
          cert_count: 3,
          cert_anchored_count: 0,
          avg_authenticity_grade: null,
          review_count: 0,
          avg_review_rating: null,
          reservations_completed: 0,
          reservations_cancelled: 0,
          avg_work_minutes: null,
          distinct_customers: 0,
          returning_customers: 0,
        },
        {
          user_id: "u-high",
          cert_count: 20,
          cert_anchored_count: 0,
          avg_authenticity_grade: null,
          review_count: 0,
          avg_review_rating: null,
          reservations_completed: 0,
          reservations_cancelled: 0,
          avg_work_minutes: null,
          distinct_customers: 0,
          returning_customers: 0,
        },
      ],
      error: null,
    });
    mockAdmin.auth.admin.listUsers.mockResolvedValueOnce({ data: { users: [] } });
    setupQuery([]);

    const result = await getStaffPerformance({ tenantId: "tenant-1", window: "all" });
    expect(result.staff.map((s) => s.user_id)).toEqual(["u-high", "u-low"]);
  });

  it("propagates RPC errors", async () => {
    mockAdmin.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(getStaffPerformance({ tenantId: "tenant-1", window: "30d" })).rejects.toThrow(/boom/);
  });
});
