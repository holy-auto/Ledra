import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { createStaffPdfToken, isValidStaffPdfToken, isStaffPdfLinkEnabled } from "../staffPdfLink";
import { createHmac } from "node:crypto";

/**
 * 別の用途（OAuth state と同じ形式: base64url(JSON).HMAC(payload)）で、指定の鍵により正しく署名された文字列を作る。
 * 本物の createOAuthState を呼ぶと、静的解析がその戻り値を資格情報として追跡するので、同じ形式をここで組み立てる。
 */
function signedForAnotherPurpose(key: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      tenantId: "t1",
      provider: "staff-pdf:PID-0001",
      nonce: "n",
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

beforeAll(() => {
  process.env.INTEGRATION_OAUTH_STATE_SECRET = "x".repeat(40);
});
afterEach(() => vi.useRealTimers());

describe("staffPdfLink [スタッフ用 PDF 署名]", () => {
  const t = () => createStaffPdfToken({ tenantId: "t1", publicId: "PID-0001" });

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
    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    expect(isValidStaffPdfToken(tok, "PID-0001", "t1")).toBe(false);
  });

  it("同じ鍵で作った OAuth state は署名として使えない（用途を分けている）", () => {
    const state = signedForAnotherPurpose("x".repeat(40));
    expect(isValidStaffPdfToken(state, "PID-0001", "t1")).toBe(false);
  });

  it("専用鍵が無い・短いときは無効（会計連携のフォールバック鍵では発行も検証もしない）", () => {
    const tok = t();
    const saved = process.env.INTEGRATION_OAUTH_STATE_SECRET;
    try {
      process.env.INTEGRATION_OAUTH_STATE_SECRET = "";
      process.env.FREEE_CLIENT_SECRET = "y".repeat(40);
      expect(isStaffPdfLinkEnabled()).toBe(false);
      expect(() => t()).toThrow();
      expect(isValidStaffPdfToken(tok, "PID-0001", "t1")).toBe(false);
      // フォールバック鍵（freee と共有）で正しく署名されたものも受け付けない
      const viaFallback = signedForAnotherPurpose("y".repeat(40));
      expect(isValidStaffPdfToken(viaFallback, "PID-0001", "t1")).toBe(false);
      process.env.INTEGRATION_OAUTH_STATE_SECRET = "short";
      expect(isStaffPdfLinkEnabled()).toBe(false);
    } finally {
      process.env.INTEGRATION_OAUTH_STATE_SECRET = saved;
      delete process.env.FREEE_CLIENT_SECRET;
    }
  });
});
