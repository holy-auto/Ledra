import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { resolveBaseUrl } from "@/lib/url";
import {
  createLoginCode,
  getTenantIdBySlug,
  normalizeEmail,
  phoneLast4Hash,
  tenantHasPhoneHash,
} from "@/lib/customerPortalServer";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/sanitize";
import { apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

function genCode6(): string {
  // 000000〜999999（先頭ゼロあり）
  const n = randomInt(1000000);
  return String(n).padStart(6, "0");
}

async function sendEmailResend(to: string, subject: string, html: string) {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "").trim();

  if (!apiKey) throw new Error("missing RESEND_API_KEY");
  if (!from) throw new Error("missing RESEND_FROM");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[request-code] Resend failed", res.status, body);
    throw new Error(`resend_failed:${res.status}`);
  }
}

export async function POST(req: Request) {
  try {
    // Rate limit: 5 OTP requests per IP per 5 minutes
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`otp:${ip}`, { limit: 5, windowSec: 300 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await req.json().catch(() => ({}) as any);

    const tenant_slug = (body.tenant_slug ?? "").toString().trim();
    const emailRaw = (body.email ?? "").toString();
    const last4Raw = (body.last4 ?? body.phone_last4 ?? "").toString().trim();

    if (!tenant_slug) return apiValidationError("missing tenant_slug");
    if (!emailRaw) return apiValidationError("missing email");
    if (!last4Raw) return apiValidationError("missing last4");
    if (!/^\d{4}$/.test(last4Raw)) return apiValidationError("invalid last4");

    const email = normalizeEmail(emailRaw);

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");

    let phoneHash = "";
    try {
      phoneHash = phoneLast4Hash(tenantId, last4Raw);
    } catch {
      return apiValidationError("hash_failed");
    }

    const ok = await tenantHasPhoneHash(tenantId, phoneHash, last4Raw);
    if (!ok) return apiNotFound("no matching certificates");

    const code = genCode6();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分
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
      `<p>以下のコードをログイン画面で入力してください（10分以内に有効）。</p>` +
      `<div style="text-align: center; margin: 24px 0;">` +
      `<span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${safeCode}</span>` +
      `</div>` +
      `<p>上記のコードをログイン画面で入力してください。</p>` +
      `<p><a href="${safeUrl}">ログイン画面を開く</a></p>`;

    await sendEmailResend(email, subject, html);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return apiInternalError(e, "customer/request-code");
  }
}
