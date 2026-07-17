/**
 * 案件 (予約) 登録時に担当メカニック候補を、人の操作なしで AI 提案する IO 層。
 *
 * 予約作成ルート (`/api/admin/reservations` POST) から **fire-and-forget** で
 * 呼ばれる。管理者レスポンスを遅らせないため await しない。
 *
 * 段階 (workflowAuto.ts と同じ骨格):
 *   1. settings をロードし mechanic.auto_assign_suggest が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_job_assist) と is_active を確認
 *   3. 予約 + 稼働職人 + 同種施工の担当履歴を集め、suggestMechanicAssignees を実行し
 *      reservations.ai_assignee_suggestion に「提案」として保存
 *
 * 壁3 とは無関係: 提案を保存するだけで、担当の割当 (assigned_staff_id の確定) はしない。
 * スタッフが案件画面で候補を見て 1 タップで割り当てる (人が判断)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import {
  suggestMechanicAssignees,
  type MechanicStaff,
  type MechanicAssignHistoryRow,
} from "@/lib/ai/mechanicAssignSuggest";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoSuggestMechanic } from "./orchestrator";

const AUTO_ASSIGN_ENDPOINT = "/api/admin/reservations#auto-assignee-suggest";

interface MenuItem {
  name?: unknown;
}

export interface MaybeAutoSuggestAssigneeParams {
  tenantId: string;
  reservationId: string;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/** 案件登録時に担当メカニック候補を提案し保存する。失敗しても投げない。 */
export async function maybeAutoSuggestAssigneeForReservation(params: MaybeAutoSuggestAssigneeParams): Promise<void> {
  const { tenantId, reservationId } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoSuggestMechanic(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-suggest assignee — reservation intake, fire-and-forget");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_job_assist")) return;

    const sel = await admin
      .from("reservations")
      .select("title, menu_items_json, assigned_staff_id, workflow_template_id, ai_assignee_suggestion")
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (sel.error) {
      if (!isMissingColumnError(sel.error)) {
        logger.warn("[assigneeAuto] reservation select failed", { tenantId, err: sel.error.message });
      }
      return;
    }
    const reservation = sel.data as {
      title: string | null;
      menu_items_json: unknown;
      assigned_staff_id: string | null;
      workflow_template_id: string | null;
      ai_assignee_suggestion: unknown;
    } | null;
    if (!reservation) return;
    if (reservation.assigned_staff_id) return; // 既に割当済み → 提案しない
    if (reservation.ai_assignee_suggestion) return; // 既に提案済み → 上書きしない

    // 稼働中の職人 (社内 + 外注)。picker と同じ最小列。
    const { data: staffRows } = await admin
      .from("staff_members")
      .select("id, name, skills, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);
    const staff: MechanicStaff[] = (staffRows ?? []).map((s) => ({
      id: s.id as string,
      name: (s.name as string) ?? "",
      skills: Array.isArray(s.skills) ? (s.skills as string[]) : [],
      is_active: s.is_active !== false,
    }));
    if (staff.length === 0) return; // 職人未登録なら提案できない

    // service_type: 紐づくワークフローテンプレートから取得 (あれば)。
    const serviceType = await loadServiceType(admin, reservation.workflow_template_id);

    // 過去の同種施工の担当履歴 (最大 100 件)。
    const history = await loadAssignHistory(admin, tenantId);

    const menuItemNames = Array.isArray(reservation.menu_items_json)
      ? (reservation.menu_items_json as MenuItem[])
          .map((m) => (typeof m?.name === "string" ? m.name.trim() : ""))
          .filter((s) => s.length > 0)
      : [];
    const jobText = [reservation.title ?? "", ...menuItemNames].filter(Boolean).join(" / ") || null;

    const usage = startAiRouteUsage(AUTO_ASSIGN_ENDPOINT);
    const result = await suggestMechanicAssignees(
      { jobText, serviceType, staff, history },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );

    if (result.candidates.length === 0) {
      usage.record({ tenantId, outcome: "ok", meta: { auto: true, has_suggestion: false } });
      return;
    }

    const snapshot = {
      candidates: result.candidates,
      ai: result.ai,
      service_type: result.serviceType,
      job_tags: result.jobTags,
      auto: true,
      generated_at: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("reservations")
      .update({ ai_assignee_suggestion: snapshot })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .is("assigned_staff_id", null); // レース時に割当済みなら上書きしない
    if (upErr && !isMissingColumnError(upErr)) {
      logger.warn("[assigneeAuto] suggestion update failed", { tenantId, err: upErr.message });
    }

    usage.record({
      tenantId,
      outcome: "ok",
      confidence: result.candidates[0]?.score,
      meta: { auto: true, has_suggestion: true, method: result.candidates[0]?.method, ai: result.ai },
    });
  } catch (e) {
    logger.warn("[assigneeAuto] maybeAutoSuggestAssigneeForReservation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** ワークフローテンプレートの service_type を返す (無ければ null)。 */
async function loadServiceType(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  templateId: string | null,
): Promise<string | null> {
  if (!templateId) return null;
  const { data } = await admin.from("workflow_templates").select("service_type").eq("id", templateId).maybeSingle();
  const st = data?.service_type;
  return typeof st === "string" && st.trim().length > 0 ? st : null;
}

/** テナントの担当履歴 (assigned_staff_id 付き) を service_type とともに新しい順で返す。 */
async function loadAssignHistory(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  tenantId: string,
): Promise<MechanicAssignHistoryRow[]> {
  const { data: rows } = await admin
    .from("reservations")
    .select("assigned_staff_id, workflow_template_id, created_at")
    .eq("tenant_id", tenantId)
    .not("assigned_staff_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!rows || rows.length === 0) return [];

  const templateIds = Array.from(
    new Set(rows.map((r) => r.workflow_template_id as string | null).filter((x): x is string => !!x)),
  );
  const typeById = new Map<string, string>();
  if (templateIds.length > 0) {
    const { data: tpls } = await admin.from("workflow_templates").select("id, service_type").in("id", templateIds);
    for (const t of tpls ?? []) {
      if (typeof t.service_type === "string") typeById.set(t.id as string, t.service_type);
    }
  }
  return rows.map((r) => ({
    assigned_staff_id: r.assigned_staff_id as string | null,
    service_type: r.workflow_template_id ? (typeById.get(r.workflow_template_id as string) ?? null) : null,
  }));
}
