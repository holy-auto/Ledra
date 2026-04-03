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
import { sendProgressUpdate } from "@/lib/line/client";

export const dynamic = "force-dynamic";

type WorkflowStep = {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
};

const LEGACY_STATUS_FLOW = ["confirmed", "arrived", "in_progress", "completed"] as const;

function calcEstimatedCompletion(steps: WorkflowStep[], currentOrder: number): string | undefined {
  const remainingMins = steps.filter((s) => s.order > currentOrder).reduce((sum, s) => sum + (s.estimated_min ?? 0), 0);
  if (remainingMins <= 0) return undefined;
  const now = new Date();
  now.setMinutes(now.getMinutes() + remainingMins);
  return now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

/**
 * POST /api/mobile/reservations/{id}/advance
 * 1タップでワークフローの次ステップへ進む（モバイルアプリ用）
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "reservations:edit")) return apiForbidden();

    const { id } = await params;
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const note = body.note ? String(body.note) : null;

    // ─── 予約取得 ───
    const { data: reservation } = await caller.supabase
      .from("reservations")
      .select(
        "id, status, workflow_template_id, current_step_key, current_step_order, progress_pct, customer_id, vehicle_id, title",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return apiNotFound();

    if (reservation.status === "completed" || reservation.status === "cancelled") {
      return apiValidationError("この予約はすでに完了またはキャンセルされています");
    }

    // ─── テンプレート未設定: レガシーフロー ───
    if (!reservation.workflow_template_id) {
      const currentIdx = LEGACY_STATUS_FLOW.indexOf(reservation.status as (typeof LEGACY_STATUS_FLOW)[number]);
      if (currentIdx < 0 || currentIdx >= LEGACY_STATUS_FLOW.length - 1) {
        return apiValidationError("次のステップがありません");
      }
      const nextStatus = LEGACY_STATUS_FLOW[currentIdx + 1];
      const { data: updated, error } = await caller.supabase
        .from("reservations")
        .update({ status: nextStatus })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select()
        .single();
      if (error) return apiInternalError(error, "reservations.advance.legacy");
      return apiOk({ reservation: updated, legacy: true });
    }

    // ─── ワークフローテンプレート取得 ───
    const { data: template } = await caller.supabase
      .from("workflow_templates")
      .select("id, steps")
      .eq("id", reservation.workflow_template_id)
      .single();

    if (!template) return apiNotFound();

    const steps = (template.steps ?? []) as WorkflowStep[];
    const totalSteps = steps.length;
    if (totalSteps === 0) return apiValidationError("テンプレートにステップがありません");

    const currentOrder = reservation.current_step_order ?? 0;
    const nextOrder = currentOrder + 1;
    const isLastStep = nextOrder > totalSteps;
    const now = new Date();

    // ─── 現在ステップ完了記録 ───
    if (currentOrder > 0) {
      const { data: existingLog } = await caller.supabase
        .from("reservation_step_logs")
        .select("id, started_at")
        .eq("reservation_id", id)
        .eq("step_order", currentOrder)
        .maybeSingle();

      if (existingLog?.started_at) {
        const durationSec = Math.round((now.getTime() - new Date(existingLog.started_at).getTime()) / 1000);
        await caller.supabase
          .from("reservation_step_logs")
          .update({
            completed_at: now.toISOString(),
            duration_sec: durationSec,
            completed_by: caller.userId,
            note,
          })
          .eq("id", existingLog.id);
      }
    }

    // ─── 次ステップ処理 ───
    let nextStep: WorkflowStep | null = null;
    let newStatus = reservation.status as string;
    let progressPct = reservation.progress_pct ?? 0;

    if (!isLastStep) {
      nextStep = steps.find((s) => s.order === nextOrder) ?? null;
      if (!nextStep) return apiValidationError("次のステップが見つかりません");

      await caller.supabase.from("reservation_step_logs").upsert(
        {
          reservation_id: id,
          tenant_id: caller.tenantId,
          step_key: nextStep.key,
          step_order: nextStep.order,
          step_label: nextStep.label,
          started_at: now.toISOString(),
          completed_at: null,
          completed_by: null,
        },
        { onConflict: "reservation_id,step_key" },
      );

      progressPct = Math.round(((nextOrder - 1) / totalSteps) * 100);

      // マクロステータス遷移
      if (nextOrder === 1) newStatus = "arrived";
      else if (nextOrder >= 2 && newStatus === "arrived") newStatus = "in_progress";
    } else {
      progressPct = 100;
      newStatus = "completed";
    }

    // ─── 予約更新 ───
    const { data: updatedReservation, error: updateError } = await caller.supabase
      .from("reservations")
      .update({
        status: newStatus,
        current_step_key: nextStep?.key ?? reservation.current_step_key,
        current_step_order: isLastStep ? currentOrder : nextOrder,
        progress_pct: progressPct,
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, status, current_step_key, current_step_order, progress_pct")
      .single();

    if (updateError) return apiInternalError(updateError, "reservations.advance.update");

    // ─── 顧客公開イベント & LINE通知 ───
    const visibleStep = isLastStep ? steps.find((s) => s.order === currentOrder) : nextStep;

    if (visibleStep?.is_customer_visible && reservation.vehicle_id) {
      const historyLabel = isLastStep
        ? `施工が完了しました（${visibleStep.label}）`
        : `${visibleStep.label}を開始しました`;

      await caller.supabase.from("vehicle_histories").insert({
        tenant_id: caller.tenantId,
        vehicle_id: reservation.vehicle_id,
        reservation_id: id,
        label: historyLabel,
        note,
        is_public: true,
        created_by: caller.userId,
      });

      if (reservation.customer_id) {
        const { data: customer } = await caller.supabase
          .from("customers")
          .select("name, line_user_id")
          .eq("id", reservation.customer_id)
          .single();

        if (customer?.line_user_id) {
          const { data: tenant } = await caller.supabase
            .from("tenants")
            .select("name")
            .eq("id", caller.tenantId)
            .single();

          sendProgressUpdate({
            tenantId: caller.tenantId,
            lineUserId: customer.line_user_id,
            customerName: customer.name,
            tenantName: tenant?.name ?? "施工店",
            stepLabel: isLastStep ? "施工完了" : visibleStep.label,
            progressPct,
            currentStep: isLastStep ? totalSteps : nextOrder,
            totalSteps,
            estimatedCompletionTime: nextStep ? calcEstimatedCompletion(steps, nextOrder) : undefined,
            portalUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/customer/${caller.tenantId}`,
          }).catch(() => {});
        }
      }
    }

    return apiOk({
      reservation: updatedReservation,
      next_step: nextStep,
      is_completed: isLastStep,
    });
  } catch (e) {
    return apiInternalError(e, "reservations.advance");
  }
}
