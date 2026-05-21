/**
 * Background Sync API のクライアント側登録 + フォールバック。
 *
 * 対応ブラウザ (主に Chromium 系) では、Service Worker が OS-level でネットワーク
 * 復帰を検知して `sync` イベントを起こせる。これにより **タブが閉じていても**
 * outbox が drain される。
 *
 * 未対応ブラウザ (Safari 含む) では何もしない。既存の `online` イベントによる
 * フォアグラウンド同期 (OfflineBanner) がフォールバックとして残る。
 *
 * 呼び出しタイミング:
 *   - outbox に新規アイテムを enqueue した直後 (enqueueOrFetch / enqueueOrFetchMultipart)
 *   - OfflineBanner マウント時 (ページ訪問時のリトライ機会)
 */

const SYNC_TAG = "drain-outbox";

/**
 * "sync" タグを Service Worker に登録する。
 * 戻り値: 登録に成功すれば true、対応していないか失敗で false。
 *
 * 失敗しても呼び出し元の処理は止めない。手動同期パス (OfflineBanner) が残るので
 * 単なる「ベターエフォート」のレイヤと割り切る。
 */
export async function registerOutboxBackgroundSync(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    // SyncManager は標準型に含まれないため `any` で安全にプロパティを参照する
    // (Firefox / Safari では undefined)。
    const sync = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (!sync || typeof sync.register !== "function") return false;
    await sync.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

/**
 * Service Worker に postMessage で手動 drain をトリガする。
 * 開発・テスト用 (ユーザの「今すぐ同期」操作を SW スコープで実行できる)。
 */
export async function triggerSwDrainOutbox(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return false;
    reg.active.postMessage({ type: "drain-outbox" });
    return true;
  } catch {
    return false;
  }
}

/**
 * SW からの "outbox-drained" 通知を購読する。
 * OfflineBanner などが UI 更新 (queueCount の refresh) のために使う。
 *
 * @returns 解除関数
 */
export function subscribeOutboxDrainedFromSw(callback: () => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }
  const handler = (event: MessageEvent) => {
    if (event.data && event.data.type === "outbox-drained") {
      callback();
    }
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
