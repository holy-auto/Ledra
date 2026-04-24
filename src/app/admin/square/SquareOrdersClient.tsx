"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useState, useEffect } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Pagination from "@/components/ui/Pagination";
import { formatDateTime, formatJpy } from "@/lib/format";
import { fetcher } from "@/lib/swr";
import type { SquareOrder, SquareConnection } from "@/types/square";
import type { BadgeVariant } from "@/lib/statusMaps";
import SquareLinkModal from "./SquareLinkModal";
import SyncHistoryPanel from "./SyncHistoryPanel";

type PaginationInfo = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

type SquareOrdersData = {
  orders: SquareOrder[];
  pagination?: PaginationInfo;
  connection?: SquareConnection | null;
};

const orderStateVariant = (s: string): BadgeVariant => {
  switch (s) {
    case "COMPLETED":
      return "success";
    case "OPEN":
      return "info";
    case "CANCELED":
      return "danger";
    default:
      return "default";
  }
};

const orderStateLabel = (s: string): string => {
  switch (s) {
    case "COMPLETED":
      return "完了";
    case "OPEN":
      return "オープン";
    case "CANCELED":
      return "キャンセル";
    default:
      return s;
  }
};

export default function SquareOrdersClient() {
  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 50;

  // Connect
  const [connecting, setConnecting] = useState(false);

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Link modal
  const [linkTarget, setLinkTarget] = useState<SquareOrder | null>(null);

  // Sync history panel
  const [showSyncHistory, setShowSyncHistory] = useState(false);

  // Detect query params from OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const squareParam = params.get("square");
    if (squareParam === "connected") {
      setSyncMsg({ text: "Squareアカウントが正常に接続されました。", ok: true });
    } else if (squareParam === "error") {
      const reason = params.get("reason") ?? "";
      setSyncMsg({ text: `Square接続エラー: ${reason || "不明なエラー"}`, ok: false });
    } else if (squareParam === "denied") {
      setSyncMsg({ text: "Squareアカウントの接続が拒否されました。", ok: false });
    }
    if (squareParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete("square");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Build SWR key
  const swrKey = (() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", String(perPage));
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    return `/api/admin/square/orders?${params.toString()}`;
  })();

  const {
    data,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useSWR<SquareOrdersData>(swrKey, fetcher, {
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 2000,
  });

  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;
  const isConnected = data?.connection?.status === "active";

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/admin/square/connect", { method: "POST" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.auth_url) window.location.href = j.auth_url;
    } catch (e: any) {
      setSyncMsg({ text: e?.message ?? "接続に失敗しました", ok: false });
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/admin/square/sync", { method: "POST" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSyncMsg({
        text: `同期完了: ${j.orders_imported ?? 0}件取り込み`,
        ok: true,
      });
      mutate();
    } catch (e: any) {
      setSyncMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSyncing(false);
    }
  };

  const handleFilter = () => {
    setPage(1);
    mutate();
  };

  const handleClearFilter = () => {
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const handleLinkSave = () => {
    setLinkTarget(null);
    mutate();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="SQUARE"
        title="Square 売上"
        description="Square POSから取り込んだ売上データを管理します。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => setShowSyncHistory(!showSyncHistory)}>
              {showSyncHistory ? "同期履歴を閉じる" : "同期履歴"}
            </button>
            {isConnected && (
              <button type="button" className="btn-primary" disabled={syncing} onClick={handleSync}>
                {syncing ? "同期中…" : "手動同期"}
              </button>
            )}
            {isConnected && data?.connection?.last_synced_at && (
              <span className="text-xs text-muted w-full sm:w-auto text-right">
                最終同期: {formatDateTime(data.connection.last_synced_at)}
              </span>
            )}
          </div>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-danger">{err}</div>}

      {/* Not connected state */}
      {data && !isConnected && (
        <section className="glass-card p-8 text-center space-y-4">
          <div className="text-muted text-sm">Squareアカウントが接続されていません。</div>
          <button type="button" className="btn-primary" disabled={connecting} onClick={handleConnect}>
            {connecting ? "接続中…" : "Squareアカウントを接続してください →"}
          </button>
        </section>
      )}

      {/* Sync message */}
      {syncMsg && <div className={`text-sm ${syncMsg.ok ? "text-success" : "text-danger"}`}>{syncMsg.text}</div>}

      {/* Sync history panel */}
      {showSyncHistory && <SyncHistoryPanel />}

      {data && isConnected && (
        <>
          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">開始日</label>
                <input
                  type="date"
                  className="input-field"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">終了日</label>
                <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <button type="button" className="btn-secondary" onClick={handleFilter}>
                絞り込み
              </button>
              <button type="button" className="btn-ghost" onClick={handleClearFilter}>
                クリア
              </button>
            </div>
          </section>

          {/* Orders Table */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">売上一覧</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      日時
                    </th>
                    <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      金額
                    </th>
                    <th className="hidden sm:table-cell text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      決済方法
                    </th>
                    <th className="hidden md:table-cell text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      Square注文ID
                    </th>
                    <th className="hidden md:table-cell text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      顧客
                    </th>
                    <th className="hidden lg:table-cell text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      車両
                    </th>
                    <th className="hidden lg:table-cell text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      証明書
                    </th>
                    <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      ステータス
                    </th>
                    <th className="text-left px-3 sm:px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {(data.orders ?? []).map((order) => (
                    <tr key={order.id} className="hover:bg-surface-hover/60">
                      <td className="px-3 sm:px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDateTime(order.square_created_at)}
                      </td>
                      <td className="px-3 sm:px-5 py-3.5 font-medium text-primary">{formatJpy(order.total_amount)}</td>
                      <td className="hidden sm:table-cell px-3 sm:px-5 py-3.5 text-secondary">
                        {order.payment_methods.length > 0 ? order.payment_methods.join(", ") : "-"}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-5 py-3.5">
                        <span className="font-mono text-xs text-muted">{order.square_order_id.slice(0, 12)}…</span>
                        {order.square_receipt_url && (
                          <a
                            href={order.square_receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 text-accent hover:underline text-xs"
                          >
                            領収書
                          </a>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-3 sm:px-5 py-3.5 text-secondary">
                        {order.customer_name ?? <span className="text-muted">未紐付</span>}
                      </td>
                      <td className="hidden lg:table-cell px-3 sm:px-5 py-3.5 text-secondary">
                        {order.vehicle_display ?? <span className="text-muted">-</span>}
                      </td>
                      <td className="hidden lg:table-cell px-3 sm:px-5 py-3.5 text-secondary">
                        {order.certificate_id ? (
                          <Badge variant="success">紐付済</Badge>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-5 py-3.5">
                        <Badge variant={orderStateVariant(order.order_state)}>
                          {orderStateLabel(order.order_state)}
                        </Badge>
                      </td>
                      <td className="px-3 sm:px-5 py-3.5">
                        <button
                          type="button"
                          className="btn-ghost px-3 py-1 text-xs"
                          onClick={() => setLinkTarget(order)}
                        >
                          {order.customer_id ? "編集" : "紐付け"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(data.orders ?? []).length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-5 py-8 text-center text-muted">
                        まだSquare売上が取り込まれていません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.pagination && (
              <div className="p-4 border-t border-border-subtle">
                <Pagination
                  page={data.pagination.page}
                  totalPages={data.pagination.total_pages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </section>
        </>
      )}

      {/* Link Modal */}
      {linkTarget && <SquareLinkModal order={linkTarget} onClose={() => setLinkTarget(null)} onSave={handleLinkSave} />}
    </div>
  );
}
