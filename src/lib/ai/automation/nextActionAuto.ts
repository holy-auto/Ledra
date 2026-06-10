/**
 * 案件 (= reservation) の状態遷移時に「次アクション」提案を、人の操作なしで
 * 自動算出・保存する IO 層。
 *
 * 進行ルート (`/api/admin/reservations/[id]/advance`) のステータス更新後に
 * **fire-and-forget** で呼ばれる。after() / void 起動のため auth セッションが
 * 切れていることがあり、service-role で読み書きし (tenant_id で明示スコープ)、
 * 絶対に throw しない。
 *
 * 段階:
 *   1. settings をロードし job.auto_next_action が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_job_assist) と is_active を確認
 *   3. job.next_action フィールドが manual のテナントはスキップ (設定尊重)
 *   4. 案件 + 文脈 (証明書 / 請求) から generateJobNextAction を実行し
 *      reservations.ai_next_action に提案として保存
 *
 * 壁3 とは無関係: 出力は次手の提案 (action/message/priority) のみで、各操作
 * (発行 / 請求 / 入金確認 等) の実行は必ず人が行う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { generateJobNextAction, type JobStatus } from "@/lib/ai/jobNextAction";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings, resolveFieldPolicy } from "./policy";
import { shouldAutoNextAction } from "./orchestrator";

const NEXT_ACTION_ENDPOINT = "/api/admin/reservations/advance#auto-next-action";

const VALID_STATUS: JobStatus[] = ["confirmed", "arrived", "in_progress", "completed", "cancelled"];

function normalizeStatus(s: unknown): JobStatus {
  if (typeof s === "string" && (VALID_STATUS as readonly string[]).includes(s)) return s as JobStatus;
  return "confirmed";
}

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
}

function estimateDurationMinutes(start: string | null, end: string | null): number | null {
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (startMin == null || endMin == null) return null;
  const diff = endMin - startMin;
  return diff > 0 ? diff : null;
}

function minutesSince(ts: string | null): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 60_000);
}

export interface MaybeAutoNextActionParams {
  tenantId: string;
  reservationId: string;
}

/**
 * 指定案件に次アクション提案を自動付与する。失敗しても投げない。
 */
export async function maybeAutoNextActionForReservation(params: MaybeAutoNextActionParams): Promise<void> {
  const { tenantId, reservationId } = params;
  try {
    if (!tenantId || !reservationId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoNextAction(settings)) return;
    // job.next_action フィールドを manual にしているテナントの意思を尊重し、生成しない。
    if (resolveFieldPolicy(settings, "job.next_action") === "manual") return;

    const admin = createServiceRoleAdmin("AI auto next-action — reservation advance lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_job_assist")) return;

    const { data: reservation } = await admin
      .from("reservations")
      .select(
        "id, status, customer_id, vehicle_id, start_time, end_time, updated_at, work_started_at, work_completed_at",
      )
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!reservation) return;

    const status = normalizeStatus(reservation.status);

    // 次アクション判定に必要な文脈だけを取得 (証明書の有効性 / 請求の未払い・期限超過)。
    const [certsRes, invoicesRes] = await Promise.all([
      reservation.vehicle_id
        ? admin.from("certificates").select("status").eq("vehicle_id", reservation.vehicle_id).eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] as Array<{ status: string }> }),
      reservation.customer_id
        ? admin
            .from("invoices")
            .select("status, due_date")
            .eq("customer_id", reservation.customer_id)
            .eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] as Array<{ status: string; due_date: string | null }> }),
    ]);

    const certs = (certsRes.data ?? []) as Array<{ status: string }>;
    const invoices = (invoicesRes.data ?? []) as Array<{ status: string; due_date: string | null }>;
    const now = Date.now();
    const hasActiveCertificate = certs.some((c) => c.status === "active");
    const hasUnpaidInvoice = invoices.some((i) => i.status === "draft" || i.status === "sent");
    const hasOverdueInvoice = invoices.some(
      (i) => i.status === "sent" && i.due_date && new Date(i.due_date).getTime() < now,
    );

    const estimatedDurationMin = estimateDurationMinutes(reservation.start_time, reservation.end_time);
    const minutesSinceStatusChange = minutesSince(
      status === "in_progress"
        ? reservation.work_started_at
        : status === "completed"
          ? reservation.work_completed_at
          : reservation.updated_at,
    );

    const usage = startAiRouteUsage(NEXT_ACTION_ENDPOINT);
    const result = await generateJobNextAction({
      status,
      hasCustomer: !!reservation.customer_id,
      hasVehicle: !!reservation.vehicle_id,
      hasActiveCertificate,
      hasUnpaidInvoice,
      hasOverdueInvoice,
      minutesSinceStatusChange,
      estimatedDurationMin,
    });

    usage.record({
      tenantId,
      outcome: result.ai ? "ok" : "error",
      meta: { auto: true, status, action: result.action, priority: result.priority, ai: result.ai },
    });

    const ai_next_action = {
      generated_at: new Date().toISOString(),
      source: "auto" as const,
      status,
      action: result.action,
      message: result.message,
      priority: result.priority,
      ai: result.ai,
    };

    const { error: upErr } = await admin
      .from("reservations")
      .update({ ai_next_action })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logger.warn("[nextActionAuto] update failed", { reservationId, err: upErr.message });
    }
  } catch (e) {
    logger.warn("[nextActionAuto] maybeAutoNextActionForReservation threw", {
      reservationId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
