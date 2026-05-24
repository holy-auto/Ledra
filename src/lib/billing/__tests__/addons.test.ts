import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isAddonEnabled,
  listEnabledAddons,
  enableAddon,
  disableAddon,
  isKnownAddonKey,
  ADDON_KEYS,
  ADDON_CATALOG,
} from "@/lib/billing/addons";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

/**
 * Build a tiny fake supabase admin client with controllable responses for
 * the chains addons.ts exercises (select+eq+eq+limit+maybeSingle for
 * isAddonEnabled, select+eq for listEnabledAddons, upsert + update+eq+eq).
 */
function fakeAdmin(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeSingleResult?: { data: any; error: { message: string } | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listResult?: { data: any[]; error: { message: string } | null };
  upsertResult?: { error: { message: string } | null };
  updateResult?: { error: { message: string } | null };
}) {
  const upserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ patch: Record<string, unknown>; filters: Array<{ col: string; val: unknown }> }> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = {
    from: vi.fn(() => ({
      select: () => ({
        // listEnabledAddons path: .select(...).eq("tenant_id", ...)
        eq: vi.fn((_col: string, _val: unknown) => {
          // continuation can either resolve directly (list) or .eq().limit().maybeSingle() (isAddonEnabled)
          const next = {
            eq: vi.fn(() => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve(opts.maybeSingleResult ?? { data: null, error: null }),
              }),
            })),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(opts.listResult ?? { data: [], error: null }).then(resolve),
          };
          return next;
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        upserts.push(row);
        return Promise.resolve(opts.upsertResult ?? { error: null });
      },
      update: (patch: Record<string, unknown>) => {
        const filters: Array<{ col: string; val: unknown }> = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push({ col, val });
            // After the second .eq() we resolve.
            if (filters.length >= 2) {
              updates.push({ patch, filters });
              return Promise.resolve(opts.updateResult ?? { error: null });
            }
            return chain;
          },
        };
        return chain;
      },
    })),
  };
  return { admin, upserts, updates };
}

describe("isKnownAddonKey", () => {
  it("returns true for canonical keys", () => {
    expect(isKnownAddonKey("market_vehicles")).toBe(true);
    expect(isKnownAddonKey("btob")).toBe(true);
    expect(isKnownAddonKey("deals")).toBe(true);
  });
  it("returns false for unknown keys", () => {
    expect(isKnownAddonKey("not_a_real_addon")).toBe(false);
    expect(isKnownAddonKey("")).toBe(false);
  });
});

describe("ADDON_CATALOG", () => {
  it("has an entry for every canonical addon key", () => {
    const catalogKeys = ADDON_CATALOG.map((e) => e.key).sort();
    const expectedKeys = Object.values(ADDON_KEYS).sort();
    expect(catalogKeys).toEqual(expectedKeys);
  });

  it("provides non-empty label / description / primaryRoute for each entry", () => {
    for (const entry of ADDON_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.primaryRoute.startsWith("/")).toBe(true);
    }
  });
});

describe("isAddonEnabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when no row exists", async () => {
    const { admin } = fakeAdmin({ maybeSingleResult: { data: null, error: null } });
    expect(await isAddonEnabled(admin, "t-1", ADDON_KEYS.market_vehicles)).toBe(false);
  });

  it("returns true when the row exists with disabled_at=null", async () => {
    const { admin } = fakeAdmin({ maybeSingleResult: { data: { disabled_at: null }, error: null } });
    expect(await isAddonEnabled(admin, "t-1", ADDON_KEYS.market_vehicles)).toBe(true);
  });

  it("returns false when the row is soft-disabled (disabled_at IS NOT NULL)", async () => {
    const { admin } = fakeAdmin({
      maybeSingleResult: { data: { disabled_at: "2026-05-14T00:00:00Z" }, error: null },
    });
    expect(await isAddonEnabled(admin, "t-1", ADDON_KEYS.btob)).toBe(false);
  });

  it("fails closed (returns false) on DB error", async () => {
    const { admin } = fakeAdmin({ maybeSingleResult: { data: null, error: { message: "boom" } } });
    expect(await isAddonEnabled(admin, "t-1", ADDON_KEYS.deals)).toBe(false);
  });
});

describe("listEnabledAddons", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the enabled known-key add-ons (ignores disabled + unknown keys)", async () => {
    const { admin } = fakeAdmin({
      listResult: {
        data: [
          { addon_key: "market_vehicles", disabled_at: null },
          { addon_key: "btob", disabled_at: "2026-01-01" }, // disabled → excluded
          { addon_key: "deals", disabled_at: null },
          { addon_key: "unknown_legacy", disabled_at: null }, // unknown → excluded
        ],
        error: null,
      },
    });
    const set = await listEnabledAddons(admin, "t-1");
    expect(set.has("market_vehicles")).toBe(true);
    expect(set.has("deals")).toBe(true);
    expect(set.has("btob")).toBe(false);
    expect(set.size).toBe(2);
  });

  it("returns empty set on DB error", async () => {
    const { admin } = fakeAdmin({ listResult: { data: [], error: { message: "boom" } } });
    const set = await listEnabledAddons(admin, "t-1");
    expect(set.size).toBe(0);
  });
});

describe("enableAddon", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts a fresh row with disabled_at=null and any notes", async () => {
    const { admin, upserts } = fakeAdmin({});
    const res = await enableAddon(admin, "t-1", ADDON_KEYS.market_vehicles, "support ticket #42");
    expect(res).toEqual({ ok: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      tenant_id: "t-1",
      addon_key: "market_vehicles",
      disabled_at: null,
      notes: "support ticket #42",
    });
  });

  it("propagates DB error as ok:false", async () => {
    const { admin } = fakeAdmin({ upsertResult: { error: { message: "constraint violation" } } });
    const res = await enableAddon(admin, "t-1", ADDON_KEYS.btob);
    expect(res).toEqual({ ok: false, error: "constraint violation" });
  });
});

describe("disableAddon", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets disabled_at on the existing row (idempotent)", async () => {
    const { admin, updates } = fakeAdmin({});
    const res = await disableAddon(admin, "t-1", ADDON_KEYS.deals, "self-service cancel");
    expect(res).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({
      notes: "self-service cancel",
    });
    expect(typeof (updates[0].patch as { disabled_at: string }).disabled_at).toBe("string");
    expect(updates[0].filters).toEqual([
      { col: "tenant_id", val: "t-1" },
      { col: "addon_key", val: "deals" },
    ]);
  });

  it("propagates DB error as ok:false", async () => {
    const { admin } = fakeAdmin({ updateResult: { error: { message: "deadlock" } } });
    const res = await disableAddon(admin, "t-1", ADDON_KEYS.market_vehicles);
    expect(res.ok).toBe(false);
  });
});
