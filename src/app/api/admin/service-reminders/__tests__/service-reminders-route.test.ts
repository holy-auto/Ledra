/* eslint-disable @typescript-eslint/no-explicit-any */
// 整備提案 (service-reminders) GET/POST/PATCH の検証:
//  - GET: 走行距離ベース / 期間ベースの「期限間近 (due)」「超過 (overdue)」判定
//         vehicle_mileage_logs の最新値とのクロス参照、stats 集計
//  - POST: reminder_type に応じた必須入力バリデーション / RBAC
//  - PATCH: status=completed で completed_at セット、mark_notified で notified_at セット

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCallerWithRole,
  requireMinRole: (caller: { role: string }, minRole: string) => {
    const rank: Record<string, number> = { super_admin: 5, owner: 4, admin: 3, staff: 2, viewer: 1 };
    return (rank[caller.role] ?? 0) >= (rank[minRole] ?? 0);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, POST, PATCH } from "@/app/api/admin/service-reminders/route";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = { userId: "u1", tenantId: TENANT_A, role: "admin", planTier: "pro" };
const VIEWER_A = { userId: "u2", tenantId: TENANT_A, role: "viewer", planTier: "pro" };
const REMINDER_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const VEH_1 = "v1111111-1111-4111-1111-111111111111";

/** 今日からの相対日付 (YYYY-MM-DD)。 */
function dateFromToday(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

type ListResult = { data: unknown; error: unknown };

/**
 * GET 用 admin モック: service_reminders は配列を resolve するため `then` を
 * 実装し、vehicle_mileage_logs は `.in()` 後に配列を resolve する。
 */
function buildGetAdmin(opts: { reminders: any[]; mileageLogs: any[] }) {
  return {
    from(table: string) {
      const builder: any = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        in() {
          // vehicle_mileage_logs: .in(...) 後に await される
          return Promise.resolve({ data: opts.mileageLogs, error: null } as ListResult);
        },
        then(resolve: (v: any) => any, reject?: (e: any) => any) {
          // service_reminders: order().order() 後に await される
          const r: ListResult = { data: opts.reminders, error: null };
          return Promise.resolve(r).then(resolve, reject);
        },
      };
      return builder;
    },
  } as any;
}

/** POST/PATCH 用 admin モック (single-row 経路)。 */
function buildMutAdmin(opts: {
  tables: Record<
    string,
    {
      onSelect?: () => ListResult;
      onInsert?: (rows: any) => ListResult;
      onUpdate?: (patch: any, filters: any) => ListResult;
    }
  >;
  capture?: { inserts?: Record<string, any[]>; updates?: { table: string; patch: any }[] };
}) {
  const inserts = opts.capture?.inserts ?? {};
  const updates = opts.capture?.updates ?? [];
  return {
    from(table: string) {
      const handlers = opts.tables[table];
      const builder: any = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          return handlers?.onSelect?.() ?? { data: null, error: null };
        },
        async single() {
          return handlers?.onSelect?.() ?? { data: null, error: null };
        },
        insert(rows: any) {
          (inserts[table] ??= []).push(rows);
          const ins: any = {
            select() {
              return ins;
            },
            async single() {
              return handlers?.onInsert?.(rows) ?? { data: null, error: null };
            },
            async maybeSingle() {
              return handlers?.onInsert?.(rows) ?? { data: null, error: null };
            },
          };
          return ins;
        },
        update(patch: any) {
          const filters: any = {};
          const upd: any = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return upd;
            },
            select() {
              return upd;
            },
            async maybeSingle() {
              updates.push({ table, patch });
              return handlers?.onUpdate?.(patch, filters) ?? { data: null, error: null };
            },
          };
          return upd;
        },
      };
      return builder;
    },
  } as any;
}

