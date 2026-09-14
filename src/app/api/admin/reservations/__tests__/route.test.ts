/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// E3-1 回帰確認: 管理側の予約作成・更新に checkOverlap が配線されていること、
// force:true で警告を上書きできることを検証する。

const afterMock = vi.hoisted(() => vi.fn((cb: () => unknown) => cb()));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  requirePermission: vi.fn(() => true),
  enforceBilling: vi.fn(async () => null),
  checkOverlap: vi.fn(async () => [] as unknown[]),
  resolveStoreId: vi.fn(async () => ({ ok: true, storeId: null }) as any),
  syncCreateEvent: vi.fn(async () => {}),
  syncUpdateEvent: vi.fn(async () => {}),
  syncDeleteEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCallerWithRole,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/billing/guard", () => ({ enforceBilling: mocks.enforceBilling }));
vi.mock("@/lib/reservations/overlap", () => ({ checkOverlap: mocks.checkOverlap }));
vi.mock("@/lib/stores/resolveStoreId", () => ({
  resolveStoreId: mocks.resolveStoreId,
  STORE_ERROR_MESSAGES: {
    store_not_in_tenant: "指定された店舗が見つかりません",
    store_lookup_failed: "店舗の確認に失敗しました",
  },
}));
vi.mock("@/lib/gcal/client", () => ({
  syncCreateEvent: mocks.syncCreateEvent,
  syncUpdateEvent: mocks.syncUpdateEvent,
  syncDeleteEvent: mocks.syncDeleteEvent,
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@/lib/ai/automation/certificateAuto", () => ({
  maybeAutoDraftCertificateForReservation: vi.fn(async () => {}),
}));
vi.mock("@/lib/ai/automation/certificateRecordAuto", () => ({
  maybeAutoCreateDraftCertificateForReservation: vi.fn(async () => {}),
}));
vi.mock("@/lib/ai/automation/invoiceRecordAuto", () => ({
  maybeAutoCreateDraftInvoiceForReservation: vi.fn(async () => {}),
}));
vi.mock("@/lib/ai/automation/accountingAuto", () => ({
  maybeAutoCategorizeReservationOnIntake: vi.fn(async () => {}),
}));
vi.mock("@/lib/ai/automation/workflowAuto", () => ({ maybeAutoProposeWorkflowForReservation: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/automation/assigneeAuto", () => ({ maybeAutoSuggestAssigneeForReservation: vi.fn(async () => {}) }));
vi.mock("@/lib/parts/installationService", () => ({
  createDraftPartInstallationForReservation: vi.fn(async () => {}),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const RES_ID = "22222222-2222-4222-8222-222222222222";
const CALLER = { userId: "u1", tenantId: TENANT_ID, role: "admin", planTier: "pro" };

// insert/select/update に対して呼び出し順で応答を返す最小限のチェーン可能モック。
function buildSupabase(opts: {
  insertResult?: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
  currentSchedule?: { data: unknown; error: unknown };
}) {
  return {
    from() {
      const chain: any = {
        insert() {
          return chain;
        },
        update() {
          return chain;
        },
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          return opts.currentSchedule ?? { data: null, error: null };
        },
        async single() {
          if (opts.updateResult) return opts.updateResult;
          return opts.insertResult ?? { data: null, error: null };
        },
      };
      return chain;
    },
  } as any;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: vi.fn(() => ({ admin: buildSupabase({}) })),
}));

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { POST, PUT } from "@/app/api/admin/reservations/route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/reservations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as any;
}
function putReq(body: unknown) {
  return new Request("http://localhost/api/admin/reservations", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as any;
}

const baseCreateBody = {
  title: "オイル交換",
  scheduled_date: "2026-09-10",
  start_time: "10:00",
  end_time: "11:00",
};

describe("POST /api/admin/reservations — E3-1 重複チェック", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCallerWithRole.mockResolvedValue(CALLER);
    mocks.requirePermission.mockReturnValue(true);
    mocks.enforceBilling.mockResolvedValue(null);
    mocks.resolveStoreId.mockResolvedValue({ ok: true, storeId: null });
    (createSupabaseServerClient as any).mockResolvedValue(
      buildSupabase({ insertResult: { data: { id: RES_ID, title: "オイル交換" }, error: null } }),
    );
  });

  it("重複する予約があれば 409 を返し、insert しない", async () => {
    mocks.checkOverlap.mockResolvedValueOnce([
      { overlapping_id: "x", overlapping_title: "既存予約", overlapping_start: "10:00", overlapping_end: "11:00" },
    ]);
    const res = await POST(postReq(baseCreateBody));
    expect(res.status).toBe(409);
    expect(mocks.checkOverlap).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        scheduledDate: "2026-09-10",
        startTime: "10:00:00",
        endTime: "11:00:00",
      }),
    );
  });

  it("重複が無ければ作成できる", async () => {
    mocks.checkOverlap.mockResolvedValueOnce([]);
    const res = await POST(postReq(baseCreateBody));
    expect(res.status).toBe(200);
  });

  it("force:true なら重複があっても作成できる（checkOverlap は呼ばれない）", async () => {
    const res = await POST(postReq({ ...baseCreateBody, force: true }));
    expect(res.status).toBe(200);
    expect(mocks.checkOverlap).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/reservations — E3-1 重複チェック", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCallerWithRole.mockResolvedValue(CALLER);
    mocks.requirePermission.mockReturnValue(true);
    mocks.enforceBilling.mockResolvedValue(null);
  });

  it("日時変更で重複していれば 409 を返し、update しない", async () => {
    (createSupabaseServerClient as any).mockResolvedValue(
      buildSupabase({
        currentSchedule: {
          data: {
            scheduled_date: "2026-09-10",
            start_time: "09:00",
            end_time: "10:00",
            all_day: false,
            assigned_user_id: null,
          },
          error: null,
        },
        updateResult: { data: { id: RES_ID, status: "confirmed" }, error: null },
      }),
    );
    mocks.checkOverlap.mockResolvedValueOnce([
      { overlapping_id: "x", overlapping_title: "既存予約", overlapping_start: "10:00", overlapping_end: "11:00" },
    ]);
    const res = await PUT(putReq({ id: RES_ID, start_time: "10:00", end_time: "11:00" }));
    expect(res.status).toBe(409);
    expect(mocks.checkOverlap).toHaveBeenCalledWith(expect.objectContaining({ excludeId: RES_ID }));
  });

  it("日時と無関係な更新では checkOverlap を呼ばない", async () => {
    (createSupabaseServerClient as any).mockResolvedValue(
      buildSupabase({
        updateResult: { data: { id: RES_ID, status: "confirmed" }, error: null },
      }),
    );
    const res = await PUT(putReq({ id: RES_ID, note: "メモ更新" }));
    expect(res.status).toBe(200);
    expect(mocks.checkOverlap).not.toHaveBeenCalled();
  });

  it("force:true なら日時変更で重複があっても更新できる", async () => {
    (createSupabaseServerClient as any).mockResolvedValue(
      buildSupabase({
        updateResult: { data: { id: RES_ID, status: "confirmed" }, error: null },
      }),
    );
    const res = await PUT(putReq({ id: RES_ID, start_time: "10:00", end_time: "11:00", force: true }));
    expect(res.status).toBe(200);
    expect(mocks.checkOverlap).not.toHaveBeenCalled();
  });
});
