import { describe, it, expect, vi, afterEach } from "vitest";
import { sanitizeErrorMessage } from "@/lib/api/response";

describe("sanitizeErrorMessage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns raw message in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const err = new Error('relation "tenants" does not exist');
    expect(sanitizeErrorMessage(err)).toBe('relation "tenants" does not exist');
  });

  it("returns generic message in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const err = new Error('relation "tenants" does not exist');
    expect(sanitizeErrorMessage(err)).toBe("処理中にエラーが発生しました。");
  });

  it("handles non-Error objects in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sanitizeErrorMessage("string error")).toBe("string error");
  });

  it("returns fallback for non-Error objects in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sanitizeErrorMessage("string error")).toBe("処理中にエラーが発生しました。");
  });

  it("uses custom fallback message in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sanitizeErrorMessage(new Error("x"), "カスタムエラー")).toBe("カスタムエラー");
  });

  it("ignores custom fallback in development (returns raw message)", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sanitizeErrorMessage(new Error("raw detail"), "カスタムエラー")).toBe("raw detail");
  });

  it("handles null/undefined errors in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sanitizeErrorMessage(null)).toBe("null");
    expect(sanitizeErrorMessage(undefined)).toBe("undefined");
  });

  it("handles null/undefined errors in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sanitizeErrorMessage(null)).toBe("処理中にエラーが発生しました。");
    expect(sanitizeErrorMessage(undefined)).toBe("処理中にエラーが発生しました。");
  });
});
