import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveBaseUrl } from "@/lib/url";
import {
  createLoginCode,
  getTenantIdBySlug,
  normalizeEmail,
  phoneLast4Hash,
  tenantHasPhoneHash,
  OTP_TTL_MIN,
} from "@/lib/customerPortalServer";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/sanitize";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { logger } from "@/lib/logger";

const requestCodeSchema = z.object({
  tenant_slug: z.string().trim().min(1, "missing tenant_slug").max(100),
  email: z.string().trim().min(1, "missing email").max(254),
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "invalid last4")
    .optional(),
  phone_last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "invalid last4")
    .optional(),
});

function genCode6(): string {
  // 000000〜999999（先頭ゼロあり）
  const n = randomInt(1000000);
  return String(n).padStart(6, "0");
}

async function sendEmailResend(to: string, subject: string, html: string) {
  // OTP メール = P1 (顧客ログイン全断のリスク)。
  // sendEmail (Resend → SendGrid フォールバック) 経由で信頼性確保。
  const { sendEmail } = await import("@/lib/email/sendEmail");
  const result = await sendEmail({ to, subject, html });
  if (!result.ok) {
    console.error("[request-code] Email send failed", result.status, result.error);
    throw new Error(`email_failed:${result.status ?? "unknown"}`);
  }
}

export async function POST(req: Request) {
  try {
    // Rate limit: 5 OTP requests per IP per 5 minutes
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`otp:${ip}`, { limit: 5, windowSec: 300 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const parsed = requestCodeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const tenant_slug = parsed.data.tenant_slug;
    const last4Raw = parsed.data.last4 ?? parsed.data.phone_last4 ?? "";
    if (!last4Raw) return apiValidationError("missing last4");

    const email = normalizeEmail(parsed.data.email);

    // Generic success payload returned regardless of whether an OTP was
    // actually sent. Anti-enumeration: never let a caller distinguish
    // "tenant unknown" / "no matching cert" / "ok" by status code or body.
    // The audit (MEDIUM-1, 2026-05-03) calls out phone-last4 enumeration
    // (10000 combos) as the highest-risk customer-portal attack surface.
    const genericOk = apiJson({ ok: true }, { status: 200 });

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) {
      logger.info("customer/request-code: unknown tenant slug (silently noop)", { tenant_slug });
      return genericOk;
    }

    // Per-account limit: 3 OTP requests per (tenant+email) per 15 min.
    // Stops attackers who rotate IPs from spamming a single victim's inbox
    // and exhausting the per-OTP quota. Uses tenantId so the same email
    // address shared across tenants is bucketed independently.
    const accountKey = `otp-acct:${tenantId}:${email}`;
    const accountRl = await checkRateLimit(accountKey, { limit: 3, windowSec: 900 });
    if (!accountRl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "このアカウントへのコード再送回数が上限に達しました。" },
        { status: 429, headers: { "Retry-After": String(accountRl.retryAfterSec) } },
      );
    }

    let phoneHash = "";
    try {
      phoneHash = phoneLast4Hash(tenantId, last4Raw);
    } catch {
      return apiValidationError("hash_failed");
    }

    const ok = await tenantHasPhoneHash(tenantId, phoneHash);
    if (!ok) {
      logger.info("customer/request-code: no matching certificate (silently noop)", { tenantId });
      return genericOk;
    }

    const code = genCode6();
    const expires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();
    await createLoginCode(tenantId, email, phoneHash, code, expires);

    const baseUrl = resolveBaseUrl({ req });

    // URL does NOT include the code to prevent exposure in browser history,
    // server logs, and Referer headers
    const loginUrl =
      `${baseUrl}/customer/${tenant_slug}/login` +
      `?email=${encodeURIComponent(email)}` +
      `&last4=${encodeURIComponent(last4Raw)}`;

    const subject = "ログインコード（WEB施工証明書）";
    const safeUrl = escapeHtml(loginUrl);
    const safeCode = escapeHtml(code);
    const html =
      `<p>以下のコードをログイン画面で入力してください（${OTP_TTL_MIN}分以内に有効）。</p>` +
      `<div style="text-align: center; margin: 24px 0;">` +
      `<span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${safeCode}</span>` +
      `</div>` +
      `<p>上記のコードをログイン画面で入力してください。</p>` +
      `<p><a href="${safeUrl}">ログイン画面を開く</a></p>`;

    await sendEmailResend(email, subject, html);

    return genericOk;
  } catch (e: unknown) {
    return apiInternalError(e, "customer/request-code");
  }
}
