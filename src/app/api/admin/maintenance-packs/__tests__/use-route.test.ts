/* eslint-disable @typescript-eslint/no-explicit-any */
// Polymorphic supabase query-builder mock; the chained shape demands `any`
// in a few helper signatures. Production error paths stay strict-typed.

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

import { POST } from "@/app/api/admin/maintenance-packs/[id]/use/route";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = { userId: "u1", tenantId: TENANT_A, role: "admin", planTier: "pro" };
const VIEWER_A = { userId: "u2", tenantId: TENANT_A, role: "viewer", planTier: "pro" };
const PACK_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

type TableHandlers = {
  onSelect?: (filters: Record<string, unknown>) => { data: unknown; error: unknown };
  onUpdate?: (patch: Record<string, unknown>, filters: Record<string, unknown>) => { data: unknown; error: unknown };
  onInsert?: (rows: unknown) => { data: unknown; error: unknown };
};

function buildAdmin(opts: {
  tables: Record<string, TableHandlers>;
  recordUpdates?: { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }[];
}) {
  const recordUpdates = opts.recordUpdates ?? [];
  return {
    from(table: string) {
      const handlers = opts.tables[table];
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        order() {
          return builder;
        },
        async maybeSingle() {
          const r = handlers?.onSelect?.(filters) ?? { data: null, error: null };
          return { data: r.data, error: r.error };
        },
        async single() {
          const r = handlers?.onSelect?.(filters) ?? { data: null, error: null };
          return { data: r.data, error: r.error };
        },
        insert(rows: unknown) {
          const insBuilder: any = {
            select() {
              return insBuilder;
            },
            async single() {
              const r = handlers?.onInsert?.(rows) ?? { data: null, error: null };
              return { data: r.data, error: r.error };
            },
            async maybeSingle() {
              const r = handlers?.onInsert?.(rows) ?? { data: null, error: null };
              return { data: r.data, error: r.error };
            },
          };
          return insBuilder;
        },
        update(patch: Record<string, unknown>) {
          const updFilters: Record<string, unknown> = {};
          const updBuilder: any = {
            eq(col: string, val: unknown) {
              updFilters[col] = val;
              return updBuilder;
            },
            select() {
              return updBuilder;
            },
            async maybeSingle() {
              recordUpdates.push({ table, patch, filters: { ...updFilters } });
              const r = handlers?.onUpdate?.(patch, { ...updFilters }) ?? { data: null, error: null };
              return { data: r.data, error: r.error };
            },
            then(resolve: (v: any) => any, reject?: (e: any) => any) {
              try {
                recordUpdates.push({ table, patch, filters: { ...updFilters } });
                const r = handlers?.onUpdate?.(patch, { ...updFilters }) ?? { data: null, error: null };
                return Promise.resolve(r).then(resolve, reject);
              } catch (e) {
                return reject ? reject(e) : Promise.reject(e);
              }
            },
          };
          return updBuilder;
        },
      };
      return builder;
    },
  } as any;
}

function makeReq(body: unknown = {}) {
  return new Request(`http://localhost/api/admin/maintenance-packs/${PACK_ID}/use`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

const ctx = { params: Promise.resolve({ id: PACK_ID }) };

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

describe("POST /api/admin/maintenance-packs/[id]/use", () => {
  it("401 when not authenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(401);
  });

  it("403 when caller is below staff", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(VIEWER_A);
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(403);
  });

  it("404 when the pack belongs to another tenant (scoped read returns null)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          maintenance_packs: { onSelect: () => ({ data: null, error: null }) },
        },
      }),
    });
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(404);
  });

  it("consumes one ticket and stays active when not yet exhausted", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const recordUpdates: { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        recordUpdates,
        tables: {
          maintenance_packs: {
            onSelect: () => ({
              data: { id: PACK_ID, status: "active", total_tickets: 5, used_tickets: 2 },
              error: null,
            }),
            onUpdate: (patch) => ({
              data: { id: PACK_ID, total_tickets: 5, used_tickets: patch.used_tickets, status: patch.status },
              error: null,
            }),
          },
          maintenance_pack_usages: {
            onInsert: () => ({ data: { id: "use-1", pack_id: PACK_ID, used_at: "now" }, error: null }),
          },
        },
      }),
    });

    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pack: { used_tickets: number; status: string }; remaining: number };
    expect(body.pack.used_tickets).toBe(3);
    expect(body.pack.status).toBe("active");
    expect(body.remaining).toBe(2);

    // compare-and-set: update guarded by previous used_tickets value + tenant scope
    const upd = recordUpdates.find((u) => u.table === "maintenance_packs");
    expect(upd?.patch.used_tickets).toBe(3);
    expect(upd?.filters.tenant_id).toBe(TENANT_A);
    expect(upd?.filters.used_tickets).toBe(2);
  });

  it("transitions to exhausted when consuming the last ticket", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          maintenance_packs: {
            onSelect: () => ({
              data: { id: PACK_ID, status: "active", total_tickets: 3, used_tickets: 2 },
              error: null,
            }),
            onUpdate: (patch) => ({
              data: { id: PACK_ID, total_tickets: 3, used_tickets: patch.used_tickets, status: patch.status },
              error: null,
            }),
          },
          maintenance_pack_usages: { onInsert: () => ({ data: { id: "use-2" }, error: null }) },
        },
      }),
    });

    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pack: { status: string }; remaining: number };
    expect(body.pack.status).toBe("exhausted");
    expect(body.remaining).toBe(0);
  });

  it("400 when the pack is already exhausted", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          maintenance_packs: {
            onSelect: () => ({
              data: { id: PACK_ID, status: "exhausted", total_tickets: 3, used_tickets: 3 },
              error: null,
            }),
          },
        },
      }),
    });
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(400);
  });

  it("400 when the pack is cancelled", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          maintenance_packs: {
            onSelect: () => ({
              data: { id: PACK_ID, status: "cancelled", total_tickets: 5, used_tickets: 1 },
              error: null,
            }),
          },
        },
      }),
    });
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(400);
  });

  it("409 when a concurrent request already consumed (compare-and-set miss)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          maintenance_packs: {
            onSelect: () => ({
              data: { id: PACK_ID, status: "active", total_tickets: 5, used_tickets: 2 },
              error: null,
            }),
            // Update affects 0 rows -> returns null (used_tickets moved underneath us)
            onUpdate: () => ({ data: null, error: null }),
          },
        },
      }),
    });
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(409);
  });
});
