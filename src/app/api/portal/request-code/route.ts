import { randomInt } from "crypto";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/sanitize";
import { resolveBaseUrl } from "@/lib/url";
import { GLOBAL_OTP_TTL_MIN, createGlobalLoginCode, listPortalMemberships } from "@/lib/customerPortalGlobal";
import { normalizeEmail, normalizeLast4 } from "@/lib/customerPortalServer";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { isResendFailure, sendResendEmail } from "@/lib/email/resendSend";
import { portalRequestCodeSchema } from "@/lib/validations/portal";

function genCode6() {
  const n = randomInt(1000000);
  return String(n).padStart(6, "0");
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`portal-otp:${ip}`, { limit: 5, windowSec: 300 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const parsed = portalRequestCodeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const email = normalizeEmail(parsed.data.email);
    let last4: string;
    try {
      last4 = normalizeLast4(parsed.data.phone_last4 ?? parsed.data.last4 ?? "");
    } catch {
      return apiValidationError("電話番号の下4桁を正しく入力してください。");
    }
    const preferredTenantSlug = parsed.data.preferred_tenant_slug ?? parsed.data.tenant ?? null;
    const from = parsed.data.from ?? "";
    const publicId = parsed.data.public_id ?? parsed.data.pid ?? "";

    const memberships = await listPortalMemberships(email, last4, preferredTenantSlug);
    if (memberships.length === 0) {
      return apiNotFound("ご利用情報が見つかりませんでした。");
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

    const sent = await sendResendEmail({
      to: email,
      subject,
      html,
      // OTP は毎回新鮮な code のため idempotency は効かせない
    });
    if (isResendFailure(sent)) {
      return apiInternalError(
        new Error(`resend_failed:${sent.status ?? "network"}:${sent.error}`),
        "portal/request-code",
      );
    }

    return apiJson({ ok: true, memberships_count: memberships.length });
  } catch (e: unknown) {
    return apiInternalError(e, "portal/request-code");
  }
}
