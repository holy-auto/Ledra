import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  notifyStaffOfAiAction: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/ai/automation/policy", () => ({ notifyStaffOfAiAction: mocks.notifyStaffOfAiAction }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { processUnansweredThreadAlerts } from "../unansweredAlerts";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const NOW = new Date("2026-08-30T12:00:00Z");
// minAge cutoff = NOW - 8h = 04:00Z
const STALE = "2026-08-30T02:00:00Z"; // 10h前 → 未返信対象
const RECENT = "2026-08-30T10:00:00Z"; // 2h前 → 猶予内（8h未満）

const admin = () => makeFakeAdmin(mocks.store);
const run = () => processUnansweredThreadAlerts(admin(), { tenantId: TENANT, now: NOW });

function seed(
  messages: Array<Record<string, unknown>> = [],
  opts: { customers?: Array<Record<string, unknown>>; logs?: Array<Record<string, unknown>> } = {},
) {
  mocks.store = emptyStore({
    customer_messages: messages.map((m) => ({ tenant_id: TENANT, channel: "line", ...m })),
    customers: opts.customers ?? [{ id: CUSTOMER, tenant_id: TENANT, name: "堀越様" }],
    notification_logs: opts.logs ?? [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyStaffOfAiAction.mockResolvedValue(true);
  seed();
});

describe("processUnansweredThreadAlerts", () => {
  it("alerts a thread whose latest message is a stale inbound, and logs it (dedup)", async () => {
    seed([{ id: "m1", customer_id: CUSTOMER, direction: "inbound", created_at: STALE }]);
    const sent = await run();
    expect(sent).toBe(1);
    expect(mocks.notifyStaffOfAiAction).toHaveBeenCalledTimes(1);
    const [, , title, body] = mocks.notifyStaffOfAiAction.mock.calls[0];
    expect(title).toContain("未返信");
    expect(body).toContain("堀越様");
    const log = mocks.store.inserts.find((i) => i.table === "notification_logs");
    expect(log?.payload).toMatchObject({ type: "unanswered_alert", target_id: "m1", channel: "line" });
  });

  it("does not alert when the latest message is a staff/bot reply (outbound)", async () => {
    seed([
      { id: "m1", customer_id: CUSTOMER, direction: "inbound", created_at: STALE },
      { id: "m2", customer_id: CUSTOMER, direction: "outbound", created_at: "2026-08-30T10:30:00Z" },
    ]);
    expect(await run()).toBe(0);
    expect(mocks.notifyStaffOfAiAction).not.toHaveBeenCalled();
  });

  it("does not alert when the latest inbound is within the grace window", async () => {
    seed([{ id: "m1", customer_id: CUSTOMER, direction: "inbound", created_at: RECENT }]);
    expect(await run()).toBe(0);
    expect(mocks.notifyStaffOfAiAction).not.toHaveBeenCalled();
  });

  it("skips a message already alerted (notification_logs dedup)", async () => {
    seed([{ id: "m1", customer_id: CUSTOMER, direction: "inbound", created_at: STALE }], {
      logs: [{ tenant_id: TENANT, type: "unanswered_alert", target_id: "m1" }],
    });
    expect(await run()).toBe(0);
    expect(mocks.notifyStaffOfAiAction).not.toHaveBeenCalled();
  });

  it("does not write a dedup log when the staff notification could not be created (so it retries next run)", async () => {
    mocks.notifyStaffOfAiAction.mockResolvedValue(false);
    seed([{ id: "m1", customer_id: CUSTOMER, direction: "inbound", created_at: STALE }]);
    expect(await run()).toBe(0);
    expect(mocks.store.inserts.find((i) => i.table === "notification_logs")).toBeUndefined();
  });

  it("labels an unlinked thread as 未登録のお客様", async () => {
    seed([{ id: "m1", customer_id: null, line_user_id: "Uabc", direction: "inbound", created_at: STALE }], {
      customers: [],
    });
    expect(await run()).toBe(1);
    expect(mocks.notifyStaffOfAiAction.mock.calls[0][3]).toContain("未登録のお客様");
  });
});
