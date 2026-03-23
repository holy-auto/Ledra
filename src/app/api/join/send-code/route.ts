import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { emailSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

function genCode6(): string {
  const n = Math.floor(Math.random() * 1000000);
  return String(n).padStart(6, "0");
}

async function sendEmailResend(to: string, code: string) {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "").trim();
  if (!apiKey || !from) throw new Error("missing email config");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #0071e3; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">CARTRUST 加盟店登録 - メール確認</h2>
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
        CARTRUST — 株式会社HOLY AUTO
      </div>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "【CARTRUST】メール確認コード",
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[join/send-code] Resend failed", res.status, body);
    throw new Error("email_send_failed");
  }
}

/**
 * POST /api/join/send-code
 * Body: { email: string }
 * Sends a 6-digit OTP code to the email for verification.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`join-code:${ip}`, { limit: 5, windowSec: 600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "リクエストが多すぎます。しばらくお待ちください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = emailSchema.safeParse((body as any)?.email);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: "有効なメールアドレスを入力してください" },
      { status: 400 },
    );
  }
  const email = parsed.data;

  const supabase = createAdminClient();

  // Check if email is already registered as auth user
  const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1 });
  const existing = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    return NextResponse.json(
      { error: "email_exists", message: "このメールアドレスは既に登録されています" },
      { status: 409 },
    );
  }

  // Invalidate old codes for this email
  await supabase
    .from("insurer_email_verifications")
    .update({ verified: true })
    .eq("email", email.toLowerCase())
    .eq("verified", false);

  // Generate and store code
  const code = genCode6();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const { error: insertErr } = await supabase
    .from("insurer_email_verifications")
    .insert({
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt,
      verified: false,
      attempts: 0,
    });

  if (insertErr) {
    console.error("[join/send-code] insert error:", insertErr.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // Send email
  try {
    await sendEmailResend(email, code);
  } catch (e) {
    console.error("[join/send-code] send error:", e);
    return NextResponse.json(
      { error: "email_send_failed", message: "メール送信に失敗しました。しばらくしてから再度お試しください。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: "確認コードを送信しました" });
}
