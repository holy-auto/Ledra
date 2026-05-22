/**
 * POST /api/admin/certificate-media/[id]/generate-diff
 *
 * 指定の certificate_media (media_type='before_after') に対し、
 * Before/After 画像を Claude Vision に渡して差分サマリを生成する。
 *
 * 結果は certificate_media.diff_summary に永続化し、その後の
 * 公開ページ表示で再利用 (毎回の Vision 呼び出しを避ける)。
 *
 * 認可: admin role 以上 (cost のかかる AI 呼び出しなのでスタッフ不可)
 *
 * Errors:
 *   401 unauthorized      — 未ログイン
 *   403 forbidden         — admin 未満
 *   404 not_found         — 該当 media が無い / 別テナント
 *   422 validation_error  — before_after 以外 / 画像 MIME 非対応
 *   429 rate_limited      — AI 呼び出しレート上限
 *   500 internal_error    — Storage 取得 / Vision API 失敗
 */
import type { NextRequest } from "next/server";
import {
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiJson,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { generateBeforeAfterDiff, normalizeImageMimeType } from "@/lib/ai/beforeAfterDiff";
import { CERTIFICATE_MEDIA_BUCKET } from "@/lib/certificateMedia";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type MediaRow = {
  id: string;
  tenant_id: string;
  media_type: string;
  storage_path: string;
  before_path: string | null;
  content_type: string | null;
};

async function fetchImage(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  path: string,
): Promise<{ base64: string; contentType: string } | null> {
  const { data, error } = await admin.storage.from(CERTIFICATE_MEDIA_BUCKET).download(path);
  if (error || !data) {
    logger.warn("storage.download failed", { path, error: error?.message });
    return null;
  }
  const ab = await data.arrayBuffer();
  return {
    base64: Buffer.from(ab).toString("base64"),
    contentType: data.type || "application/octet-stream",
  };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!hasMinRole(caller.role, "admin")) {
      return apiForbidden("この機能には管理者権限が必要です。");
    }

    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return apiValidationError("メディアIDの形式が不正です。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: rawRow } = await admin
      .from("certificate_media")
      .select("id, tenant_id, media_type, storage_path, before_path, content_type")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    const row = rawRow as MediaRow | null;

    if (!row) return apiNotFound("メディアが見つかりません。");
    if (row.media_type !== "before_after") {
      return apiValidationError("Before/After メディアではありません。");
    }
    if (!row.before_path) {
      return apiValidationError("Before 画像が登録されていません。");
    }

    // 両画像を Storage からダウンロード (並列)
    const [beforeFile, afterFile] = await Promise.all([
      fetchImage(admin, row.before_path),
      fetchImage(admin, row.storage_path),
    ]);

    if (!beforeFile || !afterFile) {
      return apiInternalError(new Error("Image download failed"), "generate-diff:storage");
    }

    const beforeMime = normalizeImageMimeType(beforeFile.contentType);
    const afterMime = normalizeImageMimeType(afterFile.contentType);
    if (!beforeMime || !afterMime) {
      return apiValidationError("サポート対象外の画像形式です。JPEG / PNG / WebP のみ対応しています。");
    }

    const result = await generateBeforeAfterDiff({
      beforeBase64: beforeFile.base64,
      beforeMediaType: beforeMime,
      afterBase64: afterFile.base64,
      afterMediaType: afterMime,
    });

    // 比較不可と判定されたらサマリは保存せず、UI には事由だけ返す
    if (!result.comparePossible) {
      return apiJson({
        ok: true,
        compare_possible: false,
        reason: result.summary,
      });
    }

    // 永続化
    const generatedAt = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("certificate_media")
      .update({
        diff_summary: result.summary,
        diff_summary_generated_at: generatedAt,
        diff_summary_model: result.model,
      })
      .eq("id", row.id)
      .eq("tenant_id", caller.tenantId);

    if (updateErr) {
      logger.error("certificate_media diff update failed", { error: updateErr.message });
      return apiInternalError(updateErr, "generate-diff:update");
    }

    return apiJson({
      ok: true,
      compare_possible: true,
      summary: result.summary,
      highlights: result.highlights,
      generated_at: generatedAt,
    });
  } catch (e) {
    return apiInternalError(e, "admin/certificate-media/[id]/generate-diff");
  }
}
