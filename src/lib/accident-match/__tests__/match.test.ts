import { describe, expect, it } from "vitest";
import { matchShopsForAccident } from "@/lib/accident-match/match";

/**
 * Build a stub Supabase admin client that returns canned rows per (table, query) combo.
 *
 * matchShopsForAccident makes 5 sequential calls in this order:
 *   1. vehicle_passports SELECT
 *   2. vehicles SELECT
 *   3. certificates SELECT
 *   4. certificate_images SELECT
 *   5. tenants SELECT
 *
 * We model each as a chained builder that resolves with `.maybeSingle()` (1) or
 * `.in(...)` / direct (2-5).
 */
function makeStub(opts: {
  passport: object | null;
  vehicles?: Array<{ id: string; tenant_id: string }>;
  certificates?: Array<{ id: string; tenant_id: string; service_type: string | null; created_at: string }>;
  images?: Array<{ certificate_id: string; authenticity_grade: string | null }>;
  tenants?: Array<{ id: string; name: string | null; slug: string | null }>;
}) {
  return {
    from(table: string) {
      if (table === "vehicle_passports") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: opts.passport, error: null }),
            }),
          }),
        };
      }
      if (table === "vehicles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: opts.vehicles ?? [], error: null }),
            }),
          }),
        };
      }
      if (table === "certificates") {
        return {
          select: () => ({
            in: () => ({
              neq: () => ({
                gte: () => Promise.resolve({ data: opts.certificates ?? [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "certificate_images") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: opts.images ?? [], error: null }),
          }),
        };
      }
      if (table === "tenants") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: opts.tenants ?? [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe("matchShopsForAccident", () => {
  const vin = "JT3HP10V0W7058362";

  it("returns null when the VIN has no passport", async () => {
    const stub = makeStub({ passport: null });
    const r = await matchShopsForAccident(stub as never, vin);
    expect(r).toBeNull();
  });

  it("returns null when passport exists but no vehicles are opted-in", async () => {
    const stub = makeStub({ passport: { vin_code_normalized: vin }, vehicles: [] });
    const r = await matchShopsForAccident(stub as never, vin);
    expect(r).toBeNull();
  });

  it("ranks shops by recency + volume + photo quality", async () => {
    const now = Date.now();
    const recent = new Date(now - 10 * 86_400_000).toISOString(); // 10 days ago
    const old = new Date(now - 200 * 86_400_000).toISOString(); // 200 days ago

    const stub = makeStub({
      passport: { vin_code_normalized: vin },
      vehicles: [
        { id: "v-a", tenant_id: "t-recent" },
        { id: "v-b", tenant_id: "t-old" },
      ],
      certificates: [
        // Shop "recent" has 1 recent PPF cert
        { id: "c1", tenant_id: "t-recent", service_type: "ppf", created_at: recent },
        // Shop "old" has 2 old coating certs but more volume
        { id: "c2", tenant_id: "t-old", service_type: "coating", created_at: old },
        { id: "c3", tenant_id: "t-old", service_type: "coating", created_at: old },
      ],
      images: [
        { certificate_id: "c1", authenticity_grade: "premium" }, // recent shop = grade 3
        { certificate_id: "c2", authenticity_grade: "basic" }, // grade 1
        { certificate_id: "c3", authenticity_grade: "basic" }, // grade 1
      ],
      tenants: [
        { id: "t-recent", name: "Shop Recent", slug: "shop-recent" },
        { id: "t-old", name: "Shop Old", slug: "shop-old" },
      ],
    });

    const r = await matchShopsForAccident(stub as never, vin);
    expect(r).not.toBeNull();
    if (!r) return;

    expect(r.vin_normalized).toBe(vin);
    expect(r.total_history_count).toBe(3);

    // The recent shop should rank above the old one because of recency + quality
    expect(r.ranked_shops[0].shop_name).toBe("Shop Recent");
    expect(r.ranked_shops[1].shop_name).toBe("Shop Old");

    // PPF capability surfaces for the recent shop
    expect(r.ranked_shops[0].capabilities).toContainEqual({ service_type: "ppf", count: 1 });
    expect(r.ranked_shops[1].capabilities).toContainEqual({ service_type: "coating", count: 2 });
  });

  it("caps the ranked list at 5 shops", async () => {
    const now = Date.now();
    const recent = new Date(now - 30 * 86_400_000).toISOString();
    const vehicles = Array.from({ length: 7 }, (_, i) => ({ id: `v-${i}`, tenant_id: `t-${i}` }));
    const certs = Array.from({ length: 7 }, (_, i) => ({
      id: `c-${i}`,
      tenant_id: `t-${i}`,
      service_type: "ppf",
      created_at: recent,
    }));
    const tenants = Array.from({ length: 7 }, (_, i) => ({
      id: `t-${i}`,
      name: `Shop ${i}`,
      slug: `shop-${i}`,
    }));

    const stub = makeStub({
      passport: { vin_code_normalized: vin },
      vehicles,
      certificates: certs,
      tenants,
    });

    const r = await matchShopsForAccident(stub as never, vin);
    expect(r?.ranked_shops).toHaveLength(5);
  });

  it("returns no PII (no customer name, no internal ids)", async () => {
    const stub = makeStub({
      passport: { vin_code_normalized: vin },
      vehicles: [{ id: "v1", tenant_id: "t1" }],
      certificates: [
        {
          id: "c1",
          tenant_id: "t1",
          service_type: "ppf",
          created_at: new Date().toISOString(),
        },
      ],
      tenants: [{ id: "t1", name: "Test Shop", slug: "test-shop" }],
    });
    const r = await matchShopsForAccident(stub as never, vin);
    const stringified = JSON.stringify(r);
    expect(stringified).not.toMatch(/customer_name/);
    expect(stringified).not.toMatch(/customer_email/);
    expect(stringified).not.toMatch(/vehicle_id/);
    expect(stringified).not.toMatch(/tenant_id/);
  });
});
