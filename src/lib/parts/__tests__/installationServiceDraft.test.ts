/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 部品交換トグル → 装着記録 (draft → installed) の最小フローを検証する。
 * 実 DB は使わず fakeSupabaseAdmin (既存の parts/ai-automation テストと同方針) で検証する。
 */
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ admin: null as any }));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));

import {
  createDraftPartInstallationForReservation,
  completeDraftPartInstallationsForReservation,
} from "@/lib/parts/installationService";
import { emptyStore, makeFakeAdmin } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const TENANT = "t1";
const RESERVATION = "res1";

describe("createDraftPartInstallationForReservation", () => {
  it("下書きが無ければ status=draft で1件作成する", async () => {
    const store = emptyStore({ part_installations: [] });
    h.admin = makeFakeAdmin(store);

    const result = await createDraftPartInstallationForReservation({
      tenantId: TENANT,
      reservationId: RESERVATION,
      vehicleId: "veh1",
      customerId: "cust1",
      userId: "user1",
      partNameHint: "コーティング施工",
    });

    expect(result.created).toBe(true);
    expect(store.inserts).toHaveLength(1);
    expect(store.inserts[0].payload).toMatchObject({
      tenant_id: TENANT,
      reservation_id: RESERVATION,
      status: "draft",
      part_name: "コーティング施工",
    });
  });

  it("既に未完了の下書きがあれば新規作成しない (冪等)", async () => {
    const store = emptyStore({
      part_installations: [{ id: "existing1", tenant_id: TENANT, reservation_id: RESERVATION, status: "draft" }],
    });
    h.admin = makeFakeAdmin(store);

    const result = await createDraftPartInstallationForReservation({
      tenantId: TENANT,
      reservationId: RESERVATION,
    });

    expect(result).toEqual({ id: "existing1", created: false });
    expect(store.inserts).toHaveLength(0);
  });
});

describe("completeDraftPartInstallationsForReservation", () => {
  it("対象予約の draft を installed に一括遷移する", async () => {
    const store = emptyStore({
      part_installations: [
        { id: "a", tenant_id: TENANT, reservation_id: RESERVATION, status: "draft" },
        { id: "b", tenant_id: TENANT, reservation_id: RESERVATION, status: "installed" }, // 対象外 (既に installed)
        { id: "c", tenant_id: TENANT, reservation_id: "other-res", status: "draft" }, // 対象外 (別予約)
      ],
    });
    h.admin = makeFakeAdmin(store);

    const count = await completeDraftPartInstallationsForReservation(TENANT, RESERVATION);

    expect(count).toBe(1);
    expect(store.tables.part_installations.find((r) => r.id === "a")?.status).toBe("installed");
    expect(store.tables.part_installations.find((r) => r.id === "b")?.status).toBe("installed"); // 元々 installed のまま
    expect(store.tables.part_installations.find((r) => r.id === "c")?.status).toBe("draft"); // 手つかず
  });
});
