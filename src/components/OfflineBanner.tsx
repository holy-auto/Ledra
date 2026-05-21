"use client";

import { useCallback, useEffect, useState } from "react";
import { countOutbox, drainOutbox } from "@/lib/outbox/queue";
import { registerOutboxBackgroundSync, subscribeOutboxDrainedFromSw } from "@/lib/outbox/backgroundSync";

/**
 * グローバルなオフライン状態 / 同期待ちアイテム表示バナー。
 *
 * - navigator.onLine + online/offline イベントで状態追跡
 * - オンライン復帰時に自動で drainOutbox を 1 回試行
 * - 同期待ちアイテムが N 件あれば「N 件 同期待ち」を常時バッジ表示
 * - 「今すぐ同期」ボタンで手動再試行
 *
 * 管理画面 (/admin) 全体に置く前提なので、画面下部の固定 toast 風配置にする。
 * 認知負荷を最小化するため、オンライン + キュー 0 件のときは何も描画しない。
 */

export default function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refreshCount = useCallback(async () => {
    const c = await countOutbox();
    setQueueCount(c);
  }, []);

  useEffect(() => {
    refreshCount();
    const handleOnline = () => {
      setOnline(true);
      // 復帰直後に自動同期を試行
      void (async () => {
        setSyncing(true);
        try {
          const r = await drainOutbox();
          if (r.succeeded > 0) {
            setLastResult(`${r.succeeded} 件を同期しました`);
          } else if (r.failed > 0) {
            setLastResult(`同期失敗 ${r.failed} 件 (後ほど自動再試行します)`);
          }
        } finally {
          setSyncing(false);
          refreshCount();
        }
      })();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Background Sync 登録 (タブ閉時の OS-level 同期。対応ブラウザのみ動く)
    void registerOutboxBackgroundSync();

    // SW から "outbox-drained" 通知 (SW がバックグラウンドで drain した直後) を購読し、
    // queueCount を即時 refresh する
    const unsubscribe = subscribeOutboxDrainedFromSw(() => {
      refreshCount();
      setLastResult("バックグラウンドで同期しました");
    });

    // 周期的にカウント refresh (キュー追加は他 Tab/SW から起きうるため)
    const interval = setInterval(refreshCount, 15_000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
      clearInterval(interval);
    };
  }, [refreshCount]);

  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setLastResult(null);
    try {
      const r = await drainOutbox();
      if (r.succeeded === 0 && r.failed === 0) {
        setLastResult("同期待ちはありません");
      } else if (r.failed === 0) {
        setLastResult(`${r.succeeded} 件を同期しました`);
      } else {
        setLastResult(`${r.succeeded} 件成功 / ${r.failed} 件失敗`);
      }
    } finally {
      setSyncing(false);
      refreshCount();
    }
  };

  // オンライン + キュー 0 件 = 何も描画しない (UI を邪魔しない)
  if (online && queueCount === 0 && !lastResult) return null;

  const isOffline = !online;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border bg-surface shadow-lg backdrop-blur-sm"
      style={{
        borderColor: isOffline ? "rgb(239 68 68 / 0.4)" : queueCount > 0 ? "rgb(234 179 8 / 0.4)" : undefined,
      }}
    >
      <div className="flex items-start gap-3 p-3">
        <span aria-hidden className="text-xl mt-0.5">
          {isOffline ? "📡" : queueCount > 0 ? "⏳" : "✅"}
        </span>
        <div className="min-w-0 flex-1 text-xs">
          {isOffline ? (
            <div>
              <div className="font-semibold text-primary">オフラインです</div>
              <div className="mt-0.5 text-muted">
                通信が復帰すると、{queueCount > 0 ? `保留中の ${queueCount} 件を含む` : ""}
                作業内容を自動同期します。
              </div>
            </div>
          ) : queueCount > 0 ? (
            <div>
              <div className="font-semibold text-primary">{queueCount} 件 同期待ち</div>
              <div className="mt-0.5 text-muted">ネットワークが安定すると自動で送信されます。</div>
              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncing}
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-hover px-2 py-1 text-[11px] font-medium text-primary hover:bg-surface-active disabled:opacity-50"
              >
                {syncing ? "同期中…" : "🔄 今すぐ同期"}
              </button>
            </div>
          ) : lastResult ? (
            <div>
              <div className="font-semibold text-primary">同期完了</div>
              <div className="mt-0.5 text-muted">{lastResult}</div>
            </div>
          ) : null}
        </div>
        {!isOffline && lastResult && (
          <button
            type="button"
            onClick={() => setLastResult(null)}
            className="text-muted hover:text-secondary text-base"
            aria-label="閉じる"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
