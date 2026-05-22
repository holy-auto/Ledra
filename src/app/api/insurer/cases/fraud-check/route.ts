import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { checkFraudPatterns } from "@/lib/ai/fraudPatternDetect";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  case_id: z.string().uuid(),
});

/**
 * POST /api/insurer/cases/fraud-check
 *
 * 指定した case_id に対して不正パターン検出を実行する。
 * 結果は insurer_access_logs に記録され、JSON で返す。
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "ai");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

  const { case_id } = parsed.data;
  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    // 案件を取得
    const { data: insCase } = await admin
      .from("insurer_cases")
      .select("id, insurer_id, certificate_id, vehicle_id, tenant_id, claim_amount, created_at")
      .eq("id", case_id)
      .eq("insurer_id", caller.insurerId)
      .maybeSingle();

    if (!insCase) return apiValidationError("案件が見つかりません");

    // 証明書ステータス取得
    let certStatus: string | null = null;
    if (insCase.certificate_id) {
      const { data: cert } = await admin
        .from("certificates")
        .select("status")
        .eq("id", insCase.certificate_id)
        .maybeSingle();
      certStatus = cert?.status ?? null;
    }

    // 同証明書の既存案件数
    let existingClaimsForCertificate = 0;
    if (insCase.certificate_id) {
      const { count } = await admin
        .from("insurer_cases")
        .select("id", { count: "exact", head: true })
        .eq("insurer_id", caller.insurerId)
        .eq("certificate_id", insCase.certificate_id)
        .neq("id", case_id);
      existingClaimsForCertificate = count ?? 0;
    }

    // 過去 7 日間の案件数
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: last7 } = await admin
      .from("insurer_cases")
      .select("id", { count: "exact", head: true })
      .eq("insurer_id", caller.insurerId)
      .gte("created_at", sevenDaysAgo);

    // 同日 × 同車両の案件数
    let sameDaySameVehicle = 1;
    if (insCase.vehicle_id && insCase.created_at) {
      const caseDay = String(insCase.created_at).slice(0, 10);
      const { count: sameDay } = await admin
        .from("insurer_cases")
        .select("id", { count: "exact", head: true })
        .eq("insurer_id", caller.insurerId)
        .eq("vehicle_id", insCase.vehicle_id)
        .gte("created_at", `${caseDay}T00:00:00Z`)
        .lte("created_at", `${caseDay}T23:59:59Z`);
      sameDaySameVehicle = sameDay ?? 1;
    }

    const result = await checkFraudPatterns({
      claimAmount: (insCase as any).claim_amount ?? null,
      certificateStatus: certStatus,
      existingClaimsForCertificate,
      claimsLast7Days: last7 ?? 1,
      sameDaySameVehicle,
    });

    // 監査ログ
    await admin.from("insurer_access_logs").insert({
      insurer_id: caller.insurerId,
      insurer_user_id: caller.insurerUserId,
      action: "fraud_check",
      meta: {
        case_id,
        risk_level: result.riskLevel,
        flags: result.flags,
        used_llm: result.usedLlm,
        llm_reason: result.llmReason,
      },
    });

    return apiJson({
      risk_level: result.riskLevel,
      flags: result.flags,
      llm_reason: result.llmReason,
      used_llm: result.usedLlm,
    });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/cases/fraud-check");
  }
}
