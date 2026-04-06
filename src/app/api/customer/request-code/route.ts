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

    if (!tenant_slug) return apiValidationError("店舗情報が不足しています");
    if (!emailRaw) return apiValidationError("メールアドレスを入力してください");
    if (!last4Raw) return apiValidationError("電話番号下4桁を入力してください");
    if (!/^\d{4}$/.test(last4Raw)) return apiValidationError("電話番号下4桁は半角数字4桁で入力してください");

    const email = normalizeEmail(emailRaw);

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return apiNotFound("店舗が見つかりません");

    let phoneHash = "";
    try {
      phoneHash = phoneLast4Hash(tenantId, last4Raw);
    } catch {
      return apiValidationError("電話番号下4桁の処理に失敗しました");
    }

    const ok = await tenantHasPhoneHash(tenantId, phoneHash);
    if (!ok) return apiNotFound("該当する証明書が見つかりません。入力内容をご確認ください。");

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
