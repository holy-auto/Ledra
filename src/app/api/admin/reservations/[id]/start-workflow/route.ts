import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";

const startWorkflowSchema = z.object({
  workflow_template_id: z.string().uuid("workflow_template_id_required"),
});

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
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const parsed = startWorkflowSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { workflow_template_id: templateId } = parsed.data;

    // 予約確認
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id, status, workflow_template_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return apiNotFound("not_found");

    if (reservation.status === "completed" || reservation.status === "cancelled") {
      return apiValidationError("already_final");
    }

    // テンプレート確認（テナント所有 or プラットフォーム共通）
    const { data: template } = await supabase
      .from("workflow_templates")
      .select("id, steps")
      .eq("id", templateId)
      .or(`tenant_id.eq.${caller.tenantId},tenant_id.is.null`)
      .single();

    if (!template) {
      return apiNotFound("template_not_found");
    }

    const steps = (template.steps ?? []) as WorkflowStep[];
    if (steps.length === 0) {
      return apiValidationError("no_steps");
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
      .select(
        "id, tenant_id, status, workflow_template_id, current_step_order, current_step_key, progress_pct, created_at, updated_at",
      )
      .single();

    if (updateError) {
      return apiInternalError(updateError, "start-workflow update");
    }

    return apiJson({
      ok: true,
      reservation: updated,
      steps,
      message: `ワークフロー「${template.steps?.[0] ? steps[0].label : ""}」の準備ができました。「次へ」を押して開始してください。`,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "start-workflow POST");
  }
}
