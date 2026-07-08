/**
 * 証明書メディア (動画 / Before-After / 360°パノラマ) の共有定数・型・ユーティリティ。
 * Phase 3「インタラクティブ証明書ビュー」 の実装用。
 *
 * 静止画 (certificate_images) は @/lib/certificateImages 側で管理する。
 */

import { detectMagicByteMime } from "@/lib/media/magicBytes";

export const CERTIFICATE_MEDIA_BUCKET = "assets";

/** Storage 内の prefix。 certificate-images とパスを衝突させないため `media/` を使う。 */
export const CERTIFICATE_MEDIA_STORAGE_PREFIX = "media";

/** DB の media_type CHECK 制約と一致 */
export const MEDIA_TYPES = ["video", "before_after", "panorama360"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** 初版で実装するタイプ (panorama360 はスキーマだけ確保し、Viewer は未実装)。 */
export const SUPPORTED_MEDIA_TYPES: readonly MediaType[] = ["video", "before_after"] as const;

export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/quicktime"] as const;
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png"] as const;

/** 1 ファイルあたり上限 (動画は短尺前提、イベント参照のみ)。 */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * 動画と画像の両方を判定するマジックバイト検証。
 * 既存の certificate_images upload 側にある画像専用の validateMagicBytes と
 * 同じスタイルで、video/mp4 (ftyp 'isom'/'mp42'/'avc1'/'iso2' 等) と
 * video/quicktime (ftyp 'qt  ') を追加判定する。
 *
 * @returns 検出した MIME (image/jpeg, image/png, video/mp4, video/quicktime)、
 *   それ以外は null。
 */
export function detectMediaMime(buffer: Buffer): string | null {
  const mime = detectMagicByteMime(buffer);
  // certificate メディアは JPEG / PNG 静止画と mp4 / quicktime 動画のみ許可。
  return mime === "image/jpeg" || mime === "image/png" || mime === "video/mp4" || mime === "video/quicktime"
    ? mime
    : null;
}

/** 拡張子を MIME から決定する (Storage パス組み立て用)。 */
export function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    default:
      return "bin";
  }
}

/** 公開向けに DB レコードを正規化したビュー型 (公開ページ + ギャラリー共用)。 */
export type CertificateMediaRow = {
  id: string;
  media_type: MediaType;
  storage_path: string;
  before_path: string | null;
  poster_path: string | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  sort_order: number;
  content_type: string | null;
  file_size: number | null;
  created_at: string | null;
  /** AI 生成のビフォーアフター差分サマリ (before_after のみ)。 */
  diff_summary: string | null;
  /** diff_summary の生成時刻 (admin 経由で再生成すると更新)。 */
  diff_summary_generated_at: string | null;
};

/** 公開向けに storage_path を URL に解決した形 (page.tsx で扱いやすくするため)。 */
export type ResolvedCertificateMedia = CertificateMediaRow & {
  url: string | null;
  before_url: string | null;
  poster_url: string | null;
};

/** 署名付き URL の既定有効秒数 (公開ページのキャッシュ寿命と揃える)。 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

type StorageLikeClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, ttl: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

async function signOne(client: StorageLikeClient, path: string | null, ttl: number): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await client.storage.from(CERTIFICATE_MEDIA_BUCKET).createSignedUrl(path, ttl);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * 1 つの media レコードを ResolvedCertificateMedia (署名 URL 付き) に変換する。
 * 公開ページ・管理画面の双方から再利用できるよう Storage クライアントを引数で受ける。
 */
export async function resolveCertificateMedia(
  client: StorageLikeClient,
  row: CertificateMediaRow,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<ResolvedCertificateMedia> {
  const [url, before_url, poster_url] = await Promise.all([
    signOne(client, row.storage_path, ttlSeconds),
    signOne(client, row.before_path, ttlSeconds),
    signOne(client, row.poster_path, ttlSeconds),
  ]);
  return { ...row, url, before_url, poster_url };
}
