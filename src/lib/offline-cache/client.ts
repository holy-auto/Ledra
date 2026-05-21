/**
 * オフライン読み取りキャッシュ (Service Worker 側で管理) の制御 + 状態取得。
 *
 * SW (`public/sw.js`) は admin の HTML ページと選択的 API GET レスポンスを
 * stale-while-revalidate でキャッシュする。本モジュールはその制御を担う。
 *
 * 用途:
 *   - ログアウト時に `clearOfflineReadCache()` を呼んでユーザデータを消す
 *   - SWR レスポンス等で `isFromCache()` を呼んで「オフライン表示中」UI 出し分け
 */

/**
 * Service Worker に postMessage で HTML / API キャッシュ全消去を依頼する。
 * ログアウト / テナント切替時に呼ぶ前提 (異なるユーザ間でのデータ漏洩を防ぐ)。
 */
export async function clearOfflineReadCache(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return false;
    reg.active.postMessage({ type: "clear-offline-cache" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Response が SW キャッシュから返ったかどうか + キャッシュの age (ms) を読む。
 *
 * SW (`staleWhileRevalidate`) が以下のヘッダを付与する前提:
 *   - X-From-Cache: "1"
 *   - X-Cache-Age-Ms: 数値文字列
 */
export interface CacheInfo {
  fromCache: boolean;
  ageMs: number | null;
}

export function readCacheInfo(response: Response | undefined | null): CacheInfo {
  if (!response) return { fromCache: false, ageMs: null };
  const fromCache = response.headers.get("X-From-Cache") === "1";
  const raw = response.headers.get("X-Cache-Age-Ms");
  const ageMs = raw == null ? null : Number(raw);
  return { fromCache, ageMs: Number.isFinite(ageMs) ? ageMs : null };
}

/** 経過 ms を「N 分前」等にフォーマット (相対表記)。 */
export function formatCacheAge(ageMs: number | null): string {
  if (ageMs == null) return "";
  if (ageMs < 60_000) return "たった今";
  const min = Math.floor(ageMs / 60_000);
  if (min < 60) return `${min} 分前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 時間前`;
  const days = Math.floor(hours / 24);
  return `${days} 日前`;
}
