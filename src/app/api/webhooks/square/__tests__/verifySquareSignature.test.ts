/**
 * C-L3 回帰確認: verifySquareSignature が不正な長さの署名でも例外を投げず
 * false を返すこと（crypto.timingSafeEqual は長さ不一致で RangeError を投げる）。
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifySquareSignature } from "../route";

const KEY = "test-signature-key";
const URL = "https://example.com/api/webhooks/square";
const BODY = '{"type":"payment.completed"}';

function validSignature(): string {
  const hmac = crypto.createHmac("sha256", KEY);
  hmac.update(URL + BODY);
  return hmac.digest("base64");
}

describe("verifySquareSignature", () => {
  it("正しい署名は true を返す", () => {
    expect(verifySquareSignature(BODY, validSignature(), KEY, URL)).toBe(true);
  });

  it("同じ長さの不正な署名は例外を投げず false を返す", () => {
    const valid = validSignature();
    const tampered = valid.slice(0, -1) + (valid.slice(-1) === "A" ? "B" : "A");
    expect(() => verifySquareSignature(BODY, tampered, KEY, URL)).not.toThrow();
    expect(verifySquareSignature(BODY, tampered, KEY, URL)).toBe(false);
  });

  it("長さが違う署名でも例外を投げず false を返す（本来の修正点）", () => {
    expect(() => verifySquareSignature(BODY, "short", KEY, URL)).not.toThrow();
    expect(verifySquareSignature(BODY, "short", KEY, URL)).toBe(false);

    expect(() => verifySquareSignature(BODY, "x".repeat(500), KEY, URL)).not.toThrow();
    expect(verifySquareSignature(BODY, "x".repeat(500), KEY, URL)).toBe(false);

    expect(() => verifySquareSignature(BODY, "", KEY, URL)).not.toThrow();
    expect(verifySquareSignature(BODY, "", KEY, URL)).toBe(false);
  });
});
