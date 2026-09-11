import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "../route";

function req(query = "") {
  return new NextRequest(`https://app.example.com/api/mobile/watch/today${query}`, {
    headers: { authorization: "Bearer token" },
  });
}

function queryMock(data: unknown[]) {
  const builder = {
    data,
    error: null,
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  mocks.resolveMobileCaller.mockReset();
});

describe("GET /api/mobile/watch/today", () => {
  it("Bearer認証を必須にする", async () => {
    mocks.resolveMobileCaller.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("不正な日付をDB照会前に拒否する", async () => {
    const from = vi.fn();
    mocks.resolveMobileCaller.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "staff",
      supabase: { from },
    });

    expect((await GET(req("?date=11-09-2026"))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("テナントと店舗で絞り、作業中を先頭にして最小情報だけ返す", async () => {
    const builder = queryMock([
      {
        id: "confirmed-1",
        title: "PPF",
        scheduled_date: "2026-09-11",
        start_time: "09:00:00",
        status: "confirmed",
        workflow_template_id: null,
        current_step_key: null,
        current_step_order: null,
        progress_pct: 0,
        workflow_templates: null,
        reservation_step_logs: [],
        customers: { name: "佐藤" },
        vehicles: { maker: "トヨタ", model: "86", plate_display: "品川 86" },
      },
      {
        id: "active-1",
        title: "磨き",
        scheduled_date: "2026-09-10",
        start_time: "15:00:00",
        status: "in_progress",
        workflow_template_id: null,
        current_step_key: null,
        current_step_order: null,
        progress_pct: 50,
        workflow_templates: null,
        reservation_step_logs: [],
        customers: { name: "田中" },
        vehicles: { maker: "BMW", model: "M3", plate_display: "横浜 330" },
      },
    ]);
    mocks.resolveMobileCaller.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "staff",
      supabase: { from: vi.fn(() => builder) },
    });

    const response = await GET(req("?date=2026-09-11&store_id=store-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.eq).toHaveBeenCalledWith("store_id", "store-1");
    expect(builder.or).toHaveBeenCalledWith("scheduled_date.eq.2026-09-11,status.eq.in_progress");
    expect(body.jobs.map((job: { id: string }) => job.id)).toEqual(["active-1", "confirmed-1"]);
    expect(body.jobs[0]).not.toHaveProperty("customers");
    expect(body.jobs[0]).not.toHaveProperty("tenant_id");
  });
});
