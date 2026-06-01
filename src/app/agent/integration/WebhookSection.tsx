"use client";

import { useEffect, useState } from "react";

/**
 * 受注確定 Webhook の設定。受信 URL を表示し、署名シークレットを生成/再生成する。
 * シークレットは生成時に一度だけ表示される (以後は表示されない)。
 */
export default function WebhookSection() {
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [configured, setConfigured] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent/supply/webhook-secret", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        if (j?.ok) {
          setWebhookUrl(j.webhook_url ?? "");
          setConfigured(Boolean(j.configured));
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rotate = async () => {
    if (configured && !confirm("シークレットを再生成すると、現在のシークレットは無効になります。よろしいですか？"))
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agent/supply/webhook-secret", { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "生成に失敗しました。" });
        return;
      }
      setNewSecret(j.secret ?? null);
      setConfigured(true);
      setMsg({ ok: true, text: "シークレットを生成しました。下の値を控えてください（再表示されません）。" });
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, which: "url" | "secret") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  if (loading) return null;

  return (
    <div className="glass-card p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-primary">受注確定 Webhook</h2>
        <p className="text-xs text-muted">
          発注を受け付けた際に、貴社システムから下記 URL へ POST すると発注の状態が更新されます（任意）。
        </p>
      </div>

      <label className="block">
        <div className="text-xs text-muted mb-1">受信 URL</div>
        <div className="flex gap-2">
          <input value={webhookUrl} readOnly className="input-field w-full font-mono text-xs" />
          <button type="button" onClick={() => copy(webhookUrl, "url")} className="btn-ghost text-xs shrink-0">
            {copied === "url" ? "✓" : "コピー"}
          </button>
        </div>
      </label>

      <div className="text-xs text-muted leading-relaxed">
        本文を署名シークレットで HMAC-SHA256 署名し、
        <code className="mx-1 rounded bg-surface-hover px-1">X-Ledra-Signature: sha256=&lt;hex&gt;</code>
        ヘッダで送ってください。本文例:
        <code className="ml-1 rounded bg-surface-hover px-1">{`{ "po_number": "...", "status": "accepted", "external_order_id": "..." }`}</code>
      </div>

      {newSecret && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
          <div className="text-xs font-semibold text-amber-500">署名シークレット（この画面でのみ表示されます）</div>
          <div className="flex gap-2">
            <input value={newSecret} readOnly className="input-field w-full font-mono text-xs" />
            <button type="button" onClick={() => copy(newSecret, "secret")} className="btn-ghost text-xs shrink-0">
              {copied === "secret" ? "✓" : "コピー"}
            </button>
          </div>
        </div>
      )}

      {msg && <div className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={rotate} disabled={busy} className="btn-primary text-sm">
          {busy ? "生成中..." : configured ? "シークレットを再生成" : "署名シークレットを生成"}
        </button>
        <span className="text-xs text-muted">{configured ? "設定済み" : "未設定"}</span>
      </div>
    </div>
  );
}
