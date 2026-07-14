import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * LINE 受信メディア (画像/動画/音声/ファイル/スタンプ) の取得・保存。
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
  "video/mp4": "mp4",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
};

function extForMime(contentType: string): string {
  if (EXT_BY_MIME[contentType]) return EXT_BY_MIME[contentType];
  // 未知の MIME はサブタイプをそのまま拡張子に (application/zip → zip)。記号は除去。
  const sub = contentType
    .split("/")[1]
    ?.replace(/^x-/, "")
    .replace(/[^a-z0-9]/gi, "");
  return sub || "bin";
}

/** URL からダウンロードして line-media バケットに保存する共通処理。 */
async function fetchAndStore(params: {
  url: string;
  headers?: Record<string, string>;
  tenantId: string;
  /** バケット内のファイル名 (拡張子抜き)。呼び出し側で形式検証済みであること。 */
  key: string;
  /** true なら取得したバイト列も返す (OCR 等、保存に加えてその場でデータが要る呼び出し側向け)。 */
  returnBuffer?: boolean;
}): Promise<{ path: string; contentType: string; buf?: Uint8Array } | null> {
  try {
    const res = await fetch(params.url, { headers: params.headers });
    if (!res.ok) {
      logger.warn("[line.media] content fetch failed", { status: res.status, key: params.key });
      return null;
    }
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    const buf = new Uint8Array(await res.arrayBuffer());

    const path = `${params.tenantId}/${params.key}.${extForMime(contentType)}`;
    const admin = createServiceRoleAdmin("LINE media persistence — webhook lacks auth session");
    const { error } = await admin.storage.from(LINE_MEDIA_BUCKET).upload(path, buf, {
      contentType,
      upsert: true, // LINE の再配信 (同一 messageId) は同内容なので上書きで冪等
    });
    if (error) {
      logger.warn("[line.media] storage upload failed", { err: error.message, path });
      return null;
    }
    return { path, contentType, ...(params.returnBuffer ? { buf } : {}) };
  } catch (e) {
    logger.warn("[line.media] fetchAndStore threw", {
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * LINE content API からメディア (画像/動画/音声/ファイル) を取得して Storage に保存する。
 *
 * @returns 保存パスと MIME タイプ。取得/保存に失敗したら null (呼び出し側は
 *          プレースホルダ本文のみで記録を続行する fail-soft)。
 */
export async function fetchAndStoreLineMedia(params: {
  tenantId: string;
  accessToken: string;
  messageId: string;
  returnBuffer?: boolean;
}): Promise<{ path: string; contentType: string; buf?: Uint8Array } | null> {
  // messageId は webhook ペイロード由来 (信頼境界の外)。URL・Storage パスに
  // 埋め込む前に形式を検証し、パストラバーサル/リクエスト改変を防ぐ。
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(params.messageId)) {
    logger.warn("[line.media] rejected malformed messageId", { messageId: params.messageId.slice(0, 80) });
    return null;
  }
  return fetchAndStore({
    url: `https://api-data.line.me/v2/bot/message/${encodeURIComponent(params.messageId)}/content`,
    headers: { Authorization: `Bearer ${params.accessToken}` },
    tenantId: params.tenantId,
    key: params.messageId,
    returnBuffer: params.returnBuffer,
  });
}

/**
 * スタンプ画像を LINE の公開 CDN から取得して Storage に保存する。
 * (content API はスタンプ非対応のため CDN の静的画像を使う。
 *  アニメーションスタンプも静止画で表示される。)
 */
export async function fetchAndStoreLineSticker(params: {
  tenantId: string;
  stickerId: string;
}): Promise<{ path: string; contentType: string } | null> {
  if (!/^[0-9]{1,20}$/.test(params.stickerId)) {
    logger.warn("[line.media] rejected malformed stickerId", { stickerId: params.stickerId.slice(0, 40) });
    return null;
  }
  return fetchAndStore({
    url: `https://stickershop.line-scdn.net/stickershop/v1/sticker/${params.stickerId}/android/sticker.png`,
    tenantId: params.tenantId,
    key: `sticker-${params.stickerId}`,
  });
}

/**
 * 店舗→顧客の送信画像を Storage に保存し、LINE が配信時に参照する
 * 長期署名 URL を発行する。
 *
 * LINE の image message は https の公開 URL を要求するため、非公開バケットの
 * まま長期 (10年) の署名 URL を渡す。URL を知る人だけがアクセスできる点は
 * LINE 自身の content 配信と同等のモデル。
 */
export async function storeOutboundImage(params: {
  tenantId: string;
  buf: Uint8Array;
  contentType: string;
}): Promise<{ path: string; url: string } | null> {
  try {
    const path = `${params.tenantId}/outbound/${crypto.randomUUID()}.${extForMime(params.contentType)}`;
    const admin = createServiceRoleAdmin("LINE outbound media persistence — admin push");
    const { error } = await admin.storage.from(LINE_MEDIA_BUCKET).upload(path, params.buf, {
      contentType: params.contentType,
    });
    if (error) {
      logger.warn("[line.media] outbound upload failed", { err: error.message, path });
      return null;
    }
    const TEN_YEARS_SEC = 10 * 365 * 24 * 60 * 60;
    const { data, error: signErr } = await admin.storage.from(LINE_MEDIA_BUCKET).createSignedUrl(path, TEN_YEARS_SEC);
    if (signErr || !data?.signedUrl) {
      logger.warn("[line.media] outbound sign failed", { err: signErr?.message, path });
      return null;
    }
    return { path, url: data.signedUrl };
  } catch (e) {
    logger.warn("[line.media] storeOutboundImage threw", {
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
