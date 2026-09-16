

import { apiJson, apiNotFound, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reservations/{id}/step-logs
 * 予約のワークフローステップログ一覧を返す
 */
export const GET = withCaller<{ id: string }>(
  async (_req, { caller, supabase, params }) => {
    try {

      const { id } = params;

      // 予約の存在確認
      const { data: reservation } = await supabase
        .from("reservations")
        .select("id")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .single();

      if (!reservation) return apiNotFound("not_found");

      const { data: stepLogs, error } = await supabase
        .from("reservation_step_logs")
        .select("id, step_key, step_order, step_label, started_at, completed_at, duration_sec, note")
        .eq("reservation_id", id)
        .order("step_order", { ascending: true });

      if (error) {
        return apiInternalError(error, "step-logs list");
      }

      return apiJson({ step_logs: stepLogs ?? [] });
    } catch (e: unknown) {
      return apiInternalError(e, "step-logs GET");
    }
  },
  { routeName: "admin/reservations/[id]/step-logs GET" },
);
