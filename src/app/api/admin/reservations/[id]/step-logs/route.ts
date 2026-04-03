import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reservations/{id}/step-logs
 * 予約のワークフローステップログ一覧を返す
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;

    // 予約の存在確認
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { data: stepLogs, error } = await supabase
      .from("reservation_step_logs")
      .select("id, step_key, step_order, step_label, started_at, completed_at, duration_sec, note")
      .eq("reservation_id", id)
      .order("step_order", { ascending: true });

    if (error) {
      console.error("[step-logs] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ step_logs: stepLogs ?? [] });
  } catch (e: unknown) {
    console.error("[step-logs] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
