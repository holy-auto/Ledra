import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { issueEmailOtp } from "@/lib/auth/emailOtp";
import { sendEmail } from "@/lib/email/sendEmail";
import { escapeHtml } from "@/lib/sanitize";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/otp/request
 *
 * サインアップ直後のメール確認用 OTP を発行・送信する（初回送信・再送信を兼ねる）。
 * モバイルのサインアップ (`/(auth)/signup.tsx`) はパスワードでアカウント作成後
 * そのままサインインしているため、この時点で既に Bearer 認証済み。email は
 * クライアントの自己申告ではなく、Bearer から解決した本人の auth.users.email を使う。
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    // OTP / メール送信を伴うフローのブルートフォース・スパム対策 (5 req / 300s)。
    // verify 側とは別バケット (identifier に用途を含める) にする — 同じ userId・同じ
    // preset を共有すると、初回自動送信+間違い3回+再送信1回の通常の signup フローだけで
    // 5回に達し、正規ユーザーが打ち間違えただけで両エンドポイントとも 429 になってしまう。
    const limited = await checkRateLimit(request, "sensitive", `otp-request:${caller.userId}`);
    if (limited) return limited;

    const admin = createServiceRoleAdmin("mobile:auth-otp-request — signup email verification");

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(caller.userId);
    const email = userRes?.user?.email;
    if (userErr || !email) {
      return apiInternalError(userErr ?? new Error("email not found"), "mobile.auth.otp.request: user lookup");
    }

    const code = await issueEmailOtp(admin, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      email,
      purpose: "mobile_signup",
    });

    const safeCode = escapeHtml(code);
    const html =
      `<p>以下の確認コードをアプリに入力してください（5分以内に有効）。</p>` +
      `<div style="text-align: center; margin: 24px 0;">` +
      `<span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${safeCode}</span>` +
      `</div>` +
      `<p>心当たりがない場合はこのメールを破棄してください。</p>`;

    const result = await sendEmail({ to: email, subject: "確認コード（Ledra）", html });
    if (!result.ok) {
      return apiInternalError(new Error(result.error), "mobile.auth.otp.request: email send");
    }

    return apiOk({ sent: true });
  } catch (e) {
    return apiInternalError(e, "mobile.auth.otp.request");
  }
}
