/**
 * POST /api/admin/certificates/delivery-note-extract
 *
 * 証明書発行フォーム用: コーティング剤/フィルムの納品書を撮影・アップロードすると、
 * AI Vision (deliveryNoteOcr) が明細(品名・品番)を読み取り、コーティング剤セクションの
 * 下書き入力として返す。何も保存しない (発行前のドラフト補助のみ)。
 *
 * minPlan: standard 以上 (ai_draft 機能と同条件)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { detectMagicByteMime } from "@/lib/media/magicBytes";
import { extractDeliveryNote, type ImageMediaType } from "@/lib/ai/deliveryNoteOcr";
import { loadAiAutomationSettings, isSourceAllowed } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const SUPPORTED_MIME = new Set<ImageMediaType>(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // viewer は証明書の作成・編集権限が無い。閲覧のみのロールが AI Vision 呼び出し
    // (テナントのAIコスト消費) を叩けないよう、他の証明書系ルートと同じ staff 以上を要求する。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const tier = normalizePlanTier(caller.planTier);
    if (!canUseFeature(tier, "ai_draft")) {
      return apiForbidden("この機能は Standard プラン以上で利用できます。");
    }

    const limited = await checkRateLimit(req, "ai", `delivery-note-extract:${caller.tenantId}`);
    if (limited) return limited;

    const form = await req.formData();
    const file = form.get("delivery_note");
    if (!(file instanceof File) || file.size === 0) {
      return apiValidationError("納品書ファイル (delivery_note) が必要です。");
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError(`ファイルサイズが大きすぎます (上限 ${MAX_FILE_BYTES / 1024 / 1024}MB)。`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = detectMagicByteMime(buffer);
    if (!mime || !SUPPORTED_MIME.has(mime as ImageMediaType)) {
      return apiValidationError("対応していないファイル形式です (JPEG・PNG・WebP・GIF のみ)。");
    }

    // AI マスタースイッチ OFF、または「書類画像を Vision に送る」情報源が無効化されていれば
    // 画像を Anthropic に送らずスキップする（納品書の読取は車検証OCR/膜厚OCRと同じ
    // 「書類画像→フィールド抽出」なので identity_documents で判定、既存ルートと同一パターン）。
    const usage = startAiRouteUsage("/api/admin/certificates/delivery-note-extract");
    const aiSettings = await loadAiAutomationSettings(caller.tenantId);
    if (!aiSettings.enabled || !isSourceAllowed(aiSettings, "identity_documents")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({
        lines: [],
        supplier_name: null,
        notice: "AI 自動入力が停止中のため読み取りを実行しませんでした。手動で入力してください。",
      });
    }

    const extract = await extractDeliveryNote(buffer.toString("base64"), mime as ImageMediaType);
    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      meta: { line_count: extract.lines.length },
    });

    return apiOk({
      lines: extract.lines.map((l) => ({ label: l.label, code: l.code })),
      supplier_name: extract.supplier_name,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "certificates/delivery-note-extract");
  }
}
