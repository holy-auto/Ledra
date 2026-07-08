"use client";

/**
 * 未紐づけ顧客に LINE 連携コードを発行するボタン。
 *
 * 押下時に POST /api/parts/line-link-codes を叩き、返ってきた短いコードと有効期限を
 * 表示する。スタッフはこのコードを顧客に伝え、顧客が LINE 公式アカウントへ送信すると
 * webhook (tryConsumeLineLinkCode) が顧客に紐づける (LIFF / OAuth 不要)。
 */
import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function LinkCodeButton({ customerId }: { customerId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function issue() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/parts/line-link-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const j = (await parseJsonSafe(res)) as { code?: string; expiresAt?: string; message?: string } | null;
      if (!res.ok || !j?.code || !j?.expiresAt) {
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }
      setResult({ code: j.code, expiresAt: j.expiresAt });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="mt-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs space-y-1">
        <div className="text-muted">
          この連携コードをお客様に伝え、LINE で送信してもらってください（{formatExpiry(result.expiresAt)}まで有効）:
        </div>
        <div className="flex items-center gap-2">
          <code className="text-lg font-mono font-bold tracking-widest text-accent">{result.code}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(result.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="btn-ghost text-xs"
          >
            {copied ? "コピー済み" : "コピー"}
          </button>
          <button type="button" onClick={() => setResult(null)} className="text-xs underline text-muted">
            再発行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={issue} disabled={busy} className="btn-secondary text-xs disabled:opacity-50">
        {busy ? "発行中…" : "🔗 連携コードを発行"}
      </button>
      {err && <p className="mt-1 text-xs text-danger-text">{err}</p>}
    </div>
  );
}
