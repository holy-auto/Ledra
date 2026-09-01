/**
 * POST /api/admin/inspection-records/ocr
 *
 * 点検写真 (走行距離メーター / タイヤ) を Anthropic Vision で読み取り、
 * 点検表フォームの自動入力用に数値を返す。
 *
 * ★ 診断ではない。結果は DB に永続化しない (確定=保存はフォーム側で人が行う)。 ★
 *
 * Body: multipart/form-data
 *   - image: File (image/jpeg | image/png | image/webp, <= 8 MB)
 *   - target: "odometer" | "tire"
 *
 * Auth: Ledra 管理者セッション (tenant スコープ)。Vision 機能は Standard 以上。
 * Rate limit: `identity_ocr` preset (IP) + tenant 単位の 2 段目。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiValidationError, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { logger } from "@/lib/logger";
import { runInspectionOcr } from "@/lib/ai/inspectionOcr";
import { assessTire, type InspectionOcrTarget } from "@/lib/inspection/inspectionOcrSchema";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TARGET = new Set<InspectionOcrTarget>(["odometer", "tire"]);

export async function POST(req: NextRequest) {
  // 1) IP ベースの rate limit
  const ipLimit = await checkRateLimit(req, "identity_ocr");
  if (ipLimit) return ipLimit;

  // 2) 認証
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  // 3) プラン (Vision は Standard 以上)
  if (!canUseFeature(normalizePlanTier(caller.planTier), "ai_quality_vision")) {
    return apiForbidden("点検写真の自動読み取りは Standard プラン以上で利用できます。");
  }

  // 4) テナント単位の rate limit
  const tenantLimit = await checkRateLimit(req, "identity_ocr", `inspection-ocr:${caller.tenantId}`);
  if (tenantLimit) return tenantLimit;

  // 5) multipart 解析
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiValidationError("Content-Type は multipart/form-data を指定してください");
  }
  const form = await req.formData().catch(() => null);
  if (!form) return apiValidationError("multipart の解析に失敗しました");

  const file = form.get("image");
  const targetRaw = form.get("target");

  if (!(file instanceof File)) return apiValidationError("image フィールドにファイルを添付してください");
  if (file.size === 0) return apiValidationError("ファイルが空です");
  if (file.size > MAX_FILE_BYTES) {
    return apiValidationError(`画像サイズが ${MAX_FILE_BYTES / 1024 / 1024} MB を超えています`);
  }
  const mime = file.type;
  if (!ALLOWED_MIME.has(mime)) return apiValidationError("対応形式は JPEG / PNG / WebP です");

  if (typeof targetRaw !== "string" || !ALLOWED_TARGET.has(targetRaw as InspectionOcrTarget)) {
    return apiValidationError("target は odometer / tire のいずれかを指定してください");
  }
  const target = targetRaw as InspectionOcrTarget;

  const log = logger.child({
    route: "POST /api/admin/inspection-records/ocr",
    tenantId: caller.tenantId,
    userId: caller.userId,
    target,
    mime,
    sizeBytes: file.size,
  });

  // 6) AI マスタースイッチ OFF / 月次コストキャップ超過時はスキップして手動入力へ
  const usage = startAiRouteUsage("/api/admin/inspection-records/ocr");
  const aiSettings = await loadAiAutomationSettings(caller.tenantId);
  if (!aiSettings.enabled) {
    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
    return apiOk({
      status: "skipped" as const,
      ocr_disabled: true,
      target,
      warnings: [],
      notice: "AI 自動入力が停止中のため OCR を実行しませんでした。手動で入力してください。",
    });
  }

  // 7) Vision 呼び出し
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const result = await runInspectionOcr({
      base64,
      mediaType: mime as "image/jpeg" | "image/png" | "image/webp",
      target,
    });

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { target },
    });

    log.info("inspection_ocr_complete", {
      target: result.target,
      confidence: result.confidence,
      has_mileage: result.mileage_km != null,
      has_tread: result.tread_depth_mm != null,
      note_count: result.condition_notes.length,
      warning_count: result.warnings.length,
    });

    return apiOk({
      status: "ok" as const,
      ...result,
      // タイヤは交換要否の目安 (次回提案の下書き) を添える。odometer では null。
      tire_advice: target === "tire" ? assessTire(result) : null,
    });
  } catch (err) {
    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "error" });
    return apiInternalError(err, "POST /api/admin/inspection-records/ocr");
  }
}
