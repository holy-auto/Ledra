import { describe, it, expect } from "vitest";
import {
  buildVersionContent,
  computeVersionContentHash,
  buildCertificateVersionRow,
  CERT_VERSION_CONTENT_FIELDS,
} from "../certificateVersion";

describe("buildVersionContent", () => {
  it("picks only content fields and omits null/undefined", () => {
    const content = buildVersionContent({
      id: "cert-1", // non-content: must be dropped
      tenant_id: "t-1", // non-content: must be dropped
      current_version: 3, // non-content: must be dropped
      manufacturer_template_id: "mt-1", // design field: not in CONTENT_FIELDS → dropped
      customer_name: "田中太郎",
      vehicle_info_json: { model: "アルファード", plate: "品川300" },
      content_free_text: "コーティング施工",
      content_preset_json: null, // null → omitted
      remarks: undefined, // undefined → omitted
      service_type: "coating",
    });
    expect(content).toEqual({
      customer_name: "田中太郎",
      vehicle_info_json: { model: "アルファード", plate: "品川300" },
      content_free_text: "コーティング施工",
      service_type: "coating",
    });
    expect(content).not.toHaveProperty("id");
    expect(content).not.toHaveProperty("current_version");
    expect(content).not.toHaveProperty("content_preset_json");
  });

  it("keeps empty string (distinct from null)", () => {
    const content = buildVersionContent({ content_free_text: "", customer_name: null });
    expect(content).toEqual({ content_free_text: "" });
  });
});

describe("computeVersionContentHash", () => {
  it("is a deterministic 64-hex sha256", () => {
    const h = computeVersionContentHash({ customer_name: "A", service_type: "coating" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeVersionContentHash({ customer_name: "A", service_type: "coating" })).toBe(h);
  });

  it("is key-order independent (canonical) but value-sensitive", () => {
    const a = computeVersionContentHash({ customer_name: "A", service_type: "coating" });
    const b = computeVersionContentHash({ service_type: "coating", customer_name: "A" });
    expect(b).toBe(a); // canonical sort → same hash regardless of insertion order
    const changed = computeVersionContentHash({ customer_name: "A", service_type: "ppf" });
    expect(changed).not.toBe(a); // content change → hash changes
  });

  it("distinguishes a field present-as-empty from absent", () => {
    const withField = computeVersionContentHash({ content_free_text: "" });
    const without = computeVersionContentHash({});
    expect(withField).not.toBe(without);
  });
});

describe("buildCertificateVersionRow", () => {
  it("assembles an insert row whose hash matches its content", () => {
    const cert = { customer_name: "山田", service_type: "maintenance", id: "ignored" };
    const row = buildCertificateVersionRow({
      cert,
      certificateId: "cert-9",
      tenantId: "tenant-9",
      version: 2,
      createdBy: "user-9",
      changeReason: "edit",
    });
    expect(row).toMatchObject({
      certificate_id: "cert-9",
      tenant_id: "tenant-9",
      version: 2,
      created_by: "user-9",
      change_reason: "edit",
    });
    expect(row.content).toEqual({ customer_name: "山田", service_type: "maintenance" });
    expect(row.content_hash).toBe(computeVersionContentHash(row.content));
  });

  it("CONTENT_FIELDS stays aligned with the certificates content columns", () => {
    // ガード: 表示専用/design 列(footer_variant, logo_asset_path, manufacturer_*)は含めない。
    expect(CERT_VERSION_CONTENT_FIELDS).toContain("content_free_text");
    expect(CERT_VERSION_CONTENT_FIELDS).toContain("content_preset_json");
    expect(CERT_VERSION_CONTENT_FIELDS).not.toContain("footer_variant");
    expect(CERT_VERSION_CONTENT_FIELDS).not.toContain("logo_asset_path");
    expect(CERT_VERSION_CONTENT_FIELDS).not.toContain("manufacturer_template_id");
  });
});
