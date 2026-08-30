import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  sendCustomerLineButtons: vi.fn(),
  sendCustomerLineText: vi.fn(),
  shouldAutoSelfCancel: vi.fn(),
  shouldAutoSelfReschedule: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/line/client", () => ({
  sendCustomerLineButtons: mocks.sendCustomerLineButtons,
  sendCustomerLineText: mocks.sendCustomerLineText,
}));
vi.mock("@/lib/ai/automation/orchestrator", () => ({
  shouldAutoSelfCancel: mocks.shouldAutoSelfCancel,
  shouldAutoSelfReschedule: mocks.shouldAutoSelfReschedule,
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { processDayBeforeReminders } from "../reservationReminders";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";
const TARGET = "2026-09-02"; // 翌日

const admin = () => makeFakeAdmin(mocks.store);
const run = () => processDayBeforeReminders(admin(), { tenantId: TENANT, settings: {} as never, targetDate: TARGET });

function seed(opts: {
  reservations?: Array<Record<string, unknown>>;
  customers?: Array<Record<string, unknown>>;
  logs?: Array<Record<string, unknown>>;
}) {
  mocks.store = emptyStore({
    reservations: opts.reservations ?? [],
    customers: opts.customers ?? [],
    notification_logs: opts.logs ?? [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendCustomerLineButtons.mockResolvedValue(true);
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.shouldAutoSelfCancel.mockReturnValue(true);
  mocks.shouldAutoSelfReschedule.mockReturnValue(true);
  seed({});
});

const RESV = {
  id: "r-1",
  tenant_id: TENANT,
  customer_id: CUSTOMER,
  scheduled_date: TARGET,
  start_time: "10:00:00",
  title: "コーティング",
  status: "confirmed",
};
const LINKED_CUSTOMER = { id: CUSTOMER, tenant_id: TENANT, line_user_id: LINE_USER, followup_opt_out: false };

describe("processDayBeforeReminders", () => {
  it("sends a reminder with both self-serve buttons and logs it (both opt-ins on)", async () => {
    seed({ reservations: [RESV], customers: [LINKED_CUSTOMER] });
    const sent = await run();
    expect(sent).toBe(1);
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
    const arg = mocks.sendCustomerLineButtons.mock.calls[0][0];
    expect(arg.buttons.map((b: { data: string }) => b.data)).toEqual(["flow:start_reschedule", "flow:start_cancel"]);
    const log = mocks.store.inserts.find((i) => i.table === "notification_logs");
    expect(log?.payload).toMatchObject({
      type: "reservation_reminder",
      target_id: "r-1",
      channel: "line",
      status: "sent",
    });
  });

  it("sends a text-only reminder (no buttons) when both self-serve opt-ins are off", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(false);
    mocks.shouldAutoSelfReschedule.mockReturnValue(false);
    seed({ reservations: [RESV], customers: [LINKED_CUSTOMER] });
    const sent = await run();
    expect(sent).toBe(1);
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
  });

  it("skips a reservation already reminded (notification_logs dedup)", async () => {
    seed({
      reservations: [RESV],
      customers: [LINKED_CUSTOMER],
      logs: [{ tenant_id: TENANT, type: "reservation_reminder", target_id: "r-1", status: "sent" }],
    });
    const sent = await run();
    expect(sent).toBe(0);
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("skips a customer with no LINE link (reminder is button/LINE-only)", async () => {
    seed({
      reservations: [RESV],
      customers: [{ id: CUSTOMER, tenant_id: TENANT, line_user_id: null, followup_opt_out: false }],
    });
    expect(await run()).toBe(0);
    expect(mocks.store.inserts.find((i) => i.table === "notification_logs")).toBeUndefined();
  });

  it("skips a customer who opted out of follow-ups", async () => {
    seed({ reservations: [RESV], customers: [{ ...LINKED_CUSTOMER, followup_opt_out: true }] });
    expect(await run()).toBe(0);
  });

  it("does not remind cancelled/completed reservations on the target date", async () => {
    seed({
      reservations: [
        { ...RESV, id: "r-cancel", status: "cancelled" },
        { ...RESV, id: "r-done", status: "completed" },
      ],
      customers: [LINKED_CUSTOMER],
    });
    expect(await run()).toBe(0);
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
  });

  it("logs status=failed when LINE delivery fails (still deduped so it is not retried next run)", async () => {
    mocks.sendCustomerLineButtons.mockResolvedValue(false);
    seed({ reservations: [RESV], customers: [LINKED_CUSTOMER] });
    const sent = await run();
    expect(sent).toBe(0);
    const log = mocks.store.inserts.find((i) => i.table === "notification_logs");
    expect(log?.payload.status).toBe("failed");
  });
});
