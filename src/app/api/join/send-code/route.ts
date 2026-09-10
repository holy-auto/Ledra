import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { emailSchema } from "@/lib/validation/schemas";
import { sha256Hex } from "@/lib/customerPortalServer";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";

/** Generate a cryptographically secure 6-digit OTP code */
function genCode6(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

async function sendEmailResend(to: string, code: string) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #0071e3; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">Ledra 加盟店登録 - メール確認</h2>
      </div>
      <p style="color: #1d1d1f; line-height: 1.6;">
        加盟店登録のメール確認コードをお送りします。<br>
        以下のコードを入力画面に入力してください。
      </p>
      <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1d1d1f;">${code}</span>
      </div>
      <p style="color: #86868b; font-size: 13px;">
        このコードは10分間有効です。<br>
        心当たりのない場合は、このメールを無視してください。
      </p>
      <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
        Ledra — 株式会社HOLY
      </div>
    </div>
  `;

  const { sendEmail } = await import("@/lib/email/sendEmail");
  const result = await sendEmail({
    to,
    subject: "【Ledra】メール確認コード",
    html,
  });
  if (!result.ok) {
    console.error("[join/send-code] Email send failed", result.status, result.error);
    throw new Error("email_send_failed");
  }
}

/**
 * B-M3 是正 (2026-09-08): 既に登録済みのメールへ send-code が呼ばれたときの案内。
 * OTP は発行せず、本人にだけログイン案内を送る。
 */
async function sendAlreadyRegisteredNotice(to: string): Promise<void> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="color: #1d1d1f; line-height: 1.6;">
        このメールアドレスで Ledra 加盟店登録の確認コード発行が試みられましたが、
        既にアカウントが存在するため確認コードは発行されませんでした。
      </p>
      <p style="color: #1d1d1f; line-height: 1.6;">
        心当たりがある場合は、ログイン画面からログインしてください。
      </p>
      <p style="color: #86868b; font-size: 13px;">
        心当たりのない場合は、このメールを無視してください。
      </p>
    </div>
  `;
  const { sendEmail } = await import("@/lib/email/sendEmail");
  const result = await sendEmail({ to, subject: "【Ledra】このメールアドレスは登録済みです", html });
  if (!result.ok) {
    console.error("[join/send-code] already-registered notice failed", result.status, result.error);
  }
}

/**
 * POST /api/join/send-code
 * Body: { email: string }
 * Sends a 6-digit OTP code to the email for verification.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);

  // IP-based rate limit: 5 requests per 10 minutes
  const rl = await checkRateLimit(`join-code:${ip}`, { limit: 5, windowSec: 600 });
  if (!rl.allowed) {
    return apiJson(
      { error: "rate_limited", message: "リクエストが多すぎます。しばらくお待ちください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("invalid JSON");
  }

  const parsed = emailSchema.safeParse((body as { email?: unknown } | null)?.email);
  if (!parsed.success) {
    return apiValidationError("有効なメールアドレスを入力してください");
  }
  const email = parsed.data;

  // Email-based rate limit: 3 codes per 10 minutes per email address
  const emailRl = await checkRateLimit(`join-code-email:${email}`, { limit: 3, windowSec: 600 });
  if (!emailRl.allowed) {
    return apiJson(
      { error: "rate_limited", message: "このメールアドレスへの送信が多すぎます。しばらくお待ちください。" },
      { status: 429, headers: { "Retry-After": String(emailRl.retryAfterSec) } },
    );
  }

  const supabase = createServiceRoleAdmin("join flow — pre-auth invitation / verification");

  // Check if email is already registered via security-definer RPC
  // (listUsers API only returns page 1, so we use a direct auth.users query)
  const { data: emailExists } = await supabase.rpc("check_auth_email_exists", {
    p_email: email,
  });
  if (emailExists === true) {
    // B-M3 是正 (2026-09-08): 409 で「登録済み」を返すと、任意のメールを送るだけで
    // 保険会社アカウントの存在有無を列挙できる（列挙オラクル）。OTP を発行せず、
    // 未登録時と見分けの付かない成功レスポンスを返し、本人にだけメールで案内する。
    // タイミングで区別できないよう送信を待ち合わせる。
    await sendAlreadyRegisteredNotice(email);
    return apiJson({ ok: true, message: "確認コードを送信しました" });
  }

  // Invalidate old codes for this email by expiring them immediately.
  //
  // G-H2 是正 (2026-09-08): 以前はここで `verified: true` を立てていたが、
  // `verified` は「本人がコードを正しく入力して確認済み」を表す列でもあり、
  // 「古いコードを無効化した」という別の意味に流用していた。
  // send-code を2回叩くだけで1回目の行が verified=true になり、
  // 一度もコードを入力せずに /api/join の確認済み判定を通過できた
  // (join は `verified=true` の行があるかしか見ていない)。
  // 無効化は「もう使えない」ことだけを表す expires_at の更新に閉じる。
  await supabase
    .from("insurer_email_verifications")
    .update({ expires_at: new Date().toISOString() })
    .eq("email", email.toLowerCase())
    .eq("verified", false);

  // Generate and store code
  const code = genCode6();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const { error: insertErr } = await supabase.from("insurer_email_verifications").insert({
    email: email.toLowerCase(),
    code: sha256Hex(`insurer-otp|v1|${email.toLowerCase()}|${code}`),
    expires_at: expiresAt,
    verified: false,
    attempts: 0,
  });

  if (insertErr) {
    return apiInternalError(insertErr, "join/send-code insert");
  }

  // Send email
  try {
    await sendEmailResend(email, code);
  } catch (e) {
    return apiInternalError(e, "join/send-code email send");
  }

  return apiJson({ ok: true, message: "確認コードを送信しました" });
}
