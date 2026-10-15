import type { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  CERTIFICATE_MEDIA_BUCKET,
  ALLOWED_VIDEO_MIME,
  MAX_VIDEO_BYTES,
  detectMediaMime,
  extensionForMime,
} from "@/lib/certificateMedia";

/**
 * Storage へ直接アップロードされた動画の実物を確かめる（先頭 64 バイトで形式、Content-Range で大きさ）。
 * 全体をダウンロードしない（最大 100MB を関数のメモリに載せない）。
 */
export async function inspectStoredVideo(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  path: string,
): Promise<{ ok: true; data: { mime: string; ext: string; size: number } } | { ok: false; error: string }> {
  const { data: signed } = await admin.storage.from(CERTIFICATE_MEDIA_BUCKET).createSignedUrl(path, 60);
  if (!signed?.signedUrl)
    return { ok: false, error: "アップロードした動画が見つかりません。もう一度アップロードしてください。" };
  const res = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-63" } });
  if (!res.ok) return { ok: false, error: "アップロードした動画が見つかりません。もう一度アップロードしてください。" };
  const head = Buffer.from(await res.arrayBuffer());
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length") ?? NaN);
  const mime = detectMediaMime(head);
  if (!mime || !(ALLOWED_VIDEO_MIME as readonly string[]).includes(mime)) {
    return { ok: false, error: "動画の形式は MP4 / MOV のみ対応しています。" };
  }
  if (!Number.isFinite(total) || total <= 0 || total > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      error: `ファイルサイズが大きすぎます (上限 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB)。`,
    };
  }
  return { ok: true, data: { mime, ext: extensionForMime(mime), size: total } };
}
