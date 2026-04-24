import { NextResponse } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { sha256Hex } from "@/lib/customerPortalServer";
import { apiJson, apiValidationError } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * POST /api/join/verify-code
 * Body: { email: string, code: string }
 * Verifies the OTP code sent to the email.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`join-verify:${ip}`, { limit: 10, windowSec: 600 });
  if (!rl.allowed) {
    return apiJson(
      { error: "rate_limited", message: "リクエストが多すぎます。しばらくお待ちください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("invalid JSON");
  }

  const email = (body?.email ?? "").trim().toLowerCase();
  const code = (body?.code ?? "").trim();

  if (!email || !code) {
    return apiValidationError("メールアドレスと確認コードを入力してください");
  }

  const supabase = createServiceRoleAdmin("join flow — pre-auth invitation / verification");

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
    return apiValidationError("確認コードが見つかりません。再度コードを送信してください。");
  }

  // Check expiry
  if (new Date(record.expires_at) < new Date()) {
    return apiValidationError("確認コードの有効期限が切れています。再度コードを送信してください。");
  }

  // Check max attempts (5)
  if (record.attempts >= 5) {
    return apiJson(
      { error: "too_many_attempts", message: "試行回数の上限に達しました。再度コードを送信してください。" },
      { status: 429 },
    );
  }

  // Increment attempts
  await supabase
    .from("insurer_email_verifications")
    .update({ attempts: record.attempts + 1 })
    .eq("id", record.id);

  // Verify code (compare hashed)
  const codeHash = sha256Hex(`insurer-otp|v1|${email}|${code}`);
  if (record.code !== codeHash) {
    return apiValidationError("確認コードが正しくありません");
  }

  // Mark as verified
  await supabase.from("insurer_email_verifications").update({ verified: true }).eq("id", record.id);

  return apiJson({ ok: true, verified: true });
}
