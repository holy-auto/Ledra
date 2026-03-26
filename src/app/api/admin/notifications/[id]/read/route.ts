import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError, apiForbidden } from "@/lib/api/response";
import { hasPermission } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { enforceBilling } from "@/lib/billing/guard";

/**
 * PUT /api/admin/notifications/[id]/read
 * 通知を既読にする
 */
export async function PUT(_req: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const limited = await checkRateLimit(_req, "general");
  if (limited) return limited;

  try {
    const { id } = await params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role as Role, "announcements:view")) return apiForbidden();

    const billing = await enforceBilling(_req, { minPlan: "starter" });
    if (billing) return billing;

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);

    if (error) return apiInternalError(error, "mark notification read");

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiInternalError(e, "mark notification read");
  }
}
