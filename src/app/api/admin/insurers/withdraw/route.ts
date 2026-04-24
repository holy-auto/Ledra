import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getClientIp } from "@/lib/rateLimit";
import { apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

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

  const schema = z.object({
    insurer_id: z.string().uuid("insurer_id is required"),
    confirm: z.literal(true, { message: "confirm: true を指定して削除を確定してください" }),
  });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { insurer_id } = parsed.data;

  const admin = createAdminClient();

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

  return NextResponse.json({ ok: true, ...result });
}
