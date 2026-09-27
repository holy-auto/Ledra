"use client";

import { useEffect, useState } from "react";

type Request = {
  id: string;
  certificate_public_id: string;
  insurer_name: string | null;
  insurer_reason: string | null;
  insurer_requested_at: string;
};

/**
 * 保険会社からの個人情報（氏名）開示申請に、オーナー本人が同意するパネル。
 * 申請が無い・customer_id の無いセッション（401）のときは何も出さない。
 * API: /api/customer/pii-consent（src/lib/insurer/ownerConsent.ts）
 */
export default function PiiConsentPanel({ tenantSlug }: { tenantSlug: string }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/customer/pii-consent?tenant=${encodeURIComponent(tenantSlug)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRequests(j?.requests ?? []))
      .catch((): void => undefined);
  }, [tenantSlug]);

  async function consent(id: string) {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/pii-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenant_slug: tenantSlug, consent_id: id }),
      });
      const j = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error((j?.message as string) ?? "同意の記録に失敗しました");
      setRequests((rs) => rs.filter((r) => r.id !== id));
      setMsg({ ok: true, text: "同意を記録しました。" });
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "エラーが発生しました" });
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0 && !msg) return null;

  return (
    <div className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800/50 dark:bg-amber-950">
      <div className="text-sm font-semibold text-amber-900 dark:text-amber-300">保険会社からの開示申請</div>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-400">
        保険会社が、お客様の施工証明書について氏名の開示を申請しています。同意するまで氏名は開示されません。
        お心当たりのない申請には同意しないでください。
      </p>

      <ul className="mt-3 space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="rounded-xl border border-amber-200 bg-surface p-3 text-sm dark:border-amber-800/50">
            <div className="font-semibold text-primary">{r.insurer_name ?? "保険会社"}</div>
            <div className="mt-1 text-muted">
              証明書 {r.certificate_public_id.slice(0, 8)}… ／ 申請日 {r.insurer_requested_at.slice(0, 10)}
            </div>
            {r.insurer_reason ? <div className="mt-1 text-secondary">理由: {r.insurer_reason}</div> : null}
            <button
              onClick={() => consent(r.id)}
              disabled={busyId === r.id}
              className="mt-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {busyId === r.id ? "記録中…" : "氏名の開示に同意する"}
            </button>
          </li>
        ))}
      </ul>

      {msg ? (
        <div
          className={`mt-2 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-success-dim text-success-text" : "bg-danger-dim text-danger-text"}`}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}
