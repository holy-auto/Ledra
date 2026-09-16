/**
 * POST /api/certificates/images/[id]/render
 *
 * Phase 2: 写真 Image Markup
 * 注釈付き画像を Storage に焼き込み、rendered_storage_path を更新する。
 *
 * - 原本 (storage_path) は触らず、別オブジェクトとして保存する。
 *   sha256 / authenticity_grade / polygon_tx_hash 等のアンカリング根拠は
 *   原本に紐付くため不変。
 * - 焼き込みは sharp + SVG オーバーレイ。SVG 生成は src/lib/imageMarkup/toSvg.ts。
 * - 大きな画像のメモリ使用に備え、ルートには maxDuration を確保する。
 */

import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages/constants";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiValidationError,
} from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hasMinRole } from "@/lib/auth/roles";
import { isAnnotationDocument } from "@/components/imageMarkup/types";
import { renderAnnotatedImage } from "@/lib/imageMarkup/render";

export const runtime = "nodejs";
// sharp + Storage 往復で時間がかかる。Vercel Hobby の 10 秒で 504 にならないよう
// 既存の upload ルートに合わせて 60 秒確保する。
export const maxDuration = 60;

function pickRenderedExt(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "staff")) {
      return apiForbidden("注釈を焼き込む権限がありません。");
    }

    const { id } = await params;
    if (!id) return apiNotFound("画像が見つかりません。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 注釈 + storage_path + content_type を取得。
    const { data: imageRow } = await admin
      .from("certificate_images")
      .select("id, tenant_id, certificate_id, storage_path, content_type, annotations, rendered_storage_path")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!imageRow) return apiNotFound("画像が見つかりません。");

    const annotations = imageRow.annotations;
    if (!annotations) {
      return apiValidationError("この画像には注釈がありません。");
    }
    if (!isAnnotationDocument(annotations)) {
      return apiValidationError("annotations の形式が不正です。");
    }
    if (annotations.annotations.length === 0) {
      return apiValidationError("この画像には注釈がありません。");
    }
    if (!imageRow.storage_path) {
      return apiValidationError("画像のストレージパスがありません。");
    }

    // 原画像をダウンロード。
    const { data: originalBlob, error: dlError } = await admin.storage
      .from(CERTIFICATE_IMAGE_BUCKET)
      .download(imageRow.storage_path);
    if (dlError || !originalBlob) {
      console.error("[render POST] download error", dlError);
      return apiInternalError(dlError, "render download");
    }
    const originalArrayBuffer = await originalBlob.arrayBuffer();
    const sourceBuffer = Buffer.from(originalArrayBuffer);

    const sourceMime = imageRow.content_type ?? "image/jpeg";

    // sharp で焼き込み。
    let rendered;
    try {
      rendered = await renderAnnotatedImage(sourceBuffer, sourceMime, annotations);
    } catch (e) {
      console.error("[render POST] sharp render error", e);
      return apiInternalError(e, "render compose");
    }

    // 既存 rendered があれば後始末 (失敗は致命的ではない)。
    const previousRendered = imageRow.rendered_storage_path;

    const ext = pickRenderedExt(rendered.contentType);
    const renderedPath = `${imageRow.tenant_id}/${imageRow.certificate_id}/rendered/${imageRow.id}_${Date.now()}.${ext}`;

    const { error: upError } = await admin.storage
      .from(CERTIFICATE_IMAGE_BUCKET)
      .upload(renderedPath, rendered.buffer, {
        contentType: rendered.contentType,
        upsert: false,
      });
    if (upError) {
      console.error("[render POST] upload error", upError);
      return apiInternalError(upError, "render upload");
    }

    const { error: updError } = await admin
      .from("certificate_images")
      .update({
        rendered_storage_path: renderedPath,
        rendered_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);
    if (updError) {
      console.error("[render POST] update error", updError);
      // ストレージへの孤児を残さないよう、書いたばかりのオブジェクトを掃除。
      admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .remove([renderedPath])
        .catch((err) => console.warn("[render POST] orphan cleanup failed", err));
      return apiInternalError(updError, "render update");
    }

    // 旧 rendered を削除 (失敗してもユーザーには成功扱い)。
    if (previousRendered && previousRendered !== renderedPath) {
      admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .remove([previousRendered])
        .catch((err) => console.warn("[render POST] previous rendered cleanup failed", err));
    }

    return apiOk({
      id,
      rendered_storage_path: renderedPath,
      content_type: rendered.contentType,
      width: rendered.width,
      height: rendered.height,
    });
  } catch (e) {
    return apiInternalError(e, "render POST");
  }
}
