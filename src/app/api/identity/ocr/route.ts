/**
 * POST /api/identity/ocr
 *
 * 身分証画像から「氏名・生年月日・住所等」を Anthropic Vision で抽出し、
 * フォーム自動入力のために返す。
 *
 * ★ 本人確認(KYC) ではない。結果は DB に永続化しない。 ★
 *
 * Body: multipart/form-data
 *   - image: File (image/jpeg | image/png | image/webp, <= 8 MB)
 *   - expected?: "driver_license" | "mynumber_card_front" | "residence_card"
 *                | "passport" | "health_insurance_card"
 *
 * Auth:
 *   - Ledra 管理者セッション (tenant スコープ) を要求.
 *   - 公開顧客フローからの利用は将来別 route 化を検討.
 *
 * Rate limit:
 *   - `identity_ocr` preset (10 req / 600 s per IP)
 *   - 加えてテナント単位の identifier で 2 段目を重ねる.
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { logger } from "@/lib/logger";
import { runIdentityOcr } from "@/lib/ai/identityOcr";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

const ALLOWED_EXPECTED = new Set([
  "driver_license",
  "mynumber_card_front",
  "residence_card",
  "passport",
  "health_insurance_card",
]);

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

  // 3) テナント単位の rate limit (10 req / 600s per tenant)
  const tenantLimit = await checkRateLimit(req, "identity_ocr", `tenant:${caller.tenantId}`);
  if (tenantLimit) return tenantLimit;

  // 4) multipart 解析
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiValidationError("Content-Type は multipart/form-data を指定してください");
  }

  const form = await req.formData().catch(() => null);
  if (!form) return apiValidationError("multipart の解析に失敗しました");

  const file = form.get("image");
  const expectedRaw = form.get("expected");

  if (!(file instanceof File)) {
    return apiValidationError("image フィールドにファイルを添付してください");
  }

  if (file.size === 0) {
    return apiValidationError("ファイルが空です");
  }

  if (file.size > MAX_FILE_BYTES) {
    return apiValidationError(`画像サイズが ${MAX_FILE_BYTES / 1024 / 1024} MB を超えています`);
  }

  const mime = file.type;
  if (!ALLOWED_MIME.has(mime)) {
    return apiValidationError("対応形式は JPEG / PNG / WebP です");
  }

  let expected: string | undefined;
  if (typeof expectedRaw === "string" && expectedRaw.length > 0) {
    if (!ALLOWED_EXPECTED.has(expectedRaw)) {
      return apiValidationError("expected の値が不正です");
    }
    expected = expectedRaw;
  }

  const log = logger.child({
    route: "POST /api/identity/ocr",
    tenantId: caller.tenantId,
    userId: caller.userId,
    expected,
    mime,
    sizeBytes: file.size,
  });

  // 5) AI マスタースイッチ OFF / 月次コストキャップ超過時は OCR をスキップして
  //    手動入力にフォールバックさせる (管理者向けルートは停止する方針)。
  const usage = startAiRouteUsage("/api/identity/ocr");
  const aiSettings = await loadAiAutomationSettings(caller.tenantId);
  if (!aiSettings.enabled) {
    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
    return apiOk({
      status: "skipped" as const,
      ocr_disabled: true,
      fields: {},
      rejected_reasons: [],
      warnings: [],
      notice: "AI 自動入力が停止中のため OCR を実行しませんでした。手動で入力してください。",
    });
  }

  // 6) Vision 呼び出し
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const { result, status } = await runIdentityOcr({
      base64,
      mediaType: mime as "image/jpeg" | "image/png" | "image/webp",
      expected: expected as
        "driver_license" | "mynumber_card_front" | "residence_card" | "passport" | "health_insurance_card" | undefined,
    });

    // OCR が実行された (= Anthropic 呼び出し済み)。捕捉トークンで月次キャップに課金。
    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ocr_status: status },
    });

    // ★ PII 本体はログに出さない。件数 / 判定のみ ★
    log.info("identity_ocr_complete", {
      ocr_status: status,
      doc_type: result.doc_type,
      confidence: result.confidence,
      field_count: Object.keys(result.fields).length,
      rejected_count: result.rejected_reasons.length,
      warning_count: result.warnings.length,
    });

    if (status === "rejected") {
      // マイナンバー検知などで全フィールドが破棄された場合
      log.warn("identity_ocr_rejected", {
        reasons_count: result.rejected_reasons.length,
      });
      return apiOk({
        status: "rejected" as const,
        doc_type: result.doc_type,
        confidence: result.confidence,
        fields: {},
        rejected_reasons: result.rejected_reasons,
        warnings: result.warnings,
        notice:
          "個人番号(マイナンバー)など、当サービスでは取り扱えない情報が検出されたため、結果を破棄しました。手動で入力してください。",
      });
    }

    return apiOk({
      status: "ok" as const,
      doc_type: result.doc_type,
      confidence: result.confidence,
      fields: result.fields,
      rejected_reasons: result.rejected_reasons,
      warnings: result.warnings,
    });
  } catch (err) {
    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "error" });
    return apiInternalError(err, "POST /api/identity/ocr");
  }
}
