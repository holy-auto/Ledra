"use client";

import { useState, useCallback, useEffect } from "react";
import type { SquareConnection, SquareConnectionStatus } from "@/types/square";
import { formatDateTime } from "@/lib/format";

type Props = {
  initialConnection?: SquareConnection | null;
};

const statusLabel: Record<SquareConnectionStatus, string> = {
  active: "接続済み",
  pending: "認証待ち",
  disconnected: "未接続",
  error: "エラー",
};

const statusColor: Record<SquareConnectionStatus, { dot: string; text: string }> = {
  active: { dot: "bg-success", text: "text-success" },
  pending: { dot: "bg-warning", text: "text-warning" },
  disconnected: { dot: "bg-[var(--text-muted)]", text: "text-muted" },
  error: { dot: "bg-red-500", text: "text-red-400" },
};

export default function SquareConnectSection({ initialConnection }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [connection, setConnection] = useState<SquareConnection | null>(initialConnection ?? null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "completed" | "error">("idle");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Check for ?square=connected query param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("square") === "connected") {
      setSuccessMsg("Squareアカウントが正常に接続されました。");
      // Clean up query param
      const url = new URL(window.location.href);
      url.searchParams.delete("square");
      window.history.replaceState({}, "", url.toString());
      // Refresh connection status
      fetchStatus();
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/square/connect");
      const j = await res.json().catch((): null => null);
      if (res.ok && j) {
        setConnection(j);
      }
    } catch {
      // silently ignore
    }
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/square/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          return_url: window.location.origin + "/admin/settings?square=connected",
        }),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      if (j?.auth_url) {
        window.location.href = j.auth_url;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Square連携を解除しますか？取り込み済みのデータは削除されません。")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/square/connect", { method: "DELETE" });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setConnection(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setSyncStatus("syncing");
    setErr(null);
    try {
      const res = await fetch("/api/admin/square/sync", { method: "POST" });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSyncStatus("completed");
      // Refresh connection to get updated last_synced_at
      await fetchStatus();
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 5000);
    }
  };

  const status = connection?.status ?? "disconnected";
  const isConnected = status === "active" || status === "pending";
  const colors = statusColor[status];

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">Squareアカウントを接続すると、POS売上データを自動的に取り込めます。</p>

      {/* Status indicator */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">ステータス:</span>
        <span className={`inline-flex items-center gap-1.5 ${colors.text} font-medium`}>
          <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
          {statusLabel[status]}
        </span>
      </div>

      {/* Connection details */}
      {isConnected && connection && (
        <div className="text-sm text-secondary space-y-1">
          {connection.square_merchant_id && (
            <div className="text-xs text-muted font-mono">Merchant ID: {connection.square_merchant_id}</div>
          )}
          {connection.square_location_ids.length > 0 && (
            <div className="text-xs text-muted">ロケーション数: {connection.square_location_ids.length}</div>
          )}
          <div>
            最終同期:{" "}
            <b className="text-primary">
              {connection.last_synced_at ? formatDateTime(connection.last_synced_at) : "未実行"}
            </b>
          </div>
        </div>
      )}

      {/* Sync status badge */}
      {syncStatus !== "idle" && (
        <div className="flex items-center gap-2 text-sm">
          {syncStatus === "syncing" && (
            <span className="inline-flex items-center gap-1.5 text-warning">
              <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              同期中…
            </span>
          )}
          {syncStatus === "completed" && (
            <span className="inline-flex items-center gap-1.5 text-success">
              <span className="w-2 h-2 rounded-full bg-success" />
              同期完了
            </span>
          )}
          {syncStatus === "error" && (
            <span className="inline-flex items-center gap-1.5 text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              同期エラー
            </span>
          )}
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="rounded-xl border border-success/30 bg-success-dim px-4 py-3 text-sm text-success">
          {successMsg}
        </div>
      )}

      {/* Error */}
      {err && <div className="text-sm text-red-500">{err}</div>}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {!isConnected && (
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={handleConnect}>
            {busy ? "処理中…" : "Squareアカウントを接続"}
          </button>
        )}
        {status === "error" && (
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={handleConnect}>
            {busy ? "処理中…" : "再接続する"}
          </button>
        )}
        {isConnected && (
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={syncStatus === "syncing"}
            onClick={handleSync}
          >
            {syncStatus === "syncing" ? "同期中…" : "手動同期"}
          </button>
        )}
        {isConnected && (
          <button type="button" className="btn-ghost text-sm" onClick={fetchStatus}>
            ステータスを更新
          </button>
        )}
        {isConnected && (
          <button
            type="button"
            className="text-sm text-red-500 hover:text-red-700 transition-colors px-3 py-1.5"
            disabled={busy}
            onClick={handleDisconnect}
          >
            切断する
          </button>
        )}
      </div>

      {/* Connected hint */}
      {status === "active" && (
        <div className="mt-3 rounded-lg bg-success-dim border border-success/30 p-3">
          <p className="text-sm text-success">
            Square売上データは自動的に同期されます。
            <a href="/admin/square" className="underline ml-1">
              Square売上一覧を見る →
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
