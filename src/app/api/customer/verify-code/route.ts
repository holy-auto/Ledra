import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import {
  createSession,
  getLatestValidCodeRow,
  getTenantIdBySlug,
  markCodeAttempt,
  markCodeUsed,
  normalizeEmail,
  otpCodeHash,
  phoneLast4Hash,
  CUSTOMER_COOKIE,
  OTP_MAX_ATTEMPTS,
} from "@/lib/customerPortalServer";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { logger } from "@/lib/logger";

const isSecureCookie = process.env.NODE_ENV === "production";

const verifyCodeSchema = z.object({
  tenant_slug: z.string().trim().min(1, "missing tenant_slug").max(100),
  email: z.string().trim().email("invalid email").max(254),
  phone_last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "invalid phone_last4"),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "invalid code"),
});

export async function POST(req: Request) {
  try {
    // Rate limit: 10 verify attempts per IP per 5 minutes
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`verify:${ip}`, { limit: 10, windowSec: 300 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "試行回数が多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const parsed = verifyCodeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { tenant_slug, email: emailRaw, phone_last4: last4Raw, code } = parsed.data;

    // Anti-enumeration: collapse "unknown tenant" / "no code" / "code used" /
    // "code expired" / "wrong code" into a single 400 invalid_code response so
    // callers cannot use the response to enumerate tenant slugs, email
    // addresses, or phone-last4 combinations. Rate-limit failures (429) are
    // unaffected because they do not reveal account state.
    const invalidCodeResponse = apiValidationError("invalid_code");

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) {
      logger.info("customer/verify-code: unknown tenant slug", { tenant_slug });
      return invalidCodeResponse;
    }

    const email = normalizeEmail(emailRaw);

    // Per-account verify lockout: 8 wrong attempts per (tenant+email) per
    // 15 min, even across IPs. The existing per-OTP attempt counter (5)
    // catches a single code; this one stops a sustained credential-stuffing
    // pattern that requests a new code each time.
    const acctKey = `verify-acct:${tenantId}:${email}`;
    const acctRl = await checkRateLimit(acctKey, { limit: 8, windowSec: 900 });
    if (!acctRl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "このアカウントの試行回数が上限に達しました。" },
        { status: 429, headers: { "Retry-After": String(acctRl.retryAfterSec) } },
      );
    }

    let phoneHash: string;
    try {
      phoneHash = phoneLast4Hash(tenantId, last4Raw);
    } catch {
      return invalidCodeResponse;
    }

    const row = await getLatestValidCodeRow(tenantId, email, phoneHash);
    if (!row) return invalidCodeResponse;

    if (row.used_at) return invalidCodeResponse;
    if (new Date(row.expires_at).getTime() < Date.now()) return invalidCodeResponse;

    const expected = otpCodeHash(tenantId, email, phoneHash, code);
    // 定数時間比較。長さが違えば即不一致 (timingSafeEqual は等長バッファ必須)。
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(row.code_hash ?? "");
    const codeMatches = expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
    if (!codeMatches) {
      const nextAttempts = (row.attempts ?? 0) + 1;
      await markCodeAttempt(row.id, nextAttempts);
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        await markCodeUsed(row.id);
        return apiJson(
          { error: "too_many_attempts", message: "試行回数の上限に達しました。再度コードを送信してください。" },
          { status: 429 },
        );
      }
      return invalidCodeResponse;
    }

    await markCodeUsed(row.id);

    const sess = await createSession(tenantId, email, phoneHash);

    const res = apiJson({ ok: true });

    res.cookies.set(CUSTOMER_COOKIE, sess.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return res;
  } catch (e: unknown) {
    return apiInternalError(e, "customer/verify-code");
  }
}
