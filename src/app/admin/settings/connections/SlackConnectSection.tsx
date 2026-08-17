"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

type Props = {
  /** tenants の webhook 列が入っているか（＝実際に通知が飛ぶか）が真の接続状態 */
  configured: boolean;
  /** 表示用。OAuth で繋いだ場合のみ入る */
  workspaceName: string | null;
  channel: string | null;
  /** SLACK_CLIENT_ID / SLACK_CLIENT_SECRET が運営側で設定済みか */
  available: boolean;
};

export default function SlackConnectSection({ configured, workspaceName, channel, available }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const call = async (method: "POST" | "DELETE") => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/connect/slack", { method });
      const j = await parseJsonSafe<{ auth_url?: string; message?: string; error?: string }>(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      if (method === "POST" && j?.auth_url) {
        window.location.href = j.auth_url;
        return;
      }
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">
        Slackワークスペースにログインして投稿先チャンネルを選ぶだけで連携できます。Webhook
        URLを自分で発行する必要はありません。
      </p>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">ステータス:</span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${configured ? "text-success" : "text-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${configured ? "bg-success" : "bg-[var(--text-muted)]"}`} />
          {configured ? "連携中" : "未連携"}
        </span>
      </div>

      {configured && (workspaceName || channel) && (
        <div className="space-y-0.5 text-xs text-muted">
          {workspaceName && <div>ワークスペース: {workspaceName}</div>}
          {channel && <div>投稿先: {channel.startsWith("#") ? channel : `#${channel}`}</div>}
        </div>
      )}

      {configured && !workspaceName && (
        <p className="text-xs text-muted">
          手入力したWebhook URLで連携中です。「Slackで連携」を押すと、ログインだけの連携に切り替えられます。
        </p>
      )}

      {!available && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-secondary">
          Slack連携は運営側の設定（SLACK_CLIENT_ID / SLACK_CLIENT_SECRET）待ちです。設定後にご利用いただけます。
        </div>
      )}

      {err && <div className="text-sm text-red-500">{err}</div>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={busy || !available}
          onClick={() => call("POST")}
        >
          {busy ? "処理中…" : configured ? "連携先を変更" : "Slackで連携"}
        </button>
        {configured && (
          <button
            type="button"
            className="px-3 py-1.5 text-sm text-red-500 transition-colors hover:text-red-700"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Slack連携を解除しますか？予約通知の投稿が止まります。")) call("DELETE");
            }}
          >
            連携解除
          </button>
        )}
      </div>
    </div>
  );
}
