/**
 * PUT /api/certificates/images/[id]/annotations
 *
 * Phase 2: 写真 Image Markup
 * 1 枚の certificate_image に対する注釈ドキュメントを保存する。
 *
 * - tenant スコープ + role チェック (owner/admin/staff) は
 *   resolveCallerWithRole + 既存の certificate_images_update_v3
 *   ポリシーに準ずる。サーバー側でも tenantId を WHERE に入れて二重ロックする。
 * - 注釈は派生メタなので、保存しても storage_path / sha256 / 真正性
 *   グレードは触らない。これにより既存のアンカリング根拠が崩れない。
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
  apiValidationError,
  apiForbidden,
} from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hasMinRole } from "@/lib/auth/roles";
import { type AnnotationDocument, isAnnotationDocument } from "@/components/imageMarkup/types";

export const runtime = "nodejs";

/** PUT body: { annotations: AnnotationDocument | null } */
type PutBody = {
  annotations?: unknown;
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "staff")) {
      return apiForbidden("注釈を保存する権限がありません。");
    }

    const { id } = await params;
    if (!id) return apiNotFound("画像が見つかりません。");

    let body: PutBody;
    try {
      body = (await req.json()) as PutBody;
    } catch {
      return apiValidationError("JSON ボディが不正です。");
    }

    // null 明示で注釈を消すケースも許容する。
    let annotations: AnnotationDocument | null;
    if (body.annotations === null || body.annotations === undefined) {
      annotations = null;
    } else if (isAnnotationDocument(body.annotations)) {
      annotations = body.annotations;
    } else {
      return apiValidationError("annotations の形式が不正です。");
    }

    // 注釈の上限 (悪意ある巨大ペイロード対策)。
    if (annotations && annotations.annotations.length > 500) {
      return apiValidationError("注釈の数が上限 (500) を超えています。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 画像の所属確認。tenant_id WHERE で二重ロック。
    const { data: imageRow } = await admin
      .from("certificate_images")
      .select("id, tenant_id, certificate_id, rendered_storage_path")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!imageRow) return apiNotFound("画像が見つかりません。");

    // annotations が null (削除) の場合のみ rendered_* もクリア + Storage 上の
    // 焼き込み画像を削除する。更新の場合は POST /render が原子的に置き換えるため、
    // ここでクリアすると render endpoint が「前の rendered_storage_path」を参照
    // できなくなり、Storage に孤児が残る。
    const previousRendered = imageRow.rendered_storage_path as string | null;
    const updatePayload: Record<string, unknown> = {
      annotations,
      annotated_at: annotations ? new Date().toISOString() : null,
      annotated_by: annotations ? caller.userId : null,
    };
    if (annotations === null) {
      updatePayload.rendered_storage_path = null;
      updatePayload.rendered_at = null;
    }

    const { error: updateError } = await admin
      .from("certificate_images")
      .update(updatePayload)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (updateError) {
      console.error("[annotations PUT] update error", updateError);
      return apiInternalError(updateError, "annotations PUT");
    }

    // 削除フローのみ: DB がクリアされたあとで Storage の旧 rendered を best-effort で削除。
    // (失敗してもユーザーには成功扱い。次回 render 時にも見落としは無いので孤児ファイルが残るのみ)
    if (annotations === null && previousRendered) {
      admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .remove([previousRendered])
        .catch((err) => console.warn("[annotations PUT] previous rendered cleanup failed", err));
    }

    return apiOk({
      id,
      annotated: annotations !== null,
      count: annotations?.annotations.length ?? 0,
    });
  } catch (e) {
    return apiInternalError(e, "annotations PUT");
  }
}
