import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { createStaffPdfToken, isValidStaffPdfToken } from "../staffPdfLink";

beforeAll(() => {
  process.env.INTEGRATION_OAUTH_STATE_SECRET = "x".repeat(40);
});
afterEach(() => vi.useRealTimers());

describe("staffPdfLink [スタッフ用 PDF 署名]", () => {
  const t = () => createStaffPdfToken({ tenantId: "t1", publicId: "PID-0001", userId: "u1" });

  it("同じ証明書・同じテナントなら有効", () => {
    expect(isValidStaffPdfToken(t(), "PID-0001", "t1")).toBe(true);
  });
  it("別の証明書・別のテナントには使えない", () => {
    expect(isValidStaffPdfToken(t(), "PID-0002", "t1")).toBe(false);
    expect(isValidStaffPdfToken(t(), "PID-0001", "t2")).toBe(false);
  });
  it("改ざん・期限切れは無効", () => {
    const tok = t();
    expect(isValidStaffPdfToken(tok.slice(0, -2) + "xx", "PID-0001", "t1")).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    expect(isValidStaffPdfToken(tok, "PID-0001", "t1")).toBe(false);
  });
});
