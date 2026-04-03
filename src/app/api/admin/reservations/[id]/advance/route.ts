import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { sendProgressUpdate } from "@/lib/line/client";

export const dynamic = "force-dynamic";

type WorkflowStep = {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
};

// レガシーな4ステップフロー（テンプレート未設定時のフォールバック）
const LEGACY_STATUS_FLOW = ["confirmed", "arrived", "in_progress", "completed"] as const;

function calcMacroStatus(stepOrder: number, totalSteps: number, isCompleting: boolean): string | null {
  if (isCompleting && stepOrder === 1) return "arrived";
  if (!isCompleting && stepOrder >= 2) return "in_progress";
  if (isCompleting && stepOrder === totalSteps) return "completed";
  return null;
}

function calcEstimatedCompletion(steps: WorkflowStep[], currentOrder: number): string | undefined {
  const remainingMins = steps.filter((s) => s.order > currentOrder).reduce((sum, s) => sum + (s.estimated_min ?? 0), 0);

  if (remainingMins <= 0) return undefined;

  const now = new Date();
  now.setMinutes(now.getMinutes() + remainingMins);
  return now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

/**
 * POST /api/admin/reservations/{id}/advance
 * 現在の作業ステップを完了し、次のステップへ進む（1タップ進行）
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const note = body.note ? String(body.note) : null;

    // ─── 予約取得 ───
    const { data: reservation } = await supabase
      .from("reservations")
      .select(
        "id, status, workflow_template_id, current_step_key, current_step_order, progress_pct, customer_id, vehicle_id, title",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (reservation.status === "completed" || reservation.status === "cancelled") {
      return NextResponse.json(
        { error: "already_final", message: "この予約はすでに完了またはキャンセルされています" },
        { status: 400 },
      );
    }

    // ─── テンプレート未設定: レガシーフロー ───
    if (!reservation.workflow_template_id) {
      const currentIdx = LEGACY_STATUS_FLOW.indexOf(reservation.status as (typeof LEGACY_STATUS_FLOW)[number]);
      if (currentIdx < 0 || currentIdx >= LEGACY_STATUS_FLOW.length - 1) {
        return NextResponse.json({ error: "no_next_step" }, { status: 400 });
      }
      const nextStatus = LEGACY_STATUS_FLOW[currentIdx + 1];
      const { data: updated, error } = await supabase
        .from("reservations")
        .update({ status: nextStatus })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
      return NextResponse.json({ ok: true, reservation: updated, legacy: true });
    }

    // ─── ワークフローテンプレート取得 ───
    const { data: template } = await supabase
      .from("workflow_templates")
      .select("id, steps")
      .eq("id", reservation.workflow_template_id)
      .single();

    if (!template) return NextResponse.json({ error: "template_not_found" }, { status: 404 });

    const steps = (template.steps ?? []) as WorkflowStep[];
    const totalSteps = steps.length;
    if (totalSteps === 0) return NextResponse.json({ error: "no_steps" }, { status: 400 });

    const currentOrder = reservation.current_step_order ?? 0;
    const nextOrder = currentOrder + 1;
    const isLastStep = nextOrder > totalSteps;

    // ─── 現在のステップを完了 ───
    const now = new Date();

    if (currentOrder > 0) {
      // step_logの完了を記録
      const { data: existingLog } = await supabase
        .from("reservation_step_logs")
        .select("id, started_at")
        .eq("reservation_id", id)
        .eq("step_order", currentOrder)
        .maybeSingle();

      if (existingLog?.started_at) {
        const startedAt = new Date(existingLog.started_at);
        const durationSec = Math.round((now.getTime() - startedAt.getTime()) / 1000);
        await supabase
          .from("reservation_step_logs")
          .update({
            completed_at: now.toISOString(),
            duration_sec: durationSec,
            completed_by: caller.userId,
            note: note,
          })
          .eq("id", existingLog.id);
      }
    }

    // ─── 次ステップの処理 ───
    let nextStep: WorkflowStep | null = null;
    let newStatus = reservation.status;
    let progressPct = reservation.progress_pct ?? 0;

    if (!isLastStep) {
      nextStep = steps.find((s) => s.order === nextOrder) ?? null;
      if (!nextStep) return NextResponse.json({ error: "step_not_found" }, { status: 400 });

      // 次ステップのlog挿入
      await supabase.from("reservation_step_logs").upsert(
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
      const macro = calcMacroStatus(nextOrder, totalSteps, false);
      if (macro) newStatus = macro;
    } else {
      // 最終ステップ完了
      progressPct = 100;
      newStatus = "completed";
    }

    // ─── 予約更新 ───
    const { data: updatedReservation, error: updateError } = await supabase
      .from("reservations")
      .update({
        status: newStatus,
        current_step_key: nextStep?.key ?? reservation.current_step_key,
        current_step_order: isLastStep ? currentOrder : nextOrder,
        progress_pct: progressPct,
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, status, current_step_key, current_step_order, progress_pct, customer_id, vehicle_id, title")
      .single();

    if (updateError) {
      console.error("[advance] update_failed:", updateError.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    // ─── 顧客公開イベント書き込み & LINE通知 ───
    const currentStepForHistory = isLastStep ? steps.find((s) => s.order === currentOrder) : nextStep;

    if (currentStepForHistory?.is_customer_visible && reservation.vehicle_id) {
      const historyLabel = isLastStep
        ? `施工が完了しました（${currentStepForHistory.label}）`
        : `${currentStepForHistory.label}を開始しました`;

      // vehicle_histories に記録（顧客ポータル表示用）
      await supabase.from("vehicle_histories").insert({
        tenant_id: caller.tenantId,
        vehicle_id: reservation.vehicle_id,
        reservation_id: id,
        label: historyLabel,
        note: note,
        is_public: true,
        created_by: caller.userId,
      });

      // LINE通知（顧客にline_user_idがあれば送信）
      if (reservation.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("name, line_user_id")
          .eq("id", reservation.customer_id)
          .single();

        if (customer?.line_user_id) {
          const { data: tenant } = await supabase.from("tenants").select("name").eq("id", caller.tenantId).single();

          const estimatedCompletion = nextStep ? calcEstimatedCompletion(steps, nextOrder) : undefined;

          const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/customer/${caller.tenantId}`;

          // fire-and-forget（LINE通知失敗してもメイン処理は継続）
          sendProgressUpdate({
            tenantId: caller.tenantId,
            lineUserId: customer.line_user_id,
            customerName: customer.name,
            tenantName: tenant?.name ?? "施工店",
            stepLabel: isLastStep ? "施工完了" : currentStepForHistory.label,
            progressPct,
            currentStep: isLastStep ? totalSteps : nextOrder,
            totalSteps,
            estimatedCompletionTime: estimatedCompletion,
            portalUrl,
          }).catch(() => {});
        }
      }
    }

    return NextResponse.json({
      ok: true,
      reservation: updatedReservation,
      next_step: nextStep,
      is_completed: isLastStep,
    });
  } catch (e: unknown) {
    console.error("[reservations/advance] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
