import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit as checkUpstashRateLimit } from "@/lib/api/rateLimit";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { joinSchemaV2, parseBody } from "@/lib/validation/schemas";
import { apiJson, apiValidationError, apiInternalError, apiError } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * POST /api/join
 * Full insurer self-registration via transactional RPC.
 *
 * Requires prior email verification via /api/join/send-code + /api/join/verify-code.
 *
 * Body: {
 *   email, password, company_name, contact_person, phone?,
 *   requested_plan, corporate_number?, address?, representative_name?,
 *   terms_accepted: boolean
 * }
 */
/**
 * B-M3 是正 (2026-09-08): 既に登録済みのメールで /api/join が呼ばれたときの案内。
 * ここに到達する時点で本人が OTP でメールを確認済みなので、素直にログイン案内でよい。
 */
async function notifyAlreadyRegisteredInsurer(email: string): Promise<void> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="color: #1d1d1f; line-height: 1.6;">
        このメールアドレスは既に Ledra 保険会社アカウントとして登録されています。
        新しいアカウントは作成されませんでした。
      </p>
      <p style="color: #1d1d1f; line-height: 1.6;">
        ログイン画面からログインしてください。パスワードをお忘れの場合は
        「パスワードを忘れた方」からリセットできます。
      </p>
    </div>
  `;
  const { sendEmail } = await import("@/lib/email/sendEmail");
  const result = await sendEmail({ to: email, subject: "【Ledra】このメールアドレスは登録済みです", html });
  if (!result.ok) {
    console.error("[insurer-register] already-registered notice send failed", result.status, result.error);
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: Upstash Redis (production) with in-memory fallback (dev)
  const upstashDeny = await checkUpstashRateLimit(req, "auth");
  if (upstashDeny) return upstashDeny;

  // Additional in-memory rate limit as defense-in-depth
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`join:${ip}`, { limit: 3, windowSec: 600 });
  if (!rl.allowed) {
    return apiJson(
      { error: "rate_limited", message: "登録リクエストが多すぎます。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return apiValidationError("invalid JSON");
  }

  // --- Zod validation ---
  const parsed = parseBody(joinSchemaV2, rawBody);
  if (!parsed.success) {
    return apiValidationError("validation_error", { details: parsed.errors });
  }

  const data = parsed.data;

  if (!data.terms_accepted) {
    return apiValidationError("利用規約への同意が必要です");
  }

  const supabase = createServiceRoleAdmin("join flow — pre-auth invitation / verification");

  // Verify that email was confirmed via OTP.
  //
  // G-H2 是正 (2026-09-08): `expires_at > now()` を追加。verify-code は
  // 期限内のコードにのみ verified=true を立てるが、確認から登録完了までの
  // 間隔に制限が無いと「確認済み」フラグが無期限に使い回せてしまう。
  // 元のコード有効期間 (10分) と同じ枠に登録完了を要求する。
  const { data: verification } = await supabase
    .from("insurer_email_verifications")
    .select("id, verified")
    .eq("email", data.email.toLowerCase())
    .eq("verified", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!verification) {
    return apiValidationError("メールアドレスの確認が完了していません。確認コードを入力してください。");
  }

  // Validate corporate number format if provided
  if (data.corporate_number) {
    const { isValidCorporateNumber } = await import("@/lib/insurer/corporateNumber");
    if (!isValidCorporateNumber(data.corporate_number)) {
      return apiValidationError("法人番号の形式が正しくありません（13桁の数字）");
    }

    // Check for duplicate corporate number
    const { data: existing } = await supabase
      .from("insurers")
      .select("id")
      .eq("corporate_number", data.corporate_number.replace(/[-\s]/g, ""))
      .limit(1)
      .maybeSingle();

    if (existing) {
      return apiError({ code: "conflict", message: "この法人番号は既に登録されています", status: 409 });
    }
  }

  // --- Hybrid approach: create auth user via SDK, then insurer data via RPC ---
  // This avoids direct INSERT into auth.users (fragile on Supabase upgrades)
  // and keeps insurer+insurer_users creation atomic in one RPC.

  // Step 1: Create auth user via Supabase Admin SDK
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true, // OTP was already verified
    user_metadata: { display_name: data.contact_person },
  });

  if (authError) {
    const msg = authError.message ?? "";
    console.error("[insurer-register] auth.createUser error:", msg);

    if (msg.includes("already been registered") || msg.includes("already exists")) {
      // B-M3 是正 (2026-09-08): 409 は他の未登録失敗（バリデーション等）と区別できてしまう。
      // ここに到達する時点で OTP 検証済み（本人がこのメールを所有している証明）なので
      // 第三者への漏洩リスクは無いが、send-code/signup と挙動を揃え、一律 200 のうえで
      // 本人にログイン案内を送る（フロントは成功後 signInWithPassword を試み、
      // 失敗すれば「登録完了」画面に落ちる — signup と同じ経路）。
      notifyAlreadyRegisteredInsurer(data.email).catch((e) =>
        console.error("[insurer-register] already-registered notice failed:", e),
      );
      return apiJson({ ok: true });
    }

    return apiInternalError(authError, "insurer-register auth");
  }

  const userId = authData.user.id;

  // Step 2: Create insurer + insurer_users via RPC (atomic)
  const { data: result, error: rpcError } = await supabase.rpc("create_insurer_for_user", {
    p_user_id: userId,
    p_company_name: data.company_name,
    p_contact_person: data.contact_person,
    p_email: data.email,
    p_phone: data.phone || "",
    p_requested_plan: data.requested_plan,
    p_corporate_number: data.corporate_number || null,
    p_address: data.address || null,
    p_representative_name: data.representative_name || null,
    p_terms_accepted: data.terms_accepted,
    p_referral_code: data.referral_code || null,
    p_agency_id: data.agency_id || null,
    p_business_type: data.business_type || "corporation",
  });

  if (rpcError) {
    const msg = rpcError.message ?? "";
    console.error("[insurer-register] RPC error, rolling back auth user:", msg);

    // Rollback: delete the auth user we just created
    await supabase.auth.admin
      .deleteUser(userId)
      .catch((err: unknown) => console.error("[insurer-register] rollback deleteUser failed:", err));

    return apiInternalError(rpcError, "insurer-register RPC");
  }

  // Step 3: Consume the email verification token (one-time use)
  await supabase
    .from("insurer_email_verifications")
    .delete()
    .eq("email", data.email.toLowerCase())
    .eq("verified", true);

  return apiJson(
    {
      ok: true,
      insurer_id: result?.insurer_id,
    },
    { status: 201 },
  );
}
