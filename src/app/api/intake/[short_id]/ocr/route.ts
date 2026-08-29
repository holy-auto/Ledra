/**
 * POST /api/intake/:short_id/ocr?t=<rawToken>
 *
 * 公開 (token-gated) 身分証 OCR. 招待トークン経由でのみ叩ける.
 * intake ごとに OCR は **最大 10 回まで** (CHECK 制約 + RPC で原子的に enforced).
 *
 * 濫用防御:
 *   - IP rate limit (identity_ocr preset: 10/600s)
 *   - intake token rate limit (token 単位で 10/600s)
 *   - intake_attempts カウンタ (最大 10 回)
 *
 * Body: multipart/form-data
 *   - image, expected
 *
 * ★ 本人確認(KYC) ではない. 結果は DB に永続化しない. ★
 */
import { NextRequest } from "next/server";
import { apiOk, apiValidationError, apiInternalError, apiError, apiNotFound } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { logger } from "@/lib/logger";
import { runIdentityOcr } from "@/lib/ai/identityOcr";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { validateIntakeToken, incrementOcrAttempts } from "@/lib/identity/intakeServer";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXPECTED = new Set([
  "driver_license",
  "mynumber_card_front",
  "residence_card",
  "passport",
  "health_insurance_card",
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ short_id: string }> }) {
  // 1) IP rate limit
  const ipLimit = await checkRateLimit(req, "identity_ocr");
  if (ipLimit) return ipLimit;

  // 2) token 検証
  const { short_id } = await ctx.params;
  const rawToken = req.nextUrl.searchParams.get("t");
  if (!rawToken) return apiValidationError("token (t) は必須です");

  const intake = await validateIntakeToken(short_id, rawToken);
  if (!intake) return apiNotFound("招待が見つかりません");
  if (intake.status !== "pending") {
    return apiError({
      code: "forbidden",
      status: 403,
      message:
        intake.status === "completed"
          ? "この招待はすでに送信されています"
          : intake.status === "expired"
            ? "この招待は期限切れです"
            : "この招待は無効化されています",
    });
  }

  // 3) token 単位 rate limit (token を identifier に)
  const tokenLimit = await checkRateLimit(req, "identity_ocr", `intake:${intake.id}`);
  if (tokenLimit) return tokenLimit;

  // 4) OCR 回数カウンタ (アトミック)
  const ok = await incrementOcrAttempts(intake.id);
  if (!ok) {
    return apiError({
      code: "rate_limited",
      status: 429,
      message: "この招待での OCR 利用回数の上限に達しました。手動で入力してください。",
    });
  }

  // 5) multipart 解析
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiValidationError("Content-Type は multipart/form-data を指定してください");
  }
  const form = await req.formData().catch(() => null);
  if (!form) return apiValidationError("multipart の解析に失敗しました");

  const file = form.get("image");
  const expectedRaw = form.get("expected");

  if (!(file instanceof File)) return apiValidationError("image フィールドにファイルを添付してください");
  if (file.size === 0) return apiValidationError("ファイルが空です");
  if (file.size > MAX_FILE_BYTES) {
    return apiValidationError(`画像サイズが ${MAX_FILE_BYTES / 1024 / 1024} MB を超えています`);
  }
  const mime = file.type;
  if (!ALLOWED_MIME.has(mime)) return apiValidationError("対応形式は JPEG / PNG / WebP です");

  let expected: string | undefined;
  if (typeof expectedRaw === "string" && expectedRaw.length > 0) {
    if (!ALLOWED_EXPECTED.has(expectedRaw)) return apiValidationError("expected の値が不正です");
    expected = expectedRaw;
  }

  const log = logger.child({
    route: "POST /api/intake/:short_id/ocr",
    intakeId: intake.id,
    tenantId: intake.tenantId,
    expected,
    mime,
    sizeBytes: file.size,
  });

  // 顧客向け (intake) は停止しない方針: コストキャップへの計上のみ行う。
  const usage = startAiRouteUsage("/api/intake/ocr");
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const { result, status } = await runIdentityOcr({
      base64,
      mediaType: mime as "image/jpeg" | "image/png" | "image/webp",
      expected: expected as
        "driver_license" | "mynumber_card_front" | "residence_card" | "passport" | "health_insurance_card" | undefined,
    });

    // OCR 実行ぶんをテナント (店舗) の月次キャップに計上 (顧客向けでも課金は店舗側)。
    usage.record({
      tenantId: intake.tenantId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ocr_status: status, source: "intake" },
    });

    log.info("intake_ocr_complete", {
      ocr_status: status,
      doc_type: result.doc_type,
      confidence: result.confidence,
      field_count: Object.keys(result.fields).length,
      rejected_count: result.rejected_reasons.length,
    });

    if (status === "rejected") {
      log.warn("intake_ocr_rejected", { reasons_count: result.rejected_reasons.length });
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
    usage.record({ tenantId: intake.tenantId, outcome: "error" });
    return apiInternalError(err, "POST /api/intake/:short_id/ocr");
  }
}
