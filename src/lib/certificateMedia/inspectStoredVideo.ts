import type { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  CERTIFICATE_MEDIA_BUCKET,
  ALLOWED_VIDEO_MIME,
  MAX_VIDEO_BYTES,
  detectMediaMime,
  extensionForMime,
} from "@/lib/certificateMedia";

export type InspectResult =
  | { ok: true; data: { mime: string; ext: string; size: number } }
  /** definitive=true: 中身が不正（形式・大きさ・拡張子の食い違い）と確定した。false: 一時的に確かめられなかった */
  | { ok: false; error: string; definitive: boolean };

const NOT_READABLE =
  "アップロードした動画を確認できませんでした。少し待ってから、もう一度「メディアを追加」を押してください。";

/**
 * Storage へ直接アップロードされた動画の実物を確かめる（先頭 64 バイトで形式、Content-Range で大きさ）。
 * 全体をダウンロードしない（最大 100MB を関数のメモリに載せない）。Range が効かず 206 以外が返ったら本文を読まずに捨てる。
 */
export async function inspectStoredVideo(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  path: string,
): Promise<InspectResult> {
  const { data: signed } = await admin.storage.from(CERTIFICATE_MEDIA_BUCKET).createSignedUrl(path, 60);
  if (!signed?.signedUrl) return { ok: false, error: NOT_READABLE, definitive: false };
  let res: Response;
  try {
    res = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-63" } });
  } catch {
    return { ok: false, error: NOT_READABLE, definitive: false };
  }
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  if (res.status !== 206 || !Number.isFinite(total)) {
    await res.body?.cancel();
    return { ok: false, error: NOT_READABLE, definitive: false };
  }
  const head = Buffer.from(await res.arrayBuffer());
  const mime = detectMediaMime(head);
  if (!mime || !(ALLOWED_VIDEO_MIME as readonly string[]).includes(mime)) {
    return { ok: false, error: "動画の形式は MP4 / MOV のみ対応しています。", definitive: true };
  }
  // 保存パスの拡張子は upload-url が申告の形式から決めたもの。実物と食い違えば、保存時の Content-Type も違っている
  if (!path.endsWith(`.${extensionForMime(mime)}`)) {
    return { ok: false, error: "動画の形式が申告と一致しません。もう一度アップロードしてください。", definitive: true };
  }
  if (total <= 0 || total > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      error: `ファイルサイズが大きすぎます (上限 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB)。`,
      definitive: true,
    };
  }
  return { ok: true, data: { mime, ext: extensionForMime(mime), size: total } };
}
