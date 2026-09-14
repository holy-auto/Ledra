import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// E4-3 回帰確認: 過去日チェックが JST 基準で行われることを検証する。
// admin 生成やテナント解決はこのチェックの後段なので、ここでは呼ばれない前提でモックする。
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: vi.fn(() => {
    throw new Error("admin should not be created before the past-date check");
  }),
}));
vi.mock("@/lib/reservations/overlap", () => ({ checkOverlap: vi.fn() }));
vi.mock("@/lib/gcal/client", () => ({ syncCreateEvent: vi.fn() }));
vi.mock("@/lib/line/client", () => ({ sendBookingConfirmation: vi.fn() }));
vi.mock("@/lib/notifications/bookingNotify", () => ({ notifyNewBooking: vi.fn() }));
vi.mock("@/lib/identity/intakeServer", () => ({ createIntakeInvitation: vi.fn() }));
vi.mock("@/lib/stores/resolveStoreId", () => ({ storeIdOrNull: vi.fn() }));

function postReq(body: unknown) {
  return new NextRequest("https://ledra.example/api/customer/booking", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const baseBody = {
  tenant_slug: "demo",
  customer_name: "山田太郎",
  scheduled_date: "2026-01-01",
  start_time: "10:00",
  end_time: "11:00",
};

describe("POST /api/customer/booking — E4-3 過去日チェック (JST)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("JST では今日でも UTC 表記でまだ前日 (JST 00:30 = UTC 前日15:30) なら当日予約を拒否しない", async () => {
    // 2026-01-02 00:30 JST = 2026-01-01 15:30 UTC。旧実装は `new Date()`（UTC 基準）で
    // 「今日」を 2026-01-01 と誤判定し、本来当日である 2026-01-02 の予約すら
    // 日付比較のブレを起こしていた。ここでは「JST 今日」の予約が拒否されないことを確認する。
    vi.setSystemTime(new Date("2026-01-01T15:30:00.000Z"));
    const { POST } = await import("../route");
    const res = await POST(postReq({ ...baseBody, scheduled_date: "2026-01-02" }));
    // admin モックが例外を投げるのでここに到達するのは過去日チェックを通過した場合のみ。
    expect(res.status).toBe(500);
  });

  it("JST の前日は UTC 日付が同じでも過去日として拒否する", async () => {
    // 2026-01-02 08:00 JST = 2026-01-01 23:00 UTC。旧実装（サーバ UTC 基準）だと
    // `new Date()` の日付は 2026-01-01 になり、JST の前日である 2026-01-01 の予約を
    // 「今日以降」として通してしまっていた。
    vi.setSystemTime(new Date("2026-01-01T23:00:00.000Z"));
    const { POST } = await import("../route");
    const res = await POST(postReq({ ...baseBody, scheduled_date: "2026-01-01" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message ?? json.error).toContain("過去の日付には予約できません");
  });
});
