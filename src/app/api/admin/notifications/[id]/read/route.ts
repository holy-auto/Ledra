import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

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
