import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { mobileProgressEventSchema } from "@/lib/validations/mobile";
import { resolveProgressLabel, templateStepLabel } from "@/lib/workflow/progressLabel";

export const dynamic = "force-dynamic";

// ─── POST: Create customer-facing progress event ───
export async function POST(request: NextRequest, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:edit")) return apiForbidden();

    const { reservationId } = await params;

    const parsed = await parseJsonBody(request, mobileProgressEventSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // Look up reservation to get vehicle_id + current workflow step (label 補完用)
    const { data: reservation } = await caller.supabase
      .from("reservations")
      .select("id, vehicle_id, current_step_order, workflow_template_id")
      .eq("id", reservationId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return apiNotFound();
    if (!reservation.vehicle_id) {
      return apiValidationError("Reservation has no vehicle_id assigned");
    }

    // ラベル未指定なら現在の工程名から補完する (advance ルートと同様、写真だけで進捗を送れる)。
    let label = body.progress_label?.trim() ?? "";
    if (!label) {
      const currentStepOrder = reservation.current_step_order as number | null;
      let stepLogLabel: string | null = null;
      let tplLabel: string | null = null;
      if (currentStepOrder != null) {
        const { data: log } = await caller.supabase
          .from("reservation_step_logs")
          .select("step_label")
          .eq("reservation_id", reservationId)
          .eq("step_order", currentStepOrder)
          .maybeSingle();
        stepLogLabel = (log?.step_label as string | null) ?? null;
        if (!stepLogLabel && reservation.workflow_template_id) {
          const { data: tpl } = await caller.supabase
            .from("workflow_templates")
            .select("steps")
            .eq("id", reservation.workflow_template_id as string)
            .maybeSingle();
          tplLabel = templateStepLabel(tpl?.steps, currentStepOrder);
        }
      }
      label = resolveProgressLabel({ stepLogLabel, templateStepLabel: tplLabel });
    }

    const { data, error } = await caller.supabase
      .from("vehicle_histories")
      .insert({
        tenant_id: caller.tenantId,
        vehicle_id: reservation.vehicle_id,
        type: "progress_update",
        title: label,
        description: body.note ?? null,
        performed_at: new Date().toISOString(),
      })
      .select("id, vehicle_id, type, title, description, created_at")
      .single();

    if (error) return apiInternalError(error, "progress.create");

    return apiOk({ history: data }, 201);
  } catch (e) {
    return apiInternalError(e, "progress.create");
  }
}
