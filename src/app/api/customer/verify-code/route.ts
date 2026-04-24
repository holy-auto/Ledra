import { NextResponse } from "next/server";
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

    const body = await req.json().catch(() => ({}));
    const tenant_slug = (body.tenant_slug ?? "").toString().trim();
    const emailRaw = (body.email ?? "").toString();
    const last4Raw = (body.phone_last4 ?? "").toString();
    const code = (body.code ?? "").toString().trim();

    if (!tenant_slug) return apiValidationError("missing tenant_slug");

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const email = normalizeEmail(emailRaw);
    if (!email.includes("@")) return apiValidationError("invalid email");

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
