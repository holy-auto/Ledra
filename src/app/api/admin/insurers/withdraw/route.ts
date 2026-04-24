import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getClientIp } from "@/lib/rateLimit";
import { apiJson, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * POST /api/admin/insurers/withdraw
 * Complete withdrawal (deletion) of an insurer and all associated data.
 * Platform admin only. This is irreversible.
 *
 * Body: { insurer_id: string, confirm: boolean }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller || !isPlatformAdmin(caller)) {
    return apiForbidden();
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const { insurer_id, confirm } = body;

  if (!insurer_id) {
    return apiValidationError("insurer_id is required");
  }

  if (confirm !== true) {
    return apiValidationError("confirm: true を指定して削除を確定してください");
  }

  const { admin } = createTenantScopedAdmin(caller.tenantId);

  // Verify insurer exists
  const { data: insurer } = await admin
    .from("insurers")
    .select("id, name, stripe_subscription_id")
    .eq("id", insurer_id)
    .single();

  if (!insurer) {
    return apiNotFound("保険会社が見つかりません。");
  }

  // Warn if there's an active Stripe subscription
  if (insurer.stripe_subscription_id) {
    return apiValidationError("Stripeサブスクリプションが存在します。先にサブスクリプションをキャンセルしてください。");
  }

  // Execute withdrawal via RPC (transactional)
  const { data: result, error: rpcError } = await admin.rpc("withdraw_insurer", {
    p_insurer_id: insurer_id,
  });

  if (rpcError) {
    return apiInternalError(rpcError, "admin/insurers/withdraw");
  }

  // Audit log
  const ip = getClientIp(req);
  await admin.from("admin_audit_logs").insert({
    actor_id: caller.userId,
    action: "insurer_withdrawn",
    target_type: "insurer",
    target_id: insurer_id,
    before_data: { name: insurer.name },
    after_data: result,
    ip,
    user_agent: req.headers.get("user-agent") ?? null,
  });

  return apiJson({ ok: true, ...result });
}
