"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

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
  /** Square 端末のペアリング。ここが済むと会計画面から端末に QR を出せる。 */
  const [device, setDevice] = useState<{ status: string; device_id: string | null } | null>(null);
  const [pairingCode, setPairingCode] = useState<{ id: string; code: string } | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);

  // fetchStatus は useEffect から参照されるので先に定義する
  // (React Compiler は temporal-dead-zone を error 扱いするため)
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/square/connect");
      const j = await parseJsonSafe(res);
      if (res.ok && j) {
        setConnection(j);
      }
    } catch {
      // silently ignore
    }
  }, []);

  const fetchDevice = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/square/device");
      const j = await parseJsonSafe(res);
      if (res.ok && j) setDevice(j as { status: string; device_id: string | null });
    } catch {
      // 端末の状態が取れなくても接続そのものの表示は続ける
    }
  }, []);

  /** ペアリング用のコードを発行する。店員が端末に入力する。 */
  const handlePairDevice = useCallback(async () => {
    setDeviceBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/square/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ledra POS" }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error((j as { message?: string })?.message ?? "ペアリングコードを発行できませんでした");
      setPairingCode({ id: (j as { device_code_id: string }).device_code_id, code: (j as { code: string }).code });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ペアリングコードを発行できませんでした");
    } finally {
      setDeviceBusy(false);
    }
  }, []);

  /** 端末側で入力が済んだかを確認し、済んでいれば保存する。 */
  const handleCheckPairing = useCallback(async () => {
    if (!pairingCode) return;
    setDeviceBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/square/device?device_code_id=${encodeURIComponent(pairingCode.id)}`);
      const j = (await parseJsonSafe(res)) as { status?: string; device_id?: string | null } | null;
      if (!res.ok) throw new Error("ペアリングの状態を確認できませんでした");
      if (j?.status === "PAIRED" && j.device_id) {
        setDevice({ status: "PAIRED", device_id: j.device_id });
        setPairingCode(null);
        setSuccessMsg("Square 端末を接続しました。会計画面のQR決済が端末に出ます。");
      } else {
        setErr(`まだペアリングされていません（${j?.status ?? "UNKNOWN"}）。端末にコードを入力してください。`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ペアリングの状態を確認できませんでした");
    } finally {
      setDeviceBusy(false);
    }
  }, [pairingCode]);

  useEffect(() => {
    if (connection?.status === "active") void fetchDevice();
  }, [connection?.status, fetchDevice]);

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
  }, [fetchStatus]);

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
      const j = await parseJsonSafe(res);
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
      const j = await parseJsonSafe(res);
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
      const j = await parseJsonSafe(res);
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

      {/* Square 端末（QRコード決済） */}
      {status === "active" && (
        <div className="mt-3 rounded-lg border border-border-subtle p-3 space-y-2">
          <p className="text-sm font-medium text-primary">
            QRコード決済（PayPay / d払い / 楽天ペイ / au PAY / メルペイ ほか）
          </p>
          {device?.device_id ? (
            <p className="text-sm text-success">
              Square 端末に接続済み。会計画面で「QR決済」を選ぶと端末にQRが出ます。
            </p>
          ) : pairingCode ? (
            <div className="space-y-2">
              <p className="text-sm text-secondary">
                Square 端末に次のコードを入力してください（Square 端末 → 設定 → デバイスコード）。
              </p>
              <p className="font-mono text-2xl tracking-widest text-primary">{pairingCode.code}</p>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={deviceBusy}
                onClick={handleCheckPairing}
              >
                {deviceBusy ? "確認中…" : "入力が終わったら確認"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-secondary">
                Square 端末をつなぐと、会計画面から端末にQRを出せます（Ledra から移動しません）。端末が無い場合は Square
                アプリで会計し、この画面に戻って取り込みます。
              </p>
              <button type="button" className="btn-secondary text-sm" disabled={deviceBusy} onClick={handlePairDevice}>
                {deviceBusy ? "発行中…" : "Square 端末を接続する"}
              </button>
            </div>
          )}
          <p className="text-xs text-muted">
            ※ Square 側でQRコード決済の申請（1回で7ブランド）が必要です。権限を追加したため、以前から接続している場合は
            一度「切断する」→「Squareアカウントを接続」で繋ぎ直してください。
          </p>
        </div>
      )}

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
