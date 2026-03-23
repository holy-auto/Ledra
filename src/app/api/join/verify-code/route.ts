import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/join/verify-code
 * Body: { email: string, code: string }
 * Verifies the OTP code sent to the email.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`join-verify:${ip}`, { limit: 10, windowSec: 600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "リクエストが多すぎます。しばらくお待ちください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const email = (body?.email ?? "").trim().toLowerCase();
  const code = (body?.code ?? "").trim();

  if (!email || !code) {
    return NextResponse.json(
      { error: "validation_error", message: "メールアドレスと確認コードを入力してください" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Find the latest unverified code for this email
  const { data: record, error: fetchErr } = await supabase
    .from("insurer_email_verifications")
    .select("id, code, expires_at, attempts")
    .eq("email", email)
    .eq("verified", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr || !record) {
    return NextResponse.json(
      { error: "code_not_found", message: "確認コードが見つかりません。再度コードを送信してください。" },
      { status: 400 },
    );
  }

  // Check expiry
  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "code_expired", message: "確認コードの有効期限が切れています。再度コードを送信してください。" },
      { status: 400 },
    );
  }

  // Check max attempts (5)
  if (record.attempts >= 5) {
    return NextResponse.json(
      { error: "too_many_attempts", message: "試行回数の上限に達しました。再度コードを送信してください。" },
      { status: 429 },
    );
  }

  // Increment attempts
  await supabase
    .from("insurer_email_verifications")
    .update({ attempts: record.attempts + 1 })
    .eq("id", record.id);

  // Verify code
  if (record.code !== code) {
    return NextResponse.json(
      { error: "invalid_code", message: "確認コードが正しくありません" },
      { status: 400 },
    );
  }

  // Mark as verified
  await supabase
    .from("insurer_email_verifications")
    .update({ verified: true })
    .eq("id", record.id);

  return NextResponse.json({ ok: true, verified: true });
}
