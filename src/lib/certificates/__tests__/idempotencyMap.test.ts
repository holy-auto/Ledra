/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: mocks.createServiceRoleAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { recordCertIdempotency, lookupCertByIdempotencyKey } from "@/lib/certificates/idempotencyMap";

const KEY = "test-key-abc123";
const TENANT = "11111111-1111-1111-1111-111111111111";
const CERT_ID = "22222222-2222-42d2-a222-222222222222";

beforeEach(() => {
  mocks.createServiceRoleAdmin.mockReset();
});

function buildAdmin(opts: {
  insertResult?: { data: unknown; error: unknown };
  selectResult?: { data: unknown; error: unknown };
  inserted?: unknown[];
  selectedFilters?: Record<string, unknown>;
}) {
  const inserted = opts.inserted ?? [];
  const filters: Record<string, unknown> = opts.selectedFilters ?? {};
  return {
    from(_table: string) {
      const b: any = {
        select() {
          return b;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return b;
        },
        async maybeSingle() {
          return opts.selectResult ?? { data: null, error: null };
        },
        insert(row: unknown) {
          inserted.push(row);
          return Promise.resolve(opts.insertResult ?? { data: null, error: null });
        },
      };
      return b;
    },
  };
}

describe("recordCertIdempotency", () => {
  it("inserts mapping row and returns ok=true on success", async () => {
    const inserted: unknown[] = [];
    mocks.createServiceRoleAdmin.mockReturnValueOnce(buildAdmin({ inserted }));

    const r = await recordCertIdempotency({
      idempotency_key: KEY,
      tenant_id: TENANT,
      certificate_id: CERT_ID,
      public_id: "PID-1",
    });
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      idempotency_key: KEY,
      tenant_id: TENANT,
      certificate_id: CERT_ID,
      public_id: "PID-1",
    });
  });

  it("treats UNIQUE conflict (23505) as ok=true (concurrent first-wins)", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({ insertResult: { data: null, error: { code: "23505", message: "duplicate" } } }),
    );
    const r = await recordCertIdempotency({
      idempotency_key: KEY,
      tenant_id: TENANT,
      certificate_id: CERT_ID,
      public_id: "PID-1",
    });
    expect(r.ok).toBe(true);
  });

  it("returns ok=false on non-conflict errors but does not throw", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({ insertResult: { data: null, error: { code: "42501", message: "permission denied" } } }),
    );
    const r = await recordCertIdempotency({
      idempotency_key: KEY,
      tenant_id: TENANT,
      certificate_id: CERT_ID,
      public_id: "PID-1",
    });
    expect(r.ok).toBe(false);
  });
});

describe("lookupCertByIdempotencyKey", () => {
  it("returns null when key or tenantId is empty", async () => {
    expect(await lookupCertByIdempotencyKey("", TENANT)).toBeNull();
    expect(await lookupCertByIdempotencyKey(KEY, "")).toBeNull();
  });

  it("returns null when mapping does not exist", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(buildAdmin({ selectResult: { data: null, error: null } }));
    const r = await lookupCertByIdempotencyKey(KEY, TENANT);
    expect(r).toBeNull();
  });

  it("returns public_id + certificate_id when mapping exists", async () => {
    const selectedFilters: Record<string, unknown> = {};
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        selectedFilters,
        selectResult: {
          data: { public_id: "PID-1", certificate_id: CERT_ID },
          error: null,
        },
      }),
    );
    const r = await lookupCertByIdempotencyKey(KEY, TENANT);
    expect(r).toEqual({ public_id: "PID-1", certificate_id: CERT_ID });
    // tenant scope is enforced in the query (key + tenant_id both filtered)
    expect(selectedFilters.idempotency_key).toBe(KEY);
    expect(selectedFilters.tenant_id).toBe(TENANT);
  });
});
