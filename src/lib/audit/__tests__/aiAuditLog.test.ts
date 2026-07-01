/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const h = vi.hoisted(() => ({ admin: null as any }));

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));

import { logAutoActionExecuted } from "../aiAuditLog";

let store: FakeStore;
beforeEach(() => {
  store = emptyStore();
  h.admin = makeFakeAdmin(store);
});

describe("logAutoActionExecuted", () => {
  it("vehicle_histories に ai_auto_action_executed 行を書き、detail に action_key/resource を含める", async () => {
    await logAutoActionExecuted({
      tenantId: "t1",
      actionKey: "inbound_message.auto_create_reservation",
      resource: { kind: "reservation", id: "r1" },
      detail: { channel: "line", confidence: 0.8 },
    });

    const insert = store.inserts.find((i) => i.table === "vehicle_histories");
    expect(insert).toBeDefined();
    expect(insert!.payload.type).toBe("ai_auto_action_executed");
    expect(insert!.payload.tenant_id).toBe("t1");
    expect(insert!.payload.vehicle_id).toBeNull();

    const parsed = JSON.parse(insert!.payload.description);
    expect(parsed.user_id).toBeNull(); // 自動実行 = 人ではない
    expect(parsed.resource).toEqual({ kind: "reservation", id: "r1" });
    expect(parsed.detail.action_key).toBe("inbound_message.auto_create_reservation");
    expect(parsed.detail.channel).toBe("line");
    expect(parsed.detail.confidence).toBe(0.8);
  });

  it("tenantId が空なら何も書き込まない", async () => {
    await logAutoActionExecuted({ tenantId: "", actionKey: "customer.auto_create" });
    expect(store.inserts.length).toBe(0);
  });
});
