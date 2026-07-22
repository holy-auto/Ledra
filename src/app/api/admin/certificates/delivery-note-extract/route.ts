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
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { detectMagicByteMime } from "@/lib/media/magicBytes";
import { extractDeliveryNote, type ImageMediaType } from "@/lib/ai/deliveryNoteOcr";

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

    const extract = await extractDeliveryNote(buffer.toString("base64"), mime as ImageMediaType);

    return apiOk({
      lines: extract.lines.map((l) => ({ label: l.label, code: l.code })),
      supplier_name: extract.supplier_name,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "certificates/delivery-note-extract");
  }
}
