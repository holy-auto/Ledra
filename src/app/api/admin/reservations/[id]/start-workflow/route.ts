import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

type WorkflowStep = {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
};

/**
 * POST /api/admin/reservations/{id}/start-workflow
 * ワークフローテンプレートを予約に紐付け、最初のステップを開始する
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const templateId = String(body.workflow_template_id ?? "").trim();
    if (!templateId) {
      return NextResponse.json({ error: "workflow_template_id_required" }, { status: 400 });
    }

    // 予約確認
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id, status, workflow_template_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (reservation.status === "completed" || reservation.status === "cancelled") {
      return NextResponse.json({ error: "already_final" }, { status: 400 });
    }

    // テンプレート確認（テナント所有 or プラットフォーム共通）
    const { data: template } = await supabase
      .from("workflow_templates")
      .select("id, steps")
      .eq("id", templateId)
      .or(`tenant_id.eq.${caller.tenantId},tenant_id.is.null`)
      .single();

    if (!template) {
      return NextResponse.json({ error: "template_not_found" }, { status: 404 });
    }

    const steps = (template.steps ?? []) as WorkflowStep[];
    if (steps.length === 0) {
      return NextResponse.json({ error: "no_steps" }, { status: 400 });
    }

    // テンプレートを予約に設定
    const { data: updated, error: updateError } = await supabase
      .from("reservations")
      .update({
        workflow_template_id: templateId,
        current_step_order: 0,
        progress_pct: 0,
        current_step_key: null,
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (updateError) {
      console.error("[start-workflow] update_failed:", updateError.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reservation: updated,
      steps,
      message: `ワークフロー「${template.steps?.[0] ? steps[0].label : ""}」の準備ができました。「次へ」を押して開始してください。`,
    });
  } catch (e: unknown) {
    console.error("[start-workflow] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
