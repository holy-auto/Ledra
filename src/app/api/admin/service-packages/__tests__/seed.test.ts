/* eslint-disable @typescript-eslint/no-explicit-any */
// Test file uses a polymorphic supabase query-builder mock; the chained shape demands `any`.

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

import { POST } from "@/app/api/admin/service-packages/seed/route";
import { STARTER_PACKAGES } from "@/lib/service-packages/starter-templates";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = { userId: "u1", tenantId: TENANT_A, role: "admin", planTier: "pro" };
const VIEWER_A = { userId: "u2", tenantId: TENANT_A, role: "viewer", planTier: "pro" };

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

/**
 * Build a supabase mock that records insertions per table and lets each table
 * declare custom select/insert handlers. Mirrors the pattern from route.test.ts
 * but kept self-contained for clarity.
 */
function buildAdmin(opts: {
  selectByTable?: Record<string, (filters: Record<string, unknown>) => { data: unknown[]; error: unknown }>;
  onInsert?: (table: string, rows: unknown) => { data: unknown; error: unknown };
  inserted?: { table: string; rows: unknown }[];
  deleted?: { table: string; filters: Record<string, unknown> }[];
}) {
  const inserted = opts.inserted ?? [];
  const deleted = opts.deleted ?? [];
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        in(col: string, vals: unknown[]) {
          filters[`${col}__in`] = vals;
          return builder;
        },
        order() {
          return builder;
        },
        async single() {
          // Used after insert().select().single()
          const last = inserted[inserted.length - 1];
          if (last && last.table === table) {
            // Synthetic id back
            const row = (last.rows as any) ?? {};
            return { data: { id: `${table}-id-${inserted.length}`, ...row }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (v: any) => any, reject?: (e: any) => any) {
          try {
            const handler = opts.selectByTable?.[table];
            const r = handler ? handler({ ...filters }) : { data: [], error: null };
            return Promise.resolve(r).then(resolve, reject);
          } catch (e) {
            return reject ? reject(e) : Promise.reject(e);
          }
        },
        insert(rows: unknown) {
          inserted.push({ table, rows });
          const insertBuilder: any = {
            select() {
              return insertBuilder;
            },
            async single() {
              const row = (rows as any) ?? {};
              const res = opts.onInsert?.(table, rows);
              if (res?.error) return { data: null, error: res.error };
              const id = `${table}-id-${inserted.length}`;
              return { data: { id, ...row }, error: null };
            },
            then(resolve: (v: any) => any, reject?: (e: any) => any) {
              try {
                const res = opts.onInsert?.(table, rows);
                if (res?.error) return Promise.resolve({ data: null, error: res.error }).then(resolve, reject);
                // emulate insert().select() returning an array with synthetic ids
                if (Array.isArray(rows)) {
                  const arr = (rows as any[]).map((r, i) => ({ id: `${table}-id-${inserted.length}-${i}`, ...r }));
                  return Promise.resolve({ data: arr, error: null }).then(resolve, reject);
                }
                return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
              } catch (e) {
                return reject ? reject(e) : Promise.reject(e);
              }
            },
          };
          return insertBuilder;
        },
        delete() {
          const delBuilder: any = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return delBuilder;
            },
            then(resolve: (v: any) => any, reject?: (e: any) => any) {
              deleted.push({ table, filters: { ...filters } });
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
          };
          return delBuilder;
        },
      };
      return builder;
    },
  } as any;
}

function makeReq() {
  return new Request("http://localhost/api/admin/service-packages/seed", { method: "POST" }) as any;
}

describe("POST /api/admin/service-packages/seed", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller role is below staff", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(VIEWER_A);
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("creates all starter packages on an empty tenant and scopes by tenant_id", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const inserted: { table: string; rows: unknown }[] = [];
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        selectByTable: {
          // Empty tenant: nothing exists yet
          service_packages: () => ({ data: [], error: null }),
          menu_items: () => ({ data: [], error: null }),
        },
        inserted,
      }),
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      created_packages: number;
      created_menu_items: number;
      skipped_packages: number;
      package_ids: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.created_packages).toBe(STARTER_PACKAGES.length);
    expect(body.skipped_packages).toBe(0);
    expect(body.created_menu_items).toBeGreaterThan(0);
    expect(body.package_ids).toHaveLength(STARTER_PACKAGES.length);

    // All inserts carried tenant_id (no cross-tenant leakage)
    const pkgInsertRows = inserted.filter((i) => i.table === "service_packages");
    expect(pkgInsertRows.length).toBe(STARTER_PACKAGES.length);
    for (const ins of pkgInsertRows) {
      expect((ins.rows as any).tenant_id).toBe(TENANT_A);
    }

    const menuInsertRows = inserted.filter((i) => i.table === "menu_items");
    expect(menuInsertRows.length).toBe(1);
    for (const row of menuInsertRows[0].rows as any[]) {
      expect(row.tenant_id).toBe(TENANT_A);
    }
  });

  it("skips packages already present (idempotent by name)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const inserted: { table: string; rows: unknown }[] = [];
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        selectByTable: {
          // All starter packages already exist
          service_packages: () => ({
            data: STARTER_PACKAGES.map((p, i) => ({ id: `existing-${i}`, name: p.name })),
            error: null,
          }),
          menu_items: () => ({ data: [], error: null }),
        },
        inserted,
      }),
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      created_packages: number;
      skipped_packages: number;
    };
    expect(body.created_packages).toBe(0);
    expect(body.skipped_packages).toBe(STARTER_PACKAGES.length);

    // No service_packages inserts when all are skipped
    expect(inserted.filter((i) => i.table === "service_packages").length).toBe(0);
  });

  it("reuses existing menu_items by name (case-insensitive)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const inserted: { table: string; rows: unknown }[] = [];
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        selectByTable: {
          service_packages: () => ({ data: [], error: null }),
          // Tenant already has the "鉄粉除去" menu item
          menu_items: () => ({
            data: [{ id: "menu-existing-tetsubun", name: "鉄粉除去" }],
            error: null,
          }),
        },
        inserted,
      }),
    });

    const res = await POST();
    expect(res.status).toBe(200);

    const menuInsertCalls = inserted.filter((i) => i.table === "menu_items");
    // Should still insert other missing menu items but should NOT insert "鉄粉除去" again
    expect(menuInsertCalls.length).toBe(1);
    const insertedRows = menuInsertCalls[0].rows as { name: string }[];
    const insertedNames = insertedRows.map((r) => r.name);
    expect(insertedNames).not.toContain("鉄粉除去");
  });
});
