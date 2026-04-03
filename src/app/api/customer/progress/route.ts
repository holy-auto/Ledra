import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

type WorkflowStep = {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
};

/**
 * GET /api/customer/progress?tenant={slug}&reservation_id={id}
 * 顧客ポータル用 — 予約の進捗を返す（認証不要、公開API）
 * is_customer_visible なステップのみ公開
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get("tenant");
    const reservationId = url.searchParams.get("reservation_id");

    if (!tenantSlug || !reservationId) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }

    const supabase = getAdminClient();

    // テナント取得
    const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", tenantSlug).single();

    if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

    // 予約取得
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id, status, workflow_template_id, current_step_order, progress_pct")
      .eq("id", reservationId)
      .eq("tenant_id", tenant.id)
      .single();

    if (!reservation) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // テンプレート未設定の場合はシンプルなレスポンス
    if (!reservation.workflow_template_id) {
      const statusMap: Record<string, number> = {
        confirmed: 0,
        arrived: 25,
        in_progress: 60,
        completed: 100,
        cancelled: 0,
      };
      const statusLabelMap: Record<string, string> = {
        confirmed: "予約確定",
        arrived: "来店受付",
        in_progress: "施工中",
        completed: "施工完了",
        cancelled: "キャンセル",
      };

      return NextResponse.json({
        progress_pct: statusMap[reservation.status] ?? 0,
        current_step: { label: statusLabelMap[reservation.status] ?? reservation.status, started_at: null },
        steps: Object.entries(statusLabelMap)
          .filter(([k]) => k !== "cancelled")
          .map(([key, label], i) => ({
            label,
            status:
              statusMap[reservation.status] > i * 25
                ? "completed"
                : statusMap[reservation.status] === i * 25
                  ? "in_progress"
                  : "pending",
          })),
        estimated_completion: null,
        is_completed: reservation.status === "completed",
      });
    }

    // テンプレート取得
    const { data: template } = await supabase
      .from("workflow_templates")
      .select("steps")
      .eq("id", reservation.workflow_template_id)
      .single();

    if (!template) return NextResponse.json({ error: "template_not_found" }, { status: 404 });

    const allSteps = (template.steps ?? []) as WorkflowStep[];
    // 顧客可視ステップのみ
    const visibleSteps = allSteps.filter((s) => s.is_customer_visible);

    // ステップログ取得
    const { data: stepLogs } = await supabase
      .from("reservation_step_logs")
      .select("step_key, step_order, started_at, completed_at")
      .eq("reservation_id", reservationId)
      .order("step_order", { ascending: true });

    const logs = stepLogs ?? [];
    const currentOrder = reservation.current_step_order ?? 0;
    const isCompleted = reservation.status === "completed";

    // ステップの状態を算出
    const steps = visibleSteps.map((step) => {
      const log = logs.find((l) => l.step_key === step.key);
      let status: "completed" | "in_progress" | "pending";

      if (isCompleted || log?.completed_at != null) {
        status = "completed";
      } else if (step.order === currentOrder && log?.started_at) {
        status = "in_progress";
      } else if (step.order < currentOrder) {
        status = "completed";
      } else {
        status = "pending";
      }

      return {
        label: step.label,
        status,
        started_at: log?.started_at ?? null,
        completed_at: log?.completed_at ?? null,
      };
    });

    // 完了予定時刻算出
    let estimatedCompletion: string | null = null;
    if (!isCompleted && currentOrder > 0) {
      const remainingMins = allSteps
        .filter((s) => s.order > currentOrder)
        .reduce((sum, s) => sum + (s.estimated_min ?? 0), 0);
      if (remainingMins > 0) {
        const est = new Date();
        est.setMinutes(est.getMinutes() + remainingMins);
        estimatedCompletion = est.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      }
    }

    // 現在のステップ（顧客可視のもの）
    const currentLog = logs.find((l) => l.step_order === currentOrder && !l.completed_at);
    const currentVisibleStep = visibleSteps.find((s) => s.order === currentOrder);

    return NextResponse.json({
      progress_pct: reservation.progress_pct ?? 0,
      current_step: currentVisibleStep
        ? { label: currentVisibleStep.label, started_at: currentLog?.started_at ?? null }
        : null,
      steps,
      estimated_completion: estimatedCompletion,
      is_completed: isCompleted,
    });
  } catch (e: unknown) {
    console.error("[customer/progress] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
