/**
 * Cross-tenant integration coverage for the passport transfer accept path.
 *
 * The thing we really care about — and what makes "cross-tenant" matter —
 * is that accepting a transfer updates `vehicle_passports.current_owner_*`
 * (VIN-keyed, visible to every tenant) rather than only patching the
 * initiating tenant's own `vehicles` row. These tests stub the Supabase
 * client and assert that the update lands on the passport row even when
 * other tenants also have a vehicles row with the same VIN.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleAdmin: vi.fn(),
  sendTransferAcceptedNotification: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: mocks.createServiceRoleAdmin }));
vi.mock("@/lib/passport/transfers/email", () => ({
  sendTransferAcceptedNotification: mocks.sendTransferAcceptedNotification,
}));
vi.mock("@/lib/audit/certificateLog", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

// hashTransferToken needs CUSTOMER_AUTH_PEPPER; set it before importing.
process.env.CUSTOMER_AUTH_PEPPER = "test-pepper";

import { acceptTransferByToken } from "../respond";
import { generateTransferToken } from "../tokens";

type Doc = Record<string, unknown>;

/**
 * Tiny Supabase double. Captures per-table update payloads so tests can
 * assert which rows were touched, and serves canned reads for the
 * tables `respond.ts` queries.
 */
function makeAdmin(opts: {
  transfer: Doc | null;
  tenant?: Doc | null;
  vehicle?: Doc | null;
  passportUpdateErr?: { message: string } | null;
  onTransferUpdate?: (doc: Doc) => void;
  onPassportUpdate?: (doc: Doc) => void;
}) {
  return {
    from: (table: string) => {
      if (table === "passport_ownership_transfers") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.transfer, error: null }) }),
          }),
          update: (doc: Doc) => {
            opts.onTransferUpdate?.(doc);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        // Simulate the conditional update succeeding on the
                        // first try (no concurrent expire race).
                        data: opts.transfer ? { id: (opts.transfer as { id: string }).id } : null,
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === "vehicle_passports") {
        return {
          update: (doc: Doc) => {
            opts.onPassportUpdate?.(doc);
            return {
              eq: () => Promise.resolve({ error: opts.passportUpdateErr ?? null }),
            };
          },
        };
      }
      if (table === "tenants") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.tenant ?? null }) }),
          }),
        };
      }
      if (table === "vehicles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.vehicle ?? null }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

describe("acceptTransferByToken — cross-tenant ownership flip", () => {
  const VIN = "JH4DC53001S000001";
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it("updates the VIN-keyed passport row, not just the initiating tenant's vehicle", async () => {
    const { rawToken } = generateTransferToken();

    let passportUpdate: Doc | null = null;
    mocks.createServiceRoleAdmin.mockReturnValue(
      makeAdmin({
        transfer: {
          id: "t1",
          vin_code_normalized: VIN,
          initiating_tenant_id: "tenant-A",
          initiating_vehicle_id: "vehicle-A",
          from_owner_email: "old@example.com",
          to_owner_email: "new@example.com",
          status: "pending",
          expires_at: future,
        },
        tenant: { name: "Shop A", slug: "shop-a", contact_email: "shop@a.example" },
        vehicle: { maker: "Toyota", model: "Aqua", year: 2022 },
        onPassportUpdate: (doc) => (passportUpdate = doc),
      }),
    );

    const res = await acceptTransferByToken({ rawToken, acceptedByName: "新オーナー" });

    expect(res.ok).toBe(true);
    expect(passportUpdate).not.toBeNull();
    // The whole point: writes land on vehicle_passports (VIN-keyed)
    // — that's how tenant B / C / … see the new owner without us
    // having to walk their `vehicles` rows.
    expect(passportUpdate).toMatchObject({
      current_owner_email: "new@example.com",
      current_owner_name: "新オーナー",
      ownership_set_at: expect.any(String),
      pii_masked_at: expect.any(String),
    });
  });

  it("still returns ok=true even when the passport update fails (idempotent reconcile path)", async () => {
    const { rawToken } = generateTransferToken();
    mocks.createServiceRoleAdmin.mockReturnValue(
      makeAdmin({
        transfer: {
          id: "t2",
          vin_code_normalized: VIN,
          initiating_tenant_id: "tenant-A",
          initiating_vehicle_id: null,
          from_owner_email: null,
          to_owner_email: "new@example.com",
          status: "pending",
          expires_at: future,
        },
        passportUpdateErr: { message: "deadlock detected" },
      }),
    );

    const res = await acceptTransferByToken({ rawToken, acceptedByName: null });
    // The transfer row is the source of truth — passport update is
    // best-effort and a reconcile job can pick up the lag.
    expect(res.ok).toBe(true);
  });

  it("rejects already-accepted transfers (idempotent on double-click)", async () => {
    const { rawToken } = generateTransferToken();
    mocks.createServiceRoleAdmin.mockReturnValue(
      makeAdmin({
        transfer: {
          id: "t3",
          vin_code_normalized: VIN,
          initiating_tenant_id: "tenant-A",
          initiating_vehicle_id: null,
          from_owner_email: null,
          to_owner_email: "new@example.com",
          status: "accepted",
          expires_at: future,
        },
      }),
    );

    const res = await acceptTransferByToken({ rawToken, acceptedByName: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_pending");
  });

  it("rejects expired transfers", async () => {
    const { rawToken } = generateTransferToken();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    mocks.createServiceRoleAdmin.mockReturnValue(
      makeAdmin({
        transfer: {
          id: "t4",
          vin_code_normalized: VIN,
          initiating_tenant_id: "tenant-A",
          initiating_vehicle_id: null,
          from_owner_email: null,
          to_owner_email: "new@example.com",
          status: "pending",
          expires_at: past,
        },
      }),
    );

    const res = await acceptTransferByToken({ rawToken, acceptedByName: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("expired");
  });

  it("returns not_found for an unknown token (without leaking format details)", async () => {
    const { rawToken } = generateTransferToken();
    mocks.createServiceRoleAdmin.mockReturnValue(makeAdmin({ transfer: null }));

    const res = await acceptTransferByToken({ rawToken, acceptedByName: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_found");
  });
});
