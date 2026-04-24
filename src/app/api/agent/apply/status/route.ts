import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * POST /api/agent/apply/status
 * Check agent application status by application number + email.
 * Both must match to prevent enumeration attacks.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`apply-status:${ip}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return apiJson(
      { error: "rate_limited", message: "しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { application_number?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return apiValidationError("invalid JSON");
  }

  const appNumber = (body.application_number ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();

  if (!appNumber || !email) {
    return apiValidationError("申請番号とメールアドレスを入力してください");
  }

  const supabase = createServiceRoleAdmin("agent apply flow — pre-tenant registration");
  const { data, error } = await supabase
    .from("agent_applications")
    .select("status, created_at, updated_at, rejection_reason")
    .eq("application_number", appNumber)
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return apiInternalError(error, "agent/apply/status");
  }

  if (!data) {
    return apiNotFound("該当する申請が見つかりません。申請番号とメールアドレスを確認してください。");
  }

  return apiJson({
    status: data.status,
    created_at: data.created_at,
    updated_at: data.updated_at,
    rejection_reason: data.rejection_reason,
  });
}
