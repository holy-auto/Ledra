"use client";

import { useCallback, useEffect, useState } from "react";
import { listOutbox, removeOutboxItem, drainOutbox } from "@/lib/outbox/queue";
import type { OutboxItem } from "@/lib/outbox/types";

/**
 * 証明書一覧ページ上部に表示する「保留中の証明書」セクション。
 *
 * オフライン時に Outbox に enqueue された証明書発行リクエストを、ユーザが
 * 一覧で確認・取消・手動再送できる UI。
 *
 * 表示条件: kind === "certificate_create" の outbox 行が 1 件以上ある時のみ。
 * オンライン + キュー 0 件のときは何も描画しない。
 */

type PendingItem = {
  id: string;
  label: string;
  customerName: string | null;
  createdAt: number;
  attempts: number;
  lastError: string | null;
};

function deriveCustomerName(item: OutboxItem): string | null {
  if (!item.bodyJson) return null;
  try {
    const body = JSON.parse(item.bodyJson) as { customer_name?: string };
    return body.customer_name ?? null;
  } catch {
    return null;
  }
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "たった今";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} 分前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 時間前`;
  const days = Math.floor(hours / 24);
  return `${days} 日前`;
}

export default function PendingOfflineCerts() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await listOutbox();
    const certItems = all
      .filter((it) => it.kind === "certificate_create")
      .map<PendingItem>((it) => ({
        id: it.id,
        label: it.label,
        customerName: deriveCustomerName(it),
        createdAt: it.createdAt,
        attempts: it.attempts,
        lastError: it.lastError,
      }));
    setItems(certItems);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleSync = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await drainOutbox();
      if (r.succeeded > 0) {
        setMessage(`${r.succeeded} 件を発行しました。証明書一覧を更新してください。`);
      } else if (r.failed > 0) {
        setMessage(`${r.failed} 件の同期に失敗しました。`);
      } else {
        setMessage("同期する保留中アイテムはありませんでした。");
      }
    } finally {
      setBusy(false);
      refresh();
    }
  }, [busy, refresh]);

  const handleCancel = useCallback(
    async (id: string, customerName: string | null) => {
      const label = customerName ?? "保留中の証明書";
      if (!confirm(`${label} の発行リクエストをキューから削除します。よろしいですか？`)) return;
      await removeOutboxItem(id);
      refresh();
    },
    [refresh],
  );

  if (items.length === 0) return null;

  return (
    <section className="glass-card border-l-4 border-warning p-4 space-y-3" data-testid="pending-offline-certs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-warning">PENDING</div>
          <div className="mt-0.5 text-base font-semibold text-primary">保留中の証明書: {items.length} 件</div>
          <p className="mt-1 text-xs text-muted">
            オフライン中に発行リクエストを保存しました。通信状態を確認して「今すぐ同期」を押すか、
            このページを開いたまま自動同期をお待ちください。
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={busy}
          className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? "同期中…" : "🔄 今すぐ同期"}
        </button>
      </div>

      {message && <div className="text-xs text-secondary">{message}</div>}

      <ul className="divide-y divide-border-subtle text-sm">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-primary truncate">{it.customerName ?? "(顧客名 未取得)"}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <span>{formatRelative(it.createdAt)}</span>
                {it.attempts > 0 && <span className="text-warning">試行 {it.attempts} 回</span>}
                {it.lastError && (
                  <span className="text-danger truncate" title={it.lastError}>
                    エラー: {it.lastError.slice(0, 80)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCancel(it.id, it.customerName)}
              className="btn-ghost text-xs px-2 py-1 text-danger hover:text-danger"
              aria-label="保留を取消"
            >
              取消
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
