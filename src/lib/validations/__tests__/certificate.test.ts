import { describe, it, expect } from "vitest";
import { certificateCreateSchema, certificateVoidSchema } from "../certificate";

// ─── certificateCreateSchema ───
describe("certificateCreateSchema", () => {
  const validData = {
    tenant_id: "550e8400-e29b-41d4-a716-446655440000",
    customer_name: "山田太郎",
  };

  it("accepts valid minimal data", () => {
    const result = certificateCreateSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("defaults status to active when not provided", () => {
    const result = certificateCreateSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });

  it("accepts status=draft", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, status: "draft" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("draft");
    }
  });

  it("accepts status=active", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, status: "active" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, status: "invalid" });
    expect(result.success).toBe(false);
  });

  // ─── Required fields ───
  it("rejects missing tenant_id", () => {
    const result = certificateCreateSchema.safeParse({ customer_name: "テスト" });
    expect(result.success).toBe(false);
  });

  it("rejects missing customer_name", () => {
    const result = certificateCreateSchema.safeParse({ tenant_id: validData.tenant_id });
    expect(result.success).toBe(false);
  });

  it("rejects empty customer_name", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, customer_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only customer_name (trimmed to empty)", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, customer_name: "   " });
    expect(result.success).toBe(false);
  });

  it("trims customer_name whitespace", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, customer_name: "  田中  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer_name).toBe("田中");
    }
  });

  // ─── tenant_id validation ───
  it("rejects non-UUID tenant_id", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, tenant_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects empty tenant_id", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, tenant_id: "" });
    expect(result.success).toBe(false);
  });

  // ─── customer_phone_last4 ───
  it("accepts valid 4-digit phone last4", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, customer_phone_last4: "1234" });
    expect(result.success).toBe(true);
  });

  it("rejects non-4-digit phone last4", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, customer_phone_last4: "123" });
    expect(result.success).toBe(false);
  });

  it("rejects alphabetic phone last4", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, customer_phone_last4: "abcd" });
    expect(result.success).toBe(false);
  });

  it("rejects phone last4 with 5 digits", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, customer_phone_last4: "12345" });
    expect(result.success).toBe(false);
  });

  it("accepts null phone last4", () => {
    const result = certificateCreateSchema.safeParse({ ...validData, customer_phone_last4: null });
    expect(result.success).toBe(true);
  });

  it("accepts undefined phone last4 (optional)", () => {
    const result = certificateCreateSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  // ─── Optional nullable fields ───
  it("accepts all optional fields as null", () => {
    const result = certificateCreateSchema.safeParse({
      ...validData,
      vehicle_info_json: null,
      content_free_text: null,
      content_preset_json: null,
      expiry_type: null,
      expiry_value: null,
      logo_asset_path: null,
      footer_variant: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts full valid data with all fields", () => {
    const result = certificateCreateSchema.safeParse({
      ...validData,
      status: "active",
      customer_phone_last4: "0000",
      vehicle_info_json: { make: "Toyota", model: "Prius" },
      content_free_text: "施工内容の説明",
      content_preset_json: { preset: "standard" },
      expiry_type: "years",
      expiry_value: "3",
      logo_asset_path: "/logos/shop.png",
      footer_variant: "default",
    });
    expect(result.success).toBe(true);
  });
});

// ─── certificateVoidSchema ───
describe("certificateVoidSchema", () => {
  it("accepts valid public_id (10+ characters)", () => {
    const result = certificateVoidSchema.safeParse({ public_id: "abcdefghij" });
    expect(result.success).toBe(true);
  });

  it("accepts long public_id", () => {
    const result = certificateVoidSchema.safeParse({ public_id: "a".repeat(50) });
    expect(result.success).toBe(true);
  });

  it("rejects public_id shorter than 10 characters", () => {
    const result = certificateVoidSchema.safeParse({ public_id: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("10");
    }
  });

  it("rejects empty public_id", () => {
    const result = certificateVoidSchema.safeParse({ public_id: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing public_id", () => {
    const result = certificateVoidSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts exactly 10 characters", () => {
    const result = certificateVoidSchema.safeParse({ public_id: "1234567890" });
    expect(result.success).toBe(true);
  });

  it("rejects 9-character public_id", () => {
    const result = certificateVoidSchema.safeParse({ public_id: "123456789" });
    expect(result.success).toBe(false);
  });
});
