import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildPassportVerifyResponse } from "@/lib/passport/api/verify";
import * as getPassportDataMod from "@/lib/passport/getPassportData";

vi.mock("@/lib/passport/getPassportData", async () => {
  const actual = await vi.importActual<typeof import("@/lib/passport/getPassportData")>(
    "@/lib/passport/getPassportData",
  );
  return {
    ...actual,
    getPassportData: vi.fn(),
  };
});

const mockedGetPassportData = vi.mocked(getPassportDataMod.getPassportData);

describe("buildPassportVerifyResponse", () => {
  beforeEach(() => {
    mockedGetPassportData.mockReset();
  });

  it("returns null when the passport does not exist", async () => {
    mockedGetPassportData.mockResolvedValueOnce(null);
    const r = await buildPassportVerifyResponse("VIN123456");
    expect(r).toBeNull();
  });

  it("returns a sanitized response with no PII fields", async () => {
    mockedGetPassportData.mockResolvedValueOnce({
      vin_code_normalized: "ABCDEFGHIJKLMNOPQ",
      display_maker: "Toyota",
      display_model: "Aqua",
      display_year: 2022,
      anchored_cert_count: 3,
      tenant_count: 2,
      first_seen_at: "2025-01-01T00:00:00Z",
      last_activity_at: "2026-05-01T00:00:00Z",
      certificates: [
        {
          public_id: "C-ABC123",
          service_type: "ppf",
          created_at: "2025-06-01T00:00:00Z",
          shop_name: "Shop A",
          anchored_image_count: 4,
          primary_tx_hash: "0xabc",
          primary_tx_network: "polygon",
          primary_explorer_url: "https://polygonscan.com/tx/0xabc",
        },
      ],
    });
    const r = await buildPassportVerifyResponse("ABCDEFGHIJKLMNOPQ");
    expect(r).not.toBeNull();
    if (!r) return;

    expect(r.vin_normalized).toBe("ABCDEFGHIJKLMNOPQ");
    expect(r.passport_id).toBe("LMNOPQ"); // last 6 chars of VIN
    expect(r.vehicle.maker).toBe("Toyota");
    expect(r.summary.anchored_certificate_count).toBe(3);
    expect(r.summary.tenant_count).toBe(2);
    expect(r.certificates).toHaveLength(1);
    expect(r.certificates[0]).toMatchObject({
      service_type: "ppf",
      shop_name: "Shop A",
      anchored: true,
      polygon_network: "polygon",
    });

    // The response shape must not echo any internal identifier
    // (vehicle_id, tenant_id, customer_email, …).
    const stringified = JSON.stringify(r);
    expect(stringified).not.toMatch(/vehicle_id/);
    expect(stringified).not.toMatch(/tenant_id/);
    expect(stringified).not.toMatch(/customer_email/);
    expect(stringified).not.toMatch(/customer_name/);
    expect(stringified).not.toMatch(/owner_email/);
  });

  it("passes through the passport_id as the last 6 chars of the VIN", async () => {
    mockedGetPassportData.mockResolvedValueOnce({
      vin_code_normalized: "JT3HP10V0W7058362",
      display_maker: null,
      display_model: null,
      display_year: null,
      anchored_cert_count: 1,
      tenant_count: 1,
      first_seen_at: "2025-01-01T00:00:00Z",
      last_activity_at: "2025-01-01T00:00:00Z",
      certificates: [],
    });
    const r = await buildPassportVerifyResponse("JT3HP10V0W7058362");
    expect(r?.passport_id).toBe("058362");
  });
});
