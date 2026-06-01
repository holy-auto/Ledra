/**
 * 案件 (予約) 登録時に最適なワークフローを、人の操作なしで AI 提案する IO 層。
 *
 * 予約作成ルート (`/api/admin/reservations` POST) から **fire-and-forget** で
 * 呼ばれる。管理者レスポンスを遅らせないため await しない。
 *
 * 段階:
 *   1. settings をロードし workflow.auto_propose_on_intake が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_job_assist) と is_active を確認
 *   3. テンプレート + 顧客/車両の過去 service_type を集め、proposeWorkflow を実行し
 *      reservations.ai_workflow_proposal に「提案」として保存
 *
 * 壁3 とは無関係: 提案を保存するだけで、ワークフローの適用 (進行開始) はしない。
 * スタッフが承認 (start-workflow) または別テンプレートに変更してから進める。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { proposeWorkflow, type WorkflowTemplateLite } from "@/lib/ai/workflowProposal";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoProposeWorkflowOnIntake, shouldAutoApplyWorkflowOnIntake } from "./orchestrator";

const AUTO_PROPOSE_ENDPOINT = "/api/admin/reservations#auto-workflow-propose";

interface MenuItem {
  name?: unknown;
}

export interface MaybeAutoProposeWorkflowParams {
  tenantId: string;
  reservationId: string;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * 案件登録時にワークフローを提案し保存する。失敗しても投げない。
 */
export async function maybeAutoProposeWorkflowForReservation(params: MaybeAutoProposeWorkflowParams): Promise<void> {
  const { tenantId, reservationId } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoProposeWorkflowOnIntake(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-propose workflow — reservation intake, fire-and-forget");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_job_assist")) return;

    // 予約 + 既存提案 + 既にワークフロー開始済みかを確認。
    const sel = await admin
      .from("reservations")
      .select("title, menu_items_json, customer_id, vehicle_id, workflow_template_id, ai_workflow_proposal")
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (sel.error) {
      if (!isMissingColumnError(sel.error)) {
        logger.warn("[workflowAuto] reservation select failed", { tenantId, err: sel.error.message });
      }
      return;
    }
    const reservation = sel.data as {
      title: string | null;
      menu_items_json: unknown;
      customer_id: string | null;
      vehicle_id: string | null;
      workflow_template_id: string | null;
      ai_workflow_proposal: unknown;
    } | null;
    if (!reservation) return;
    if (reservation.workflow_template_id) return; // 既に進行中 → 提案しない
    if (reservation.ai_workflow_proposal) return; // 既に提案済み → 上書きしない

    // 利用可能テンプレート (テナント所有 + プラットフォーム共通)。
    const { data: tplRows } = await admin
      .from("workflow_templates")
      .select("id, name, service_type, is_default, is_platform")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    const templates: WorkflowTemplateLite[] = (tplRows ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      service_type: t.service_type as string,
      is_default: !!t.is_default,
      is_platform: !!t.is_platform,
    }));
    if (templates.length === 0) return; // テンプレート未登録なら提案できない

    // 顧客 / 車両の過去案件で使われた service_type を新しい順で集める。
    const pastServiceTypes = await loadPastServiceTypes(
      admin,
      tenantId,
      reservation.customer_id,
      reservation.vehicle_id,
    );

    // メニュー名 + 車両ラベル。
    const menuItemNames = Array.isArray(reservation.menu_items_json)
      ? (reservation.menu_items_json as MenuItem[])
          .map((m) => (typeof m?.name === "string" ? m.name.trim() : ""))
          .filter((s) => s.length > 0)
      : [];
    const vehicleLabel = await loadVehicleLabel(admin, reservation.vehicle_id);

    const usage = startAiRouteUsage(AUTO_PROPOSE_ENDPOINT);
    const proposal = await proposeWorkflow({
      title: reservation.title,
      menuItemNames,
      vehicleLabel,
      pastServiceTypes,
      templates,
    });

    const snapshot = {
      suggested_template_id: proposal.suggestedTemplateId,
      suggested_template_name: proposal.suggestedTemplateName,
      service_type: proposal.serviceType,
      reason: proposal.reason,
      confidence: proposal.confidence,
      ai: proposal.ai,
      auto: true,
      generated_at: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("reservations")
      .update({ ai_workflow_proposal: snapshot })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId);
    if (upErr && !isMissingColumnError(upErr)) {
      logger.warn("[workflowAuto] proposal update failed", { tenantId, err: upErr.message });
    }

    // ── AI 提案のワークフローを自動適用（opt-in）──
    // テンプレートを手で組まずとも工程が走るように、最有力テンプレートを割り当てて
    // ワークフローを開始する。割り当てるだけで各工程の進行・確定は人（壁3 維持）。
    // スタッフはいつでも別テンプレートに変更できる。
    if (proposal.suggestedTemplateId && shouldAutoApplyWorkflowOnIntake(settings)) {
      const { error: applyErr } = await admin
        .from("reservations")
        .update({
          workflow_template_id: proposal.suggestedTemplateId,
          current_step_order: 0,
          current_step_key: null,
          progress_pct: 0,
        })
        .eq("id", reservationId)
        .eq("tenant_id", tenantId)
        .is("workflow_template_id", null); // レース時も二重適用しない
      if (applyErr) {
        logger.warn("[workflowAuto] auto-apply update failed", { tenantId, err: applyErr.message });
      } else {
        logger.info("[workflowAuto] workflow auto-applied", {
          tenantId,
          reservationId,
          templateId: proposal.suggestedTemplateId,
        });
      }
    }

    usage.record({
      tenantId,
      outcome: "ok",
      confidence: proposal.confidence,
      meta: { auto: true, has_suggestion: !!proposal.suggestedTemplateId, service_type: proposal.serviceType },
    });
  } catch (e) {
    logger.warn("[workflowAuto] maybeAutoProposeWorkflowForReservation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** 顧客 / 車両の過去案件で使われた service_type を新しい順 (最大10件) で返す。 */
async function loadPastServiceTypes(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  tenantId: string,
  customerId: string | null,
  vehicleId: string | null,
): Promise<string[]> {
  if (!customerId && !vehicleId) return [];
  let query = admin
    .from("reservations")
    .select("workflow_template_id, created_at")
    .eq("tenant_id", tenantId)
    .not("workflow_template_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  // 顧客優先、無ければ車両で絞る。
  query = customerId ? query.eq("customer_id", customerId) : query.eq("vehicle_id", vehicleId as string);
  const { data: rows } = await query;
  const templateIds = Array.from(
    new Set((rows ?? []).map((r) => r.workflow_template_id as string | null).filter((x): x is string => !!x)),
  );
  if (templateIds.length === 0) return [];
  const { data: tpls } = await admin.from("workflow_templates").select("id, service_type").in("id", templateIds);
  const typeById = new Map((tpls ?? []).map((t) => [t.id as string, t.service_type as string]));
  return (rows ?? []).map((r) => typeById.get(r.workflow_template_id as string)).filter((s): s is string => !!s);
}

/** 車両ラベル (メーカー + 車種) を組み立てる。 */
async function loadVehicleLabel(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  vehicleId: string | null,
): Promise<string | null> {
  if (!vehicleId) return null;
  const { data: v } = await admin.from("vehicles").select("maker, model").eq("id", vehicleId).maybeSingle();
  if (!v) return null;
  const label = [v.maker, v.model].filter((x) => typeof x === "string" && x.trim().length > 0).join(" ");
  return label || null;
}
