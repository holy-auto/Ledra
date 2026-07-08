/**
 * 保険案件 (claim) 作成時に不正リスクスコアを、人の操作なしで自動付与する IO 層。
 *
 * 保険案件作成ルート (`/api/insurer/cases` POST) から、レスポンス送出後に `after()` 経由で
 * **fire-and-forget** で呼ばれる。after() は auth セッションが切れているため service-role で
 * 読み書きし (insurer_id / tenant_id で明示スコープ)、絶対に throw しない。
 *
 * 段階:
 *   1. 案件のテナント (tenant_id) を opt-in 判定のキーにする。テナント未紐付けならスキップ。
 *   2. settings をロードし insurer_case.auto_fraud_score が opt-in 済みか確認 (既定 OFF)。
 *      master switch / 月次コストキャップ超過時は loadAiAutomationSettings 側で enabled=false に
 *      倒れるため、ここで自動的に停止する。
 *   3. 不正検出ヘルパ (ルール一次 + グレーのみ AI) を実行し、insurer_cases.meta.ai_fraud に保存。
 *
 * 壁3 とは無関係: 出力は risk_level / flags の注釈のみで、査定の確定は必ず人が行う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkFraudPatterns } from "@/lib/ai/fraudPatternDetect";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoFraudScore } from "./orchestrator";

const AUTO_FRAUD_ENDPOINT = "/api/insurer/cases#auto-fraud-score";

export interface MaybeAutoFraudScoreParams {
  caseId: string;
  insurerId: string;
  /** 案件に紐づくテナント (opt-in 判定キー)。null ならスキップ。 */
  tenantId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * 指定した保険案件に不正リスクスコアを自動付与する。失敗しても投げない。
 */
export async function maybeAutoFraudScoreForCase(params: MaybeAutoFraudScoreParams): Promise<void> {
  const { caseId, insurerId, tenantId } = params;
  try {
    if (!caseId || !insurerId || !tenantId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoFraudScore(settings)) return;

    const admin = createServiceRoleAdmin("AI auto fraud score — insurer case create after() lacks auth session");

    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;

    // 案件を取得 (insurer_id で明示スコープ)。
    // 注: claim_amount は insurer_cases に存在しない列のため select に含めない
    // (含めると PostgREST が 400 を返し全体が失敗する)。金額系ルール (round_amount /
    // high_claim_amount) は claimAmount=null で自然に不発になり、重複請求・速度・
    // 同日同車両・void 証明書の高シグナル 4 ルールで判定する。
    const { data: insCase } = await admin
      .from("insurer_cases")
      .select("id, insurer_id, certificate_id, vehicle_id, tenant_id, created_at, meta")
      .eq("id", caseId)
      .eq("insurer_id", insurerId)
      .maybeSingle();
    if (!insCase) return;

    // 既に自動スコア済みなら再実行しない (同一案件への多重発火を防ぐ)。
    const existingMeta = asRecord(insCase.meta);
    if (asRecord(existingMeta.ai_fraud).source === "auto") return;

    // 証明書ステータス
    let certStatus: string | null = null;
    if (insCase.certificate_id) {
      const { data: cert } = await admin
        .from("certificates")
        .select("status")
        .eq("id", insCase.certificate_id)
        .maybeSingle();
      certStatus = cert?.status ?? null;
    }

    // 同証明書の既存案件数 (今回を除く)
    let existingClaimsForCertificate = 0;
    if (insCase.certificate_id) {
      const { count } = await admin
        .from("insurer_cases")
        .select("id", { count: "exact", head: true })
        .eq("insurer_id", insurerId)
        .eq("certificate_id", insCase.certificate_id)
        .neq("id", caseId);
      existingClaimsForCertificate = count ?? 0;
    }

    // 過去 7 日間の案件数
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: last7 } = await admin
      .from("insurer_cases")
      .select("id", { count: "exact", head: true })
      .eq("insurer_id", insurerId)
      .gte("created_at", sevenDaysAgo);

    // 同日 × 同車両の案件数
    let sameDaySameVehicle = 1;
    if (insCase.vehicle_id && insCase.created_at) {
      const caseDay = String(insCase.created_at).slice(0, 10);
      const { count: sameDay } = await admin
        .from("insurer_cases")
        .select("id", { count: "exact", head: true })
        .eq("insurer_id", insurerId)
        .eq("vehicle_id", insCase.vehicle_id)
        .gte("created_at", `${caseDay}T00:00:00Z`)
        .lte("created_at", `${caseDay}T23:59:59Z`);
      sameDaySameVehicle = sameDay ?? 1;
    }

    const usage = startAiRouteUsage(AUTO_FRAUD_ENDPOINT);
    const result = await checkFraudPatterns(
      {
        claimAmount: null, // insurer_cases に金額列が無いため未使用 (上記コメント参照)
        certificateStatus: certStatus,
        existingClaimsForCertificate,
        claimsLast7Days: last7 ?? 1,
        sameDaySameVehicle,
      },
      { model: fastModelForPlanTier(tenant.plan_tier) },
    );

    usage.record({
      tenantId,
      insurerId,
      outcome: "ok",
      meta: { auto: true, risk_level: result.riskLevel, flags: result.flags, used_llm: result.usedLlm },
    });

    const ai_fraud = {
      scored_at: new Date().toISOString(),
      source: "auto" as const,
      risk_level: result.riskLevel,
      flags: result.flags,
      used_llm: result.usedLlm,
      llm_reason: result.llmReason,
    };

    const { error: upErr } = await admin
      .from("insurer_cases")
      .update({ meta: { ...existingMeta, ai_fraud } })
      .eq("id", caseId)
      .eq("insurer_id", insurerId);
    if (upErr) {
      logger.warn("[fraudScoreAuto] meta update failed", { caseId, err: upErr.message });
    }

    // 監査ログ (手動 fraud_check と対になる auto 版)
    await admin
      .from("insurer_access_logs")
      .insert({
        insurer_id: insurerId,
        action: "fraud_check_auto",
        meta: {
          case_id: caseId,
          risk_level: result.riskLevel,
          flags: result.flags,
          used_llm: result.usedLlm,
          llm_reason: result.llmReason,
        },
      })
      .then(() => {});
  } catch (e) {
    logger.warn("[fraudScoreAuto] maybeAutoFraudScoreForCase threw", {
      caseId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
