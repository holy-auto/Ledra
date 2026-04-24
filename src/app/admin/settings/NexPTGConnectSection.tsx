"use client";

import { useState, useCallback, useEffect } from "react";

type Status = {
  status: "active" | "not_set";
  masked: string | null;
};

export default function NexPTGConnectSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<"key" | "url" | null>(null);

  const endpointUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/external/nexptg/sync` : "/api/external/nexptg/sync";

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tenant/external-api-key");
      const j = await res.json().catch((): null => null);
      if (res.ok && j) setStatus({ status: j.status, masked: j.masked });
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleIssue = async () => {
    const msg = status?.status === "active" ? "新しいキーを発行すると既存のキーは無効になります。続行しますか？" : null;
    if (msg && !window.confirm(msg)) return;

    setBusy(true);
    setErr(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/tenant/external-api-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "issue" }),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setRevealedKey(j.key);
      setStatus({ status: "active", masked: j.masked });
      setSuccessMsg("新しいAPIキーを発行しました。下記のキーは今回のみ表示されます。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm("APIキーを無効化すると、NexPTG・外部予約からの同期が停止します。続行しますか？")) return;

    setBusy(true);
    setErr(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/tenant/external-api-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const j = await res.json().catch((): null => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setRevealedKey(null);
      setStatus({ status: "not_set", masked: null });
      setSuccessMsg("APIキーを無効化しました。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, which: "key" | "url") => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const isActive = status?.status === "active";

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">
        NexPTG（膜厚計）アプリの「Synchronization」設定に以下のURLとAPIキーを登録すると、測定レポート保存時にデータがLedraへ自動同期されます。
      </p>

      {/* Status */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">ステータス:</span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${isActive ? "text-success" : "text-muted"}`}>
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-success" : "bg-[var(--text-muted)]"}`} />
          {isActive ? "キー発行済み" : "未発行"}
        </span>
        {isActive && status?.masked && <span className="text-xs font-mono text-muted">{status.masked}</span>}
      </div>

      {/* Endpoint URL */}
      <div>
        <div className="text-xs text-muted mb-1">エンドポイントURL（NexPTGアプリに設定）:</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-[var(--bg-inset)] border border-border-subtle rounded-lg px-3 py-2 text-secondary break-all">
            {endpointUrl}
          </code>
          <button type="button" onClick={() => copy(endpointUrl, "url")} className="btn-ghost text-xs shrink-0">
            {copied === "url" ? "コピー済み" : "コピー"}
          </button>
        </div>
      </div>

      {/* Revealed key (one-time) */}
      {revealedKey && (
        <div className="rounded-xl border border-warning/30 bg-warning-dim px-4 py-3 space-y-2">
          <div className="text-xs font-semibold text-warning">⚠ このキーは今回のみ表示されます。必ず控えてください。</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-[var(--bg-inset)] border border-border-subtle rounded-lg px-3 py-2 text-secondary break-all">
              {revealedKey}
            </code>
            <button type="button" onClick={() => copy(revealedKey, "key")} className="btn-ghost text-xs shrink-0">
              {copied === "key" ? "コピー済み" : "コピー"}
            </button>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-success/30 bg-success-dim px-4 py-3 text-sm text-success">
          {successMsg}
        </div>
      )}

      {err && <div className="text-sm text-red-500">{err}</div>}

      {/* Setup guide */}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer hover:text-secondary transition-colors">設定手順を確認</summary>
        <ol className="mt-2 ml-4 space-y-1 list-decimal">
          <li>「APIキーを発行」ボタンを押してキーを生成</li>
          <li>表示されたキーをコピー（再表示不可のため必ず控える）</li>
          <li>NexPTGアプリで「Synchronization」タブを開く</li>
          <li>URL 欄に上記エンドポイントURLを貼り付け</li>
          <li>ユーザー名/パスワード欄は空欄のまま、APIキーは <code className="font-mono">x-api-key</code> ヘッダで送信される想定</li>
          <li>Android: レポート保存時に自動同期 / iOS: 手動で同期ボタンを押下</li>
        </ol>
        <p className="mt-2 text-xs">
          ※ このキーは外部予約API（/api/external/booking）と共通です。再発行すると両方の連携が一度切断されます。
        </p>
      </details>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <button type="button" className="btn-primary text-sm" disabled={busy} onClick={handleIssue}>
          {busy ? "処理中..." : isActive ? "キーを再発行" : "APIキーを発行"}
        </button>
        {isActive && (
          <button
            type="button"
            className="text-sm text-red-500 hover:text-red-700 transition-colors px-3 py-1.5"
            disabled={busy}
            onClick={handleRevoke}
          >
            無効化
          </button>
        )}
      </div>
    </div>
  );
}
