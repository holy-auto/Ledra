import crypto from "crypto";

/**
 * Passport ownership-transfer tokens.
 *
 * Stable shape:
 *   - Raw token: `lpt_` + 32 bytes of url-safe base64 (43 chars)
 *   - Stored: SHA-256(raw + CUSTOMER_AUTH_PEPPER) — only the hash
 *
 * The pepper is the same env var used by tenant_api_keys (and
 * customer OTP hashes). Sharing one pepper minimizes ops
 * complexity — leaking it is already a platform-level incident.
 */

const PEPPER = process.env.CUSTOMER_AUTH_PEPPER ?? "";

const PREFIX = "lpt_";

export function generateTransferToken(): { rawToken: string; tokenHash: string } {
  const random = crypto.randomBytes(32).toString("base64url");
  const rawToken = `${PREFIX}${random}`;
  return { rawToken, tokenHash: hashTransferToken(rawToken) };
}

export function hashTransferToken(rawToken: string): string {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return crypto.createHash("sha256").update(`passporttransfer|v1|${rawToken}|${PEPPER}`).digest("hex");
}

export function isTransferTokenFormat(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX) && value.length >= PREFIX.length + 20;
}
