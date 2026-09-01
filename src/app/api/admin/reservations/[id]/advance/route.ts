import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { sendProgressUpdate } from "@/lib/line/client";
import { sendProgressCompletionReliable } from "@/lib/line/clientWithRetry";
import { syncCreateEvent, syncUpdateEvent } from "@/lib/gcal/client";
import {
  apiJson,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiForbidden,
} from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { runStepAutomationOnReach } from "@/lib/workflow/stepAutomations";
import { maybeAutoDraftCertificateForReservation } from "@/lib/ai/automation/certificateAuto";
import { maybeAutoCreateDraftCertificateForReservation } from "@/lib/ai/automation/certificateRecordAuto";
import { maybeAutoCreateDraftInvoiceForReservation } from "@/lib/ai/automation/invoiceRecordAuto";
import { maybeAutoNextActionForReservation } from "@/lib/ai/automation/nextActionAuto";

/** advance() 後に GCal イベントを作成/更新する (advance は cancelled への遷移が無いため削除分岐は不要)。 */
function syncGcalAfterAdvance(
  tenantId: string,
  reservation: {
    id: string;
    title: string | null;
    scheduled_date: string;
    start_time: string | null;
    end_time: string | null;
    note: string | null;
    gcal_event_id: string | null;
  },
): void {
  const payload = {
    id: reservation.id,
    title: reservation.title ?? "",
    scheduled_date: reservation.scheduled_date,
    start_time: reservation.start_time,
    end_time: reservation.end_time,
    note: reservation.note,
  };
  const sync = reservation.gcal_event_id
    ? syncUpdateEvent(tenantId, { ...payload, gcal_event_id: reservation.gcal_event_id })
    : syncCreateEvent(tenantId, payload);
  sync.catch((error) =>
    logger.warn("[advance] gcal sync failed (non-blocking)", {
      error,
      tenantId,
      reservationId: reservation.id,
    }),
  );
}

const advanceSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
});

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
  // 最終ステップ完了時は呼び出し側で "completed" を直接設定するため、ここでは主に
  // 次ステップへ進む場合（isCompleting=false）のマクロステータス遷移を決める。
  if (!isCompleting && stepOrder === 1) return "arrived"; // 来店
  if (!isCompleting && stepOrder >= 2 && stepOrder < totalSteps) return "in_progress";
  if (!isCompleting && stepOrder === totalSteps) return "in_progress"; // 最終ステップ進行中
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
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "reservations:edit")) return apiForbidden();

    const { id } = await params;
    const parsed = advanceSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const note = parsed.data.note ?? null;

    // ─── 予約取得 ───
    const { data: reservation } = await supabase
      .from("reservations")
      .select(
        "id, status, workflow_template_id, current_step_key, current_step_order, progress_pct, customer_id, vehicle_id, title, work_started_at, work_completed_at, gcal_event_id, scheduled_date, start_time, end_time, note",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!reservation) return apiNotFound("not_found");
    if (reservation.status === "completed" || reservation.status === "cancelled") {
      return apiValidationError("この予約はすでに完了またはキャンセルされています");
    }

    // ─── テンプレート未設定: レガシーフロー ───
    if (!reservation.workflow_template_id) {
      const currentIdx = LEGACY_STATUS_FLOW.indexOf(reservation.status as (typeof LEGACY_STATUS_FLOW)[number]);
      if (currentIdx < 0 || currentIdx >= LEGACY_STATUS_FLOW.length - 1) {
        return apiValidationError("no_next_step");
      }
      const nextStatus = LEGACY_STATUS_FLOW[currentIdx + 1];
      const nowIso = new Date().toISOString();
      // 作業タイマー: PUT /api/admin/reservations と同じ規約 (未設定のときだけ埋める)。
      const legacyTimerUpdates: Record<string, string> = {};
      if (nextStatus === "in_progress" && !reservation.work_started_at) {
        legacyTimerUpdates.work_started_at = nowIso;
      }
      if (nextStatus === "completed") {
        if (!reservation.work_started_at) legacyTimerUpdates.work_started_at = nowIso;
        if (!reservation.work_completed_at) legacyTimerUpdates.work_completed_at = nowIso;
      }

      const { data: updated, error } = await supabase
        .from("reservations")
        .update({ status: nextStatus, ...legacyTimerUpdates })
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select(
          "id, status, customer_id, vehicle_id, title, scheduled_date, start_time, end_time, note, gcal_event_id, created_at, updated_at",
        )
        .single();

      if (error) return apiInternalError(error, "advance legacy update");

      // ── Google Calendar 同期（非ブロッキング） ──
      syncGcalAfterAdvance(caller.tenantId, updated);

      // opt-in テナントでは、状態遷移後に次アクション提案を自動更新する。レスポンス後に確実に
      // 完走させるため after() を使う (un-awaited な void だと serverless で打ち切られ得る)。
      after(() =>
        maybeAutoNextActionForReservation({ tenantId: caller.tenantId, reservationId: id }).catch((e) =>
          logger.warn("[advance] auto next-action (legacy) failed", {
            reservationId: id,
            err: e instanceof Error ? e.message : String(e),
          }),
        ),
      );

      // レガシーフローでも完了時は証明書ドラフト内容の生成＋証明書ドラフト行＋請求書ドラフトを
      // 自動起票する (各自 opt-in のテナントのみ・冪等・壁3)。PUT /api/admin/reservations の
      // 完了フックと同じ並び (AI下書き内容 → 証明書行 → 請求書) を advance() 経由でも担保する。
      // advance は completed への実遷移のみ到達する (上で completed/cancelled は弾いている)
      // ため遷移ガードは不要。
      if (nextStatus === "completed") {
        after(async () => {
          await maybeAutoDraftCertificateForReservation({ tenantId: caller.tenantId, reservationId: id }).catch((e) =>
            logger.warn("[advance] auto-draft certificate content (legacy completion) failed", {
              reservationId: id,
              err: e instanceof Error ? e.message : String(e),
            }),
          );
          await maybeAutoCreateDraftCertificateForReservation({ tenantId: caller.tenantId, reservationId: id }).catch(
            (e) =>
              logger.warn("[advance] auto-create draft certificate (legacy completion) failed", {
                reservationId: id,
                err: e instanceof Error ? e.message : String(e),
              }),
          );
          await maybeAutoCreateDraftInvoiceForReservation({
            tenantId: caller.tenantId,
            reservationId: id,
            trigger: "completion",
          }).catch((e) =>
            logger.warn("[advance] auto-create draft invoice (legacy completion) failed", {
              reservationId: id,
              err: e instanceof Error ? e.message : String(e),
            }),
          );
        });
      }

      return apiJson({ ok: true, reservation: updated, legacy: true });
    }

    // ─── ワークフローテンプレート取得 ───
    const { data: template } = await supabase
      .from("workflow_templates")
      .select("id, steps")
      .eq("id", reservation.workflow_template_id)
      .single();

    if (!template) return apiNotFound("template_not_found");

    const steps = (template.steps ?? []) as WorkflowStep[];
    const totalSteps = steps.length;
    if (totalSteps === 0) return apiValidationError("no_steps");

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
      if (!nextStep) return apiValidationError("step_not_found");

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

    // 作業タイマー: PUT /api/admin/reservations と同じ規約 (未設定のときだけ埋める)。
    const timerUpdates: Record<string, string> = {};
    if (newStatus === "in_progress" && !reservation.work_started_at) {
      timerUpdates.work_started_at = now.toISOString();
    }
    if (newStatus === "completed") {
      if (!reservation.work_started_at) timerUpdates.work_started_at = now.toISOString();
      if (!reservation.work_completed_at) timerUpdates.work_completed_at = now.toISOString();
    }

    // ─── 予約更新 ───
    const { data: updatedReservation, error: updateError } = await supabase
      .from("reservations")
      .update({
        status: newStatus,
        current_step_key: nextStep?.key ?? reservation.current_step_key,
        current_step_order: isLastStep ? currentOrder : nextOrder,
        progress_pct: progressPct,
        ...timerUpdates,
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, status, current_step_key, current_step_order, progress_pct, customer_id, vehicle_id, title, scheduled_date, start_time, end_time, note, gcal_event_id",
      )
      .single();

    if (updateError) {
      return apiInternalError(updateError, "advance update");
    }

    // ── Google Calendar 同期（非ブロッキング） ──
    syncGcalAfterAdvance(caller.tenantId, updatedReservation);

    // ─── 設定済みワークフローを汲み取った各工程の AI 自動化 ───
    // 到達した工程の意味（証明書/会計…）に応じて先回りで下書きを生成する
    // （各自 opt-in / 冪等 / 壁3）。新しい工程アシストは stepAutomations に追加する。
    if (!isLastStep && nextStep) {
      // 完了フック（下記 after 群）と同様、serverless でレスポンス後に打ち切られないよう after() で
      // 確実に完走させる。bare void だと工程到達時の下書き自動生成が取りこぼされ得る。
      const reachedStep = nextStep;
      after(() =>
        runStepAutomationOnReach(reachedStep, { tenantId: caller.tenantId, reservationId: id }).catch((e) =>
          logger.warn("[advance] step automation failed", {
            reservationId: id,
            err: e instanceof Error ? e.message : String(e),
          }),
        ),
      );
    }
    // ワークフロー完了は予約 PUT ルートの発行フックを通らないため、証明書ドラフト＋請求書
    // ドラフトの自動生成をここでも担保する（workflow 運用店舗の取りこぼし防止）。各自 opt-in /
    // 冪等 / 壁3。レスポンス後に確実に完走させるため after() を使う。
    if (isLastStep) {
      after(async () => {
        await maybeAutoDraftCertificateForReservation({ tenantId: caller.tenantId, reservationId: id }).catch((e) =>
          logger.warn("[advance] auto-draft certificate content (completion) failed", {
            reservationId: id,
            err: e instanceof Error ? e.message : String(e),
          }),
        );
        await maybeAutoCreateDraftCertificateForReservation({ tenantId: caller.tenantId, reservationId: id }).catch(
          (e) =>
            logger.warn("[advance] auto-create draft certificate (completion) failed", {
              reservationId: id,
              err: e instanceof Error ? e.message : String(e),
            }),
        );
        await maybeAutoCreateDraftInvoiceForReservation({
          tenantId: caller.tenantId,
          reservationId: id,
          trigger: "completion",
        }).catch((e) =>
          logger.warn("[advance] auto-create draft invoice (completion) failed", {
            reservationId: id,
            err: e instanceof Error ? e.message : String(e),
          }),
        );
      });
    }

    // opt-in テナントでは、状態遷移後に次アクション提案を自動更新する (after() でレスポンス後に完走)。
    after(() =>
      maybeAutoNextActionForReservation({ tenantId: caller.tenantId, reservationId: id }).catch((e) =>
        logger.warn("[advance] auto next-action failed", {
          reservationId: id,
          err: e instanceof Error ? e.message : String(e),
        }),
      ),
    );

    // ─── 顧客公開イベント書き込み & LINE通知 ───
    const currentStepForHistory = isLastStep ? steps.find((s) => s.order === currentOrder) : nextStep;

    // 完了は最終工程の可視設定に依存させず必ず顧客へ知らせる（会計/請求などを最終工程に
    // 置いても「施工完了」通知が消えないように）。中間工程は従来どおり is_customer_visible の工程のみ。
    const notifyCustomer = isLastStep || !!currentStepForHistory?.is_customer_visible;

    if (notifyCustomer) {
      const stepLabel = currentStepForHistory?.label ?? reservation.title ?? "作業";
      const historyLabel = isLastStep ? `施工が完了しました（${stepLabel}）` : `${stepLabel}を開始しました`;

      // vehicle_histories は車両キーが必須なので vehicle_id があるときだけ記録する。
      if (reservation.vehicle_id) {
        await supabase.from("vehicle_histories").insert({
          tenant_id: caller.tenantId,
          vehicle_id: reservation.vehicle_id,
          type: "progress_update",
          title: historyLabel,
          description: note ?? null,
          performed_at: new Date().toISOString(),
        });
      }

      // LINE通知は customer_id + line_user_id だけで送れる（vehicle_id 非依存）。
      // 車両未登録の飛び込み客でも進捗/完了通知が届くよう vehicle_id ガードから切り離す。
      if (reservation.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("id, name, line_user_id, phone")
          .eq("id", reservation.customer_id)
          .single();

        if (customer?.line_user_id) {
          const { data: tenant } = await supabase.from("tenants").select("name").eq("id", caller.tenantId).single();

          const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/customer/${caller.tenantId}`;
          const lineUserId = customer.line_user_id as string;

          if (isLastStep) {
            // 作業完了は重要通知 → withRetry + 配信記録 + SMS フォールバック。
            // レスポンス後にリトライ中でも打ち切られないよう after() で確実に完走させる。
            after(() =>
              sendProgressCompletionReliable(
                {
                  tenantId: caller.tenantId,
                  lineUserId,
                  customerId: customer.id as string,
                  customerPhone: (customer.phone as string | null) ?? null,
                  bodyForRecord: "(set internally)",
                  sentByUserId: caller.userId,
                },
                {
                  customerName: customer.name as string,
                  tenantName: tenant?.name ?? "施工店",
                  stepLabel,
                  portalUrl,
                },
              ).catch((error) => {
                logger.warn("LINE completion notification failed (non-blocking)", {
                  error,
                  tenantId: caller.tenantId,
                  customerId: reservation.customer_id,
                });
              }),
            );
          } else {
            // 進捗中の通知も after() でレスポンス後に確実に送る（timeliness は維持される）。
            const estimatedCompletion = nextStep ? calcEstimatedCompletion(steps, nextOrder) : undefined;
            after(() =>
              sendProgressUpdate({
                tenantId: caller.tenantId,
                lineUserId,
                customerName: customer.name as string,
                tenantName: tenant?.name ?? "施工店",
                stepLabel,
                progressPct,
                currentStep: nextOrder,
                totalSteps,
                estimatedCompletionTime: estimatedCompletion,
                portalUrl,
              }).catch((error) => {
                logger.warn("LINE progress notification failed (non-blocking)", {
                  error,
                  tenantId: caller.tenantId,
                  customerId: reservation.customer_id,
                });
              }),
            );
          }
        }
      }
    }

    return apiJson({
      ok: true,
      reservation: updatedReservation,
      next_step: nextStep,
      is_completed: isLastStep,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations/advance POST");
  }
}
