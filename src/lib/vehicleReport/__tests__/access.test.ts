import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({ from: fromMock }),
}));

import {
  generateReportAccessToken,
  reportCookieName,
  getVehicleReportSettings,
  findValidReportAccess,
  DEFAULT_REPORT_PRICE_JPY,
} from "@/lib/vehicleReport/access";

type Row = Record<string, unknown>;

/** Chained Supabase builder mock: select/eq chains resolve to `result`. */
function chainable(result: { data: Row | null }) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  return builder;
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("generateReportAccessToken", () => {
  it("returns a 64-char hex string", () => {
    const t = generateReportAccessToken();
    expect(t).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is unique across calls", () => {
    const a = generateReportAccessToken();
    const b = generateReportAccessToken();
    expect(a).not.toEqual(b);
  });
});

describe("reportCookieName", () => {
  it("is deterministic and prefixed", () => {
    expect(reportCookieName("JH4DC53001S000001")).toBe(reportCookieName("JH4DC53001S000001"));
    expect(reportCookieName("JH4DC53001S000001")).toMatch(/^vrt_[a-f0-9]{16}$/);
  });

  it("differs per VIN and never embeds the raw VIN", () => {
    const vin = "JH4DC53001S000001";
    const name = reportCookieName(vin);
    expect(name).not.toContain(vin);
    expect(name).not.toEqual(reportCookieName("WBA3A5C50DF000002"));
  });
});

describe("getVehicleReportSettings", () => {
  it("returns the stored row when present", async () => {
    fromMock.mockReturnValue(chainable({ data: { price_jpy: 4980, enabled: false } }));
    await expect(getVehicleReportSettings()).resolves.toEqual({ price_jpy: 4980, enabled: false });
  });

  it("falls back to defaults when the row is missing", async () => {
    fromMock.mockReturnValue(chainable({ data: null }));
    await expect(getVehicleReportSettings()).resolves.toEqual({
      price_jpy: DEFAULT_REPORT_PRICE_JPY,
      enabled: true,
    });
  });
});

describe("findValidReportAccess", () => {
  it("returns null without a token (no DB call)", async () => {
    expect(await findValidReportAccess("VIN1", null)).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null for an expired grant", async () => {
    fromMock.mockReturnValue(
      chainable({
        data: {
          id: "o1",
          vin_code_normalized: "VIN1",
          status: "paid",
          expires_at: new Date(Date.now() - 1000).toISOString(),
        },
      }),
    );
    expect(await findValidReportAccess("VIN1", "tok")).toBeNull();
  });

  it("returns the grant when paid and not expired", async () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    fromMock.mockReturnValue(
      chainable({
        data: { id: "o1", vin_code_normalized: "VIN1", status: "paid", expires_at: expires },
      }),
    );
    expect(await findValidReportAccess("VIN1", "tok")).toEqual({
      id: "o1",
      vin_code_normalized: "VIN1",
      expires_at: expires,
      scope: { type: "full" },
    });
  });

  it("treats a null expiry as non-expiring", async () => {
    fromMock.mockReturnValue(
      chainable({ data: { id: "o2", vin_code_normalized: "VIN2", status: "paid", expires_at: null } }),
    );
    expect(await findValidReportAccess("VIN2", "tok")).toEqual({
      id: "o2",
      vin_code_normalized: "VIN2",
      expires_at: null,
      scope: { type: "full" },
    });
  });
});
