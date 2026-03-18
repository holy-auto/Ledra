import { describe, it, expect } from "vitest";

/**
 * Tests for validation patterns used across API routes.
 * These test the same regex/logic used in the actual routes.
 */

// Email validation pattern (used in join/route.ts and contact/route.ts)
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Password validation (used in join/route.ts)
function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push("パスワードは8文字以上で入力してください");
  } else {
    if (!/[A-Z]/.test(password)) errors.push("パスワードに大文字を1文字以上含めてください");
    if (!/[a-z]/.test(password)) errors.push("パスワードに小文字を1文字以上含めてください");
    if (!/[0-9]/.test(password)) errors.push("パスワードに数字を1文字以上含めてください");
  }
  return errors;
}

// phone_last4 validation (used in request-code/route.ts)
function isValidLast4(last4: string): boolean {
  return /^\d{4}$/.test(last4);
}

describe("email validation", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
    expect(isValidEmail("user@domain.co.jp")).toBe(true);
    expect(isValidEmail("a+b@c.d")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("@no-local.com")).toBe(false);
    expect(isValidEmail("no-domain@")).toBe(false);
    expect(isValidEmail("has space@test.com")).toBe(false);
  });
});

describe("password validation", () => {
  it("accepts strong password", () => {
    expect(validatePassword("Password1")).toEqual([]);
    expect(validatePassword("AbCdEf12")).toEqual([]);
  });

  it("rejects short password", () => {
    const errs = validatePassword("Ab1");
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("8文字以上");
  });

  it("rejects missing uppercase", () => {
    const errs = validatePassword("password1");
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("大文字");
  });

  it("rejects missing lowercase", () => {
    const errs = validatePassword("PASSWORD1");
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("小文字");
  });

  it("rejects missing digit", () => {
    const errs = validatePassword("Passwordd");
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("数字");
  });

  it("can have multiple errors", () => {
    const errs = validatePassword("12345678");
    expect(errs.length).toBeGreaterThanOrEqual(2); // missing upper + lower
  });
});

describe("phone_last4 validation", () => {
  it("accepts valid 4-digit strings", () => {
    expect(isValidLast4("1234")).toBe(true);
    expect(isValidLast4("0000")).toBe(true);
    expect(isValidLast4("9999")).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(isValidLast4("123")).toBe(false);
    expect(isValidLast4("12345")).toBe(false);
    expect(isValidLast4("abcd")).toBe(false);
    expect(isValidLast4("")).toBe(false);
    expect(isValidLast4("12 4")).toBe(false);
  });
});
