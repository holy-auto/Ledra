import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { LINE_MEDIA_BUCKET } from "@/lib/line/media";
import { logger } from "@/lib/logger";

/**
 * attachment_path を持つメッセージ行に署名付き URL (attachment_url) を付与する。
 *
 * line-media バケットは非公開のため、表示のたびに短命の署名 URL を発行する。
 * 発行失敗時は attachment_url: null のまま返す (本文プレースホルダは残る)。
 */
export async function withAttachmentUrls<T extends Record<string, unknown>>(messages: T[]): Promise<T[]> {
  const paths = [...new Set(messages.map((m) => m.attachment_path).filter((p): p is string => typeof p === "string"))];
  if (paths.length === 0) return messages;

  try {
    const admin = createServiceRoleAdmin("signed URL issue for LINE media attachments — read-only, short-lived");
    const { data, error } = await admin.storage.from(LINE_MEDIA_BUCKET).createSignedUrls(paths, 3600);
    if (error) throw error;
    const urlByPath = new Map(
      (data ?? []).filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]),
    );
    return messages.map((m) =>
      typeof m.attachment_path === "string" ? { ...m, attachment_url: urlByPath.get(m.attachment_path) ?? null } : m,
    );
  } catch (e) {
    logger.warn("[messages.attachments] signed url issue failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    return messages;
  }
}
