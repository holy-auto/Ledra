/**
 * 保険案件 (claim) 作成時に 3 行サマリを、人の操作なしで自動生成する IO 層。
 *
 * 保険案件作成ルート (`/api/insurer/cases` POST) から、レスポンス送出後に `after()` 経由で
 * **fire-and-forget** で呼ばれる。after() は auth セッションが切れているため service-role で
 * 読み書きし (insurer_id / tenant_id で明示スコープ)、絶対に throw しない。
 *
 * 段階:
 *   1. 案件のテナント (tenant_id) を opt-in 判定のキーにする。テナント未紐付けならスキップ。
 *   2. settings をロードし insurer_case.auto_summary が opt-in 済みか確認 (既定 OFF)。
 *      master switch / 月次コストキャップ超過時は loadAiAutomationSettings 側で enabled=false に
 *      倒れるため、ここで自動的に停止する。
 *   3. summarizeCase (AI 不在時はフォールバック) を実行し、insurer_cases.meta.ai_summary に保存。
 *
 * 壁3 とは無関係: 出力は 3 行サマリの注釈のみで、査定の確定は必ず人が行う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { summarizeCase } from "@/lib/ai/caseSummary";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoSummarizeCase } from "./orchestrator";

const AUTO_SUMMARY_ENDPOINT = "/api/insurer/cases#auto-summary";

export interface MaybeAutoSummarizeCaseParams {
  caseId: string;
  insurerId: string;
  /** 案件に紐づくテナント (opt-in 判定キー)。null ならスキップ。 */
  tenantId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * 指定した保険案件に 3 行サマリを自動付与する。失敗しても投げない。
 */
export async function maybeAutoSummarizeCase(params: MaybeAutoSummarizeCaseParams): Promise<void> {
  const { caseId, insurerId, tenantId } = params;
  try {
    if (!caseId || !insurerId || !tenantId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoSummarizeCase(settings)) return;

    const admin = createServiceRoleAdmin("AI auto case summary — insurer case create after() lacks auth session");

    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;

    // 案件を取得 (insurer_id で明示スコープ)。
    const { data: insCase } = await admin
      .from("insurer_cases")
      .select("id, insurer_id, title, description, status, priority, certificate_id, vehicle_id, meta")
      .eq("id", caseId)
      .eq("insurer_id", insurerId)
      .maybeSingle();
    if (!insCase) return;

    // 既に自動サマリ済みなら再実行しない (同一案件への多重発火を防ぐ)。
    const existingMeta = asRecord(insCase.meta);
    if (asRecord(existingMeta.ai_summary).source === "auto") return;

    // 車両 / 証明書を並列取得 (どちらも任意)。作成直後はメッセージが無いため取得しない。
    const [vehicleRes, certRes] = await Promise.all([
      insCase.vehicle_id
        ? admin.from("vehicles").select("maker, model").eq("id", insCase.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null }),
      insCase.certificate_id
        ? admin.from("certificates").select("service_name, issued_at").eq("id", insCase.certificate_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const usage = startAiRouteUsage(AUTO_SUMMARY_ENDPOINT);
    const result = await summarizeCase(
      {
        subject: insCase.title as string | null,
        body: insCase.description as string | null,
        status: (insCase.status as string) ?? "open",
        priority: (insCase.priority as string) ?? "normal",
        vehicle: vehicleRes.data as { maker?: string; model?: string } | null,
        certificate: certRes.data as { service_name?: string; issued_at?: string } | null,
      },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );

    usage.record({
      tenantId,
      insurerId,
      outcome: result.ai ? "ok" : "error",
      confidence: typeof result.confidence === "number" ? result.confidence : null,
      meta: { auto: true, ai: result.ai },
    });

    const ai_summary = {
      summarized_at: new Date().toISOString(),
      source: "auto" as const,
      lines: result.lines,
      confidence: result.confidence,
      ai: result.ai,
    };

    const { error: upErr } = await admin
      .from("insurer_cases")
      .update({ meta: { ...existingMeta, ai_summary } })
      .eq("id", caseId)
      .eq("insurer_id", insurerId);
    if (upErr) {
      logger.warn("[caseSummaryAuto] meta update failed", { caseId, err: upErr.message });
    }

    // 監査ログ (手動 ai-summary と対になる auto 版)
    await admin
      .from("insurer_access_logs")
      .insert({
        insurer_id: insurerId,
        action: "case_summary_auto",
        meta: { case_id: caseId, ai: result.ai, confidence: result.confidence },
      })
      .then(() => {});
  } catch (e) {
    logger.warn("[caseSummaryAuto] maybeAutoSummarizeCase threw", {
      caseId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
