"use client";
import { useState, useCallback, useEffect } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

type Status = {
  enabled: boolean;
  address: string | null;
  domain_configured: boolean;
};

export default function EmailInboundSection() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email-inbound", { cache: "no-store" });
      const j = await parseJsonSafe<Status & { message?: string; error?: string }>(res);
      if (res.ok && j) setStatus(j);
      else setErr(j?.message ?? j?.error ?? `状態の取得に失敗しました (HTTP ${res.status})`);
    } catch {
      setErr("状態の取得に失敗しました。再読み込みしてください。");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/email-inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const j = await parseJsonSafe<Status & { message?: string; error?: string }>(res);
      if (!res.ok || !j) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setStatus(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = () => {
    if (!status?.address) return;
    navigator.clipboard.writeText(status.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const enabled = status?.enabled ?? false;

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">
        予約メールを専用アドレスへ<span className="font-medium text-primary">自動転送</span>
        するだけで、AIが日程・車両・内容を読み取り、確認付きで予約・カレンダーに取り込みます（LINEと同じ仕組み）。
      </p>

      {/* Status */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">ステータス:</span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${enabled ? "text-success" : "text-muted"}`}>
          <span className={`w-2 h-2 rounded-full ${enabled ? "bg-success" : "bg-[var(--text-muted)]"}`} />
          {enabled ? "有効" : "無効"}
        </span>
      </div>

      {err && <div className="text-sm text-red-500">{err}</div>}

      {/* 受信アドレス */}
      {enabled && status?.address && (
        <div>
          <div className="text-xs text-muted mb-1">転送先アドレス（このアドレスへ予約メールを自動転送）:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-[var(--bg-inset)] border border-border-subtle rounded-lg px-3 py-2 text-secondary break-all">
              {status.address}
            </code>
            <button type="button" onClick={copyAddress} className="btn-ghost text-xs shrink-0">
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
        </div>
      )}

      {/* ドメイン未設定時の注意 (アドレスが出せない) */}
      {enabled && !status?.address && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          受信ドメインが未設定のため転送先アドレスを発行できません。管理者にお問い合わせください （環境変数
          INBOUND_EMAIL_DOMAIN の設定が必要です）。
        </div>
      )}

      {/* 手順 */}
      {enabled && status?.address && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer hover:text-secondary transition-colors">
            転送設定の手順（Gmail の例）
          </summary>
          <ol className="mt-2 ml-4 space-y-1 list-decimal">
            <li>Gmail の「設定」→「メール転送とPOP/IMAP」→「転送先アドレスを追加」で上記アドレスを追加</li>
            <li>確認メールが上記アドレス宛に届き、Ledra 側で自動承認されます（数分で有効化）</li>
            <li>
              予約サイト等からのメールだけを転送したい場合は、Gmail の「フィルタ」で条件を付けて
              「転送する」を選ぶと便利です
            </li>
          </ol>
        </details>
      )}

      {/* Action */}
      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          className={enabled ? "btn-secondary text-sm" : "btn-primary text-sm"}
          disabled={busy}
          onClick={() => toggle(!enabled)}
        >
          {busy ? "処理中..." : enabled ? "無効にする" : "有効にする"}
        </button>
      </div>
    </div>
  );
}
