import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

const applyStatusSchema = z.object({
  application_number: z.string().trim().min(1, "申請番号とメールアドレスを入力してください").max(100),
  email: z.string().trim().toLowerCase().email("申請番号とメールアドレスを入力してください").max(254),
});

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

  const parsed = applyStatusSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { application_number: appNumber, email } = parsed.data;

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
