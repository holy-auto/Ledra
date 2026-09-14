/**
 * PII shielding verification tests for passport public surfaces (IMP-025).
 *
 * These tests enforce that public-facing passport types and data
 * pipelines exclude customer PII. The compile-time assertions in
 * piiFields.ts catch type-level regressions; these runtime tests
 * verify the actual data shapes and query patterns.
 */
import { describe, it, expect } from "vitest";
import { VEHICLE_TABLE_PII_COLUMNS, PASSPORT_TABLE_PII_COLUMNS } from "@/lib/vehicles/customerRelation";
import { PII_ASSERTIONS_VALID } from "@/lib/passport/piiFields";

// ---------------------------------------------------------------------------
// 1. Compile-time assertions are valid
// ---------------------------------------------------------------------------
describe("PII compile-time assertions", () => {
  it("all public passport types pass PII field overlap checks", () => {
    // If piiFields.ts fails to compile, this test file won't load at all.
    // This assertion makes the intent explicit in test output.
    expect(PII_ASSERTIONS_VALID).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. PII field registries are exhaustive
// ---------------------------------------------------------------------------
describe("PII field registries", () => {
  it("VEHICLE_TABLE_PII_COLUMNS covers known PII columns", () => {
    // customer_name/customer_email/customer_phone_masked were dropped from
    // `vehicles` in migration 20260321000002 — not current columns.
    const expected = ["customer_id", "notes", "plate_display"];
    expect([...VEHICLE_TABLE_PII_COLUMNS].sort()).toEqual(expected.sort());
  });

  it("PASSPORT_TABLE_PII_COLUMNS covers owner PII columns", () => {
    const expected = ["current_owner_email", "current_owner_name", "from_owner_email", "from_owner_name"];
    expect([...PASSPORT_TABLE_PII_COLUMNS].sort()).toEqual(expected.sort());
  });
});

// ---------------------------------------------------------------------------
// 3. PassportCertCard shape verification
// ---------------------------------------------------------------------------
describe("PassportCertCard shape", () => {
  // We can't import the actual type at runtime, but we can verify
  // the allowed key set via a representative object.
  const ALLOWED_CERT_CARD_KEYS = [
    "public_id",
    "service_type",
    "created_at",
    "shop_name",
    "anchored_image_count",
    "primary_tx_hash",
    "primary_tx_network",
    "primary_explorer_url",
  ];

  it("contains only non-PII fields", () => {
    const allPII = [...VEHICLE_TABLE_PII_COLUMNS, ...PASSPORT_TABLE_PII_COLUMNS];
    const overlap = ALLOWED_CERT_CARD_KEYS.filter((k) => allPII.includes(k as (typeof allPII)[number]));
    expect(overlap).toEqual([]);
  });

  it("does not include price or address fields", () => {
    const sensitivePatterns = ["price", "cost", "amount", "address", "phone", "email"];
    const matches = ALLOWED_CERT_CARD_KEYS.filter((k) => sensitivePatterns.some((p) => k.toLowerCase().includes(p)));
    expect(matches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. PassportVerifyResponse shape verification
// ---------------------------------------------------------------------------
describe("PassportVerifyResponse shape", () => {
  const VERIFY_RESPONSE_KEYS = ["vin_normalized", "passport_id", "vehicle", "summary", "meta_anchor", "certificates"];

  it("top-level keys contain no PII", () => {
    const allPII = [...VEHICLE_TABLE_PII_COLUMNS, ...PASSPORT_TABLE_PII_COLUMNS];
    const overlap = VERIFY_RESPONSE_KEYS.filter((k) => allPII.includes(k as (typeof allPII)[number]));
    expect(overlap).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. PublicTransferView exposes recipient data only
// ---------------------------------------------------------------------------
describe("PublicTransferView PII boundary", () => {
  const TRANSFER_VIEW_KEYS = [
    "id",
    "vin_short",
    "status",
    "to_owner_email", // recipient's own data — OK
    "to_owner_name", // recipient's own data — OK
    "message",
    "expires_at",
    "shop_name",
    "vehicle_label",
  ];

  it("does not expose from_owner (previous owner) PII", () => {
    const priorOwnerFields = ["from_owner_email", "from_owner_name"];
    const overlap = TRANSFER_VIEW_KEYS.filter((k) => priorOwnerFields.includes(k));
    expect(overlap).toEqual([]);
  });

  it("does not expose tenant_id or vehicle_id", () => {
    const internalFields = ["tenant_id", "vehicle_id", "initiating_tenant_id", "initiating_vehicle_id"];
    const overlap = TRANSFER_VIEW_KEYS.filter((k) => internalFields.includes(k));
    expect(overlap).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. getPassportData query column audit
// ---------------------------------------------------------------------------
describe("getPassportData query safety", () => {
  // ponytail: Rather than importing and running the async function
  // (which needs a DB), we verify the source code's SELECT columns.
  // If someone adds a PII column to the query, this test catches it.
  it("certificates query selects only non-PII columns", async () => {
    const { readFileSync } = await import("fs");
    const source = readFileSync("src/lib/passport/getPassportData.ts", "utf-8");

    // The certificates query should NOT select any PII columns
    const allPII = [...VEHICLE_TABLE_PII_COLUMNS, ...PASSPORT_TABLE_PII_COLUMNS];
    for (const col of allPII) {
      // Look for the column name in .select() calls
      // Exclude comments and type definitions (lines starting with // or *)
      const lines = source.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
      const codeWithoutComments = lines.join("\n");

      // Check if the PII column appears in a .select() call
      const selectRegex = new RegExp(`\\.select\\([^)]*\\b${col}\\b`);
      expect(selectRegex.test(codeWithoutComments), `getPassportData query must not SELECT '${col}' (PII field)`).toBe(
        false,
      );
    }
  });

  it("vehicles query selects only id and tenant_id", async () => {
    const { readFileSync } = await import("fs");
    const source = readFileSync("src/lib/passport/getPassportData.ts", "utf-8");
    // The vehicles .select() should be minimal — id, tenant_id only
    const vehicleSelectMatch = source.match(/\.from\("vehicles"\)\s*\.select\("([^"]+)"\)/);
    expect(vehicleSelectMatch).not.toBeNull();
    const selectedColumns = vehicleSelectMatch![1].split(",").map((s) => s.trim());
    // Must not include any PII columns
    for (const col of VEHICLE_TABLE_PII_COLUMNS) {
      expect(selectedColumns.includes(col), `vehicles query must not SELECT '${col}'`).toBe(false);
    }
  });
});