function getReq(qs = "status=active") {
  return new Request(`http://localhost/api/admin/service-reminders?${qs}`) as any;
}
function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/service-reminders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}
function patchReq(body: unknown) {
  return new Request("http://localhost/api/admin/service-reminders", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

describe("GET /api/admin/service-reminders (due computation)", () => {
  it("401 when not authenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("flags due-soon by date (next_due_date within 30 days) and overdue by date (past)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildGetAdmin({
        reminders: [
          {
            id: "r-soon",
            vehicle_id: null,
            reminder_type: "interval_months",
            next_due_mileage: null,
            next_due_date: dateFromToday(10), // 10日後 -> due soon
            status: "active",
          },
          {
            id: "r-overdue",
            vehicle_id: null,
            reminder_type: "interval_months",
            next_due_mileage: null,
            next_due_date: dateFromToday(-5), // 5日前 -> overdue
            status: "active",
          },
          {
            id: "r-far",
            vehicle_id: null,
            reminder_type: "interval_months",
            next_due_mileage: null,
            next_due_date: dateFromToday(120), // 余裕あり
            status: "active",
          },
        ],
        mileageLogs: [],
      }),
    });

    const res = await GET(getReq("status=active"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reminders: Array<{ id: string; is_due_soon: boolean; is_overdue: boolean }>;
      stats: { total: number; due_soon: number; overdue: number };
    };
    const byId = Object.fromEntries(body.reminders.map((r) => [r.id, r]));
    expect(byId["r-soon"].is_due_soon).toBe(true);
    expect(byId["r-soon"].is_overdue).toBe(false);
    expect(byId["r-overdue"].is_overdue).toBe(true);
    expect(byId["r-far"].is_due_soon).toBe(false);
    expect(body.stats).toEqual({ total: 3, due_soon: 1, overdue: 1 });
  });

  it("flags due-soon by mileage using the latest vehicle_mileage_logs value", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildGetAdmin({
        reminders: [
          {
            id: "r-km",
            vehicle_id: VEH_1,
            reminder_type: "mileage",
            next_due_mileage: 40000, // 次回 40,000km
            next_due_date: null,
            status: "active",
          },
        ],
        // 最新走行距離 36,000km -> 残り 4,000km (<=5000) => due soon
        mileageLogs: [
          { vehicle_id: VEH_1, mileage_km: 30000 },
          { vehicle_id: VEH_1, mileage_km: 36000 },
        ],
      }),
    });

    const res = await GET(getReq("status=active"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reminders: Array<{ id: string; km_remaining: number; current_mileage: number; is_due_soon: boolean }>;
    };
    const r = body.reminders[0];
    expect(r.current_mileage).toBe(36000);
    expect(r.km_remaining).toBe(4000);
    expect(r.is_due_soon).toBe(true);
  });

  it("status=due returns only due-soon/overdue rows", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildGetAdmin({
        reminders: [
          {
            id: "r-soon",
            vehicle_id: null,
            reminder_type: "interval_months",
            next_due_mileage: null,
            next_due_date: dateFromToday(5),
            status: "active",
          },
          {
            id: "r-far",
            vehicle_id: null,
            reminder_type: "interval_months",
            next_due_mileage: null,
            next_due_date: dateFromToday(200),
            status: "active",
          },
        ],
        mileageLogs: [],
      }),
    });

    const res = await GET(getReq("status=due"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reminders: Array<{ id: string }> };
    expect(body.reminders.map((r) => r.id)).toEqual(["r-soon"]);
  });
});

describe("POST /api/admin/service-reminders (create)", () => {
  it("403 when caller is below staff", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(VIEWER_A);
    const res = await POST(
      postReq({ service_name: "タイヤ交換", reminder_type: "mileage", recommended_interval_km: 5000 }),
    );
    expect(res.status).toBe(403);
  });

  it("400 when mileage type lacks recommended_interval_km", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const res = await POST(postReq({ service_name: "タイヤ交換", reminder_type: "mileage" }));
    expect(res.status).toBe(400);
  });

  it("creates an active reminder scoped to the caller's tenant", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const inserts: Record<string, any[]> = {};
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildMutAdmin({
        capture: { inserts },
        tables: {
          service_reminders: {
            onInsert: (rows) => ({ data: { id: REMINDER_ID, ...rows }, error: null }),
          },
        },
      }),
    });

    const res = await POST(
      postReq({
        service_name: "コーティング再施工",
        reminder_type: "interval_months",
        recommended_interval_months: 12,
      }),
    );
    expect(res.status).toBe(201);
    const inserted = inserts.service_reminders?.[0];
    expect(inserted.tenant_id).toBe(TENANT_A);
    expect(inserted.status).toBe("active");
    expect(inserted.service_name).toBe("コーティング再施工");
    expect(inserted.recommended_interval_months).toBe(12);
  });
});

describe("PATCH /api/admin/service-reminders (update)", () => {
  it("sets completed_at when status -> completed", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const updates: { table: string; patch: any }[] = [];
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildMutAdmin({
        capture: { updates },
        tables: {
          service_reminders: { onUpdate: (patch) => ({ data: { id: REMINDER_ID, ...patch }, error: null }) },
        },
      }),
    });

    const res = await PATCH(patchReq({ id: REMINDER_ID, status: "completed" }));
    expect(res.status).toBe(200);
    const patch = updates.find((u) => u.table === "service_reminders")?.patch;
    expect(patch.status).toBe("completed");
    expect(typeof patch.completed_at).toBe("string");
  });

  it("sets notified_at when mark_notified is true", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const updates: { table: string; patch: any }[] = [];
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildMutAdmin({
        capture: { updates },
        tables: {
          service_reminders: { onUpdate: (patch) => ({ data: { id: REMINDER_ID, ...patch }, error: null }) },
        },
      }),
    });

    const res = await PATCH(patchReq({ id: REMINDER_ID, mark_notified: true }));
    expect(res.status).toBe(200);
    const patch = updates.find((u) => u.table === "service_reminders")?.patch;
    expect(typeof patch.notified_at).toBe("string");
  });
});
