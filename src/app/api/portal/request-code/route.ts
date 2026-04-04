import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/sanitize";
import { resolveBaseUrl } from "@/lib/url";
import { GLOBAL_OTP_TTL_MIN, createGlobalLoginCode, listPortalMemberships } from "@/lib/customerPortalGlobal";
import { normalizeEmail, normalizeLast4 } from "@/lib/customerPortalServer";

function genCode6() {
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
    console.error("[portal/request-code] Resend failed", res.status, body);
    throw new Error(`resend_failed:${res.status}`);
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`portal-otp:${ip}`, { limit: 5, windowSec: 300 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const email = normalizeEmail(String(body.email ?? ""));
    const last4 = normalizeLast4(String(body.phone_last4 ?? body.last4 ?? ""));
    const preferredTenantSlug = String(body.preferred_tenant_slug ?? body.tenant ?? "").trim() || null;
    const from = String(body.from ?? "").trim();
    const publicId = String(body.public_id ?? body.pid ?? "").trim();

    if (!email.includes("@")) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

    const memberships = await listPortalMemberships(email, last4, preferredTenantSlug);
    if (memberships.length === 0) {
      return NextResponse.json({ error: "not_found", message: "ご利用情報が見つかりませんでした。" }, { status: 404 });
    }

    const code = genCode6();
    const expires = new Date(Date.now() + GLOBAL_OTP_TTL_MIN * 60 * 1000).toISOString();
    await createGlobalLoginCode(email, last4, code, expires);

    const baseUrl = resolveBaseUrl({ req });
    const params = new URLSearchParams({ email, last4 });
    if (preferredTenantSlug) params.set("tenant", preferredTenantSlug);
    if (from) params.set("from", from);
    if (publicId) params.set("pid", publicId);
    const verifyUrl = `${baseUrl}/my/verify?${params.toString()}`;

    const safeUrl = escapeHtml(verifyUrl);
    const safeCode = escapeHtml(code);
    const subject = "ログインコード（Ledra マイページ）";
    const html =
      `<p>以下のコードをマイページのログイン画面で入力してください（${GLOBAL_OTP_TTL_MIN}分以内に有効）。</p>` +
      `<div style=\"text-align:center;margin:24px 0;\">` +
      `<span style=\"font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace;\">${safeCode}</span>` +
      `</div>` +
      `<p><a href=\"${safeUrl}\">確認コード入力画面を開く</a></p>`;

    await sendEmailResend(email, subject, html);

    return NextResponse.json({ ok: true, memberships_count: memberships.length });
  } catch (e: any) {
    console.error("portal request-code error", e);
    return NextResponse.json({ error: e?.message ?? "request-code failed" }, { status: 500 });
  }
}
