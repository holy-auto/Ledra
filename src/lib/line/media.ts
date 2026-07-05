import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * LINE 受信メディアの取得・保存。
 *
 * LINE の message content は受信から一定期間しか取得できないため、
 * webhook 受信時に即ダウンロードして Storage (非公開バケット line-media) に
 * 永続化する。表示は API が発行する署名付き URL 経由。
 */

export const LINE_MEDIA_BUCKET = "line-media";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * LINE content API からメディアを取得して Storage に保存する。
 *
 * @returns 保存パスと MIME タイプ。取得/保存に失敗したら null (呼び出し側は
 *          プレースホルダ本文のみで記録を続行する fail-soft)。
 */
export async function fetchAndStoreLineMedia(params: {
  tenantId: string;
  accessToken: string;
  messageId: string;
}): Promise<{ path: string; contentType: string } | null> {
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${params.messageId}/content`, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    if (!res.ok) {
      logger.warn("[line.media] content fetch failed", { status: res.status, messageId: params.messageId });
      return null;
    }
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    const buf = new Uint8Array(await res.arrayBuffer());

    const ext = EXT_BY_MIME[contentType] ?? "bin";
    const path = `${params.tenantId}/${params.messageId}.${ext}`;

    const admin = createServiceRoleAdmin("LINE media persistence — webhook lacks auth session");
    const { error } = await admin.storage.from(LINE_MEDIA_BUCKET).upload(path, buf, {
      contentType,
      upsert: true, // LINE の再配信 (同一 messageId) は同内容なので上書きで冪等
    });
    if (error) {
      logger.warn("[line.media] storage upload failed", { err: error.message, path });
      return null;
    }
    return { path, contentType };
  } catch (e) {
    logger.warn("[line.media] fetchAndStoreLineMedia threw", {
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
