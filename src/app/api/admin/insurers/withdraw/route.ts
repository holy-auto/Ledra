import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getClientIp } from "@/lib/rateLimit";

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
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { insurer_id, confirm } = body;

  if (!insurer_id) {
    return NextResponse.json({ error: "insurer_id is required" }, { status: 400 });
  }

  if (confirm !== true) {
    return NextResponse.json(
      { error: "confirmation_required", message: "confirm: true を指定して削除を確定してください" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Verify insurer exists
  const { data: insurer } = await admin
    .from("insurers")
    .select("id, name, stripe_subscription_id")
    .eq("id", insurer_id)
    .single();

  if (!insurer) {
    return NextResponse.json({ error: "insurer_not_found" }, { status: 404 });
  }

  // Warn if there's an active Stripe subscription
  if (insurer.stripe_subscription_id) {
    return NextResponse.json(
      {
        error: "active_subscription",
        message: "Stripeサブスクリプションが存在します。先にサブスクリプションをキャンセルしてください。",
        stripe_subscription_id: insurer.stripe_subscription_id,
      },
      { status: 400 },
    );
  }

  // Execute withdrawal via RPC (transactional)
  const { data: result, error: rpcError } = await admin.rpc("withdraw_insurer", {
    p_insurer_id: insurer_id,
  });

  if (rpcError) {
    console.error("[admin/insurers/withdraw] rpc error:", rpcError.message);
    return NextResponse.json(
      { error: "withdrawal_failed", message: rpcError.message },
      { status: 500 },
    );
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
