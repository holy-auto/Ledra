/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ admin: null as any, settings: null as any }));
const genMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => h.admin,
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: vi.fn() }) }));
vi.mock("@/lib/ai/jobNextAction", () => ({ generateJobNextAction: (...a: any[]) => genMock(...a) }));
vi.mock("../policy", async (orig) => {
  const actual = await orig<typeof import("../policy")>();
  return { ...actual, loadAiAutomationSettings: async () => h.settings };
});

import { maybeAutoNextActionForReservation } from "../nextActionAuto";
import { DEFAULT_AI_AUTOMATION_SETTINGS } from "../policy";
import { emptyStore, makeFakeAdmin } from "./fakeSupabaseAdmin";

const TENANT = "t1";
const RES = "res1";

const settings = (autoActions: Record<string, boolean>, enabled = true) => ({
  ...DEFAULT_AI_AUTOMATION_SETTINGS,
  enabled,
  autoActions,
});

const baseStore = () =>
  emptyStore({
    tenants: [{ id: TENANT, is_active: true, plan_tier: "standard" }],
    reservations: [
      {
        id: RES,
        tenant_id: TENANT,
        status: "completed",
        customer_id: null,
        vehicle_id: null,
        start_time: null,
        end_time: null,
        updated_at: new Date().toISOString(),
        work_started_at: null,
        work_completed_at: null,
      },
    ],
  });

describe("maybeAutoNextActionForReservation (#5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    genMock.mockResolvedValue({
      action: "issue_certificate",
      message: "証明書を発行してください。",
      priority: "med",
      ai: true,
    });
  });

  it("opt-in OFF: 提案しない", async () => {
    h.settings = settings({});
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoNextActionForReservation({ tenantId: TENANT, reservationId: RES });
    expect(genMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it("opt-in ON: reservations.ai_next_action を source=auto で保存", async () => {
    h.settings = settings({ "job.auto_next_action": true });
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoNextActionForReservation({ tenantId: TENANT, reservationId: RES });
    expect(genMock).toHaveBeenCalledTimes(1);
    const upd = store.updates.find((u) => u.table === "reservations");
    expect(upd?.payload.ai_next_action.source).toBe("auto");
    expect(upd?.payload.ai_next_action.action).toBe("issue_certificate");
  });
});
