import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  sendCustomerLineText: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: mocks.sendCustomerLineText }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { processStalledFlowNudges } from "../flowNudges";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";
const NOW = new Date("2026-08-30T12:00:00Z");
// cutoff = NOW - 24h = 2026-08-29T12:00:00Z
const STALE = "2026-08-28T00:00:00Z"; // < cutoff → 停滞
const FRESH = "2026-08-30T06:00:00Z"; // > cutoff → まだ新しい
const FUTURE = "2026-08-31T00:00:00Z"; // expires_at 未来 → 未失効
const PAST = "2026-08-30T06:00:00Z"; // expires_at 過去 → 失効済

const admin = () => makeFakeAdmin(mocks.store);
const run = () => processStalledFlowNudges(admin(), { tenantId: TENANT, now: NOW });

function seed(opts: {
  flows?: Array<Record<string, unknown>>;
  customers?: Array<Record<string, unknown>>;
  logs?: Array<Record<string, unknown>>;
}) {
  mocks.store = emptyStore({
    line_conversation_flows: opts.flows ?? [],
    customers: opts.customers ?? [],
    notification_logs: opts.logs ?? [],
  });
}

const STALLED_FLOW = {
  id: "flow-1",
  tenant_id: TENANT,
  customer_id: CUSTOMER,
  line_user_id: LINE_USER,
  state: "awaiting_quote_detail",
  updated_at: STALE,
  expires_at: FUTURE,
};
const LINKED_CUSTOMER = { id: CUSTOMER, tenant_id: TENANT, followup_opt_out: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendCustomerLineText.mockResolvedValue(true);
  seed({});
});

describe("processStalledFlowNudges", () => {
  it("nudges a stalled awaiting_quote_detail flow and logs it", async () => {
    seed({ flows: [STALLED_FLOW], customers: [LINKED_CUSTOMER] });
    const sent = await run();
    expect(sent).toBe(1);
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    const arg = mocks.sendCustomerLineText.mock.calls[0][0];
    expect(arg).toMatchObject({ tenantId: TENANT, customerId: CUSTOMER, lineUserId: LINE_USER });
    const log = mocks.store.inserts.find((i) => i.table === "notification_logs");
    expect(log?.payload).toMatchObject({
      type: "flow_nudge",
      target_type: "conversation_flow",
      target_id: "flow-1",
      channel: "line",
      status: "sent",
    });
  });

  it("does not nudge a flow that is still fresh (updated within the window)", async () => {
    seed({ flows: [{ ...STALLED_FLOW, updated_at: FRESH }], customers: [LINKED_CUSTOMER] });
    expect(await run()).toBe(0);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does not nudge an already-expired flow", async () => {
    seed({ flows: [{ ...STALLED_FLOW, expires_at: PAST }], customers: [LINKED_CUSTOMER] });
    expect(await run()).toBe(0);
    expect(mocks.store.inserts.find((i) => i.table === "notification_logs")).toBeUndefined();
  });

  it("skips a flow already nudged (notification_logs dedup)", async () => {
    seed({
      flows: [STALLED_FLOW],
      customers: [LINKED_CUSTOMER],
      logs: [{ tenant_id: TENANT, type: "flow_nudge", target_id: "flow-1", status: "sent" }],
    });
    expect(await run()).toBe(0);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("skips a flow with no LINE link (push-only nudge)", async () => {
    seed({ flows: [{ ...STALLED_FLOW, line_user_id: null }], customers: [LINKED_CUSTOMER] });
    expect(await run()).toBe(0);
  });

  it("skips a customer who opted out of follow-ups", async () => {
    seed({ flows: [STALLED_FLOW], customers: [{ ...LINKED_CUSTOMER, followup_opt_out: true }] });
    expect(await run()).toBe(0);
  });

  it("still nudges an unlinked flow (customer_id null) — an active lead", async () => {
    seed({ flows: [{ ...STALLED_FLOW, customer_id: null }] });
    expect(await run()).toBe(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].customerId).toBeNull();
  });

  it("logs status=failed when LINE delivery fails (deduped, not retried next run)", async () => {
    mocks.sendCustomerLineText.mockResolvedValue(false);
    seed({ flows: [STALLED_FLOW], customers: [LINKED_CUSTOMER] });
    expect(await run()).toBe(0);
    const log = mocks.store.inserts.find((i) => i.table === "notification_logs");
    expect(log?.payload.status).toBe("failed");
  });
});
