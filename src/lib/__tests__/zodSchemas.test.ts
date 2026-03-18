import { describe, it, expect } from "vitest";
import { joinSchema, contactSchema, customerSchema, parseBody } from "../validation/schemas";

describe("joinSchema", () => {
  const validData = {
    company_name: "テスト株式会社",
    contact_person: "山田太郎",
    email: "test@example.com",
    password: "StrongPass1",
    requested_plan: "basic" as const,
  };

  it("accepts valid data", () => {
    const result = joinSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("normalizes email to lowercase", () => {
    const result = joinSchema.safeParse({ ...validData, email: "TEST@EXAMPLE.COM" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("test@example.com");
  });

  it("rejects missing company_name", () => {
    const result = joinSchema.safeParse({ ...validData, company_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects weak password (no uppercase)", () => {
    const result = joinSchema.safeParse({ ...validData, password: "password1" });
    expect(result.success).toBe(false);
  });

  it("rejects weak password (no digit)", () => {
    const result = joinSchema.safeParse({ ...validData, password: "StrongPass" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid plan", () => {
    const result = joinSchema.safeParse({ ...validData, requested_plan: "invalid" });
    expect(result.success).toBe(false);
  });

  it("defaults to basic plan when omitted", () => {
    const { requested_plan, ...rest } = validData;
    const result = joinSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.requested_plan).toBe("basic");
  });
});

describe("contactSchema", () => {
  const validData = {
    name: "テスト",
    email: "test@example.com",
    category: "一般",
    message: "テストメッセージ",
  };

  it("accepts valid data", () => {
    expect(contactSchema.safeParse(validData).success).toBe(true);
  });

  it("accepts with optional company", () => {
    expect(contactSchema.safeParse({ ...validData, company: "テスト株式会社" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(contactSchema.safeParse({ ...validData, name: "" }).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(contactSchema.safeParse({ ...validData, email: "not-email" }).success).toBe(false);
  });

  it("rejects empty message", () => {
    expect(contactSchema.safeParse({ ...validData, message: "" }).success).toBe(false);
  });
});

describe("customerSchema", () => {
  it("accepts minimal data (name only)", () => {
    const result = customerSchema.safeParse({ name: "山田太郎" });
    expect(result.success).toBe(true);
  });

  it("accepts full data", () => {
    const result = customerSchema.safeParse({
      name: "山田太郎",
      name_kana: "ヤマダタロウ",
      email: "test@example.com",
      phone: "090-1234-5678",
      postal_code: "123-4567",
      address: "東京都渋谷区",
      note: "メモ",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(customerSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("parseBody", () => {
  it("returns success with valid data", () => {
    const result = parseBody(contactSchema, {
      name: "テスト",
      email: "a@b.com",
      category: "test",
      message: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("returns errors with invalid data", () => {
    const result = parseBody(contactSchema, { name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
