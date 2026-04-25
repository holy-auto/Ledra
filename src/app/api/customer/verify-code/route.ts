import { NextResponse } from "next/server";
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
} from "@/lib/customerPortalServer";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

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

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const email = normalizeEmail(emailRaw);

    let phoneHash: string;
    try {
      phoneHash = phoneLast4Hash(tenantId, last4Raw);
    } catch {
      return apiValidationError("invalid phone_last4");
    }

    const row = await getLatestValidCodeRow(tenantId, email, phoneHash);
    if (!row) return apiNotFound("no code");

    if (row.used_at) return apiValidationError("code used");
    if (new Date(row.expires_at).getTime() < Date.now()) return apiValidationError("code expired");

    const expected = otpCodeHash(tenantId, email, phoneHash, code);
    if (expected !== row.code_hash) {
      const nextAttempts = (row.attempts ?? 0) + 1;
      await markCodeAttempt(row.id, nextAttempts);
      if (nextAttempts >= 5) {
        await markCodeUsed(row.id);
        return apiJson(
          { error: "too_many_attempts", message: "試行回数の上限に達しました。再度コードを送信してください。" },
          { status: 429 },
        );
      }
      return apiValidationError("invalid code");
    }

    await markCodeUsed(row.id);

    // last4Raw は後方互換のために保存（ハッシュのない古い証明書を参照するため）
    const sess = await createSession(tenantId, email, phoneHash, last4Raw || undefined);

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
