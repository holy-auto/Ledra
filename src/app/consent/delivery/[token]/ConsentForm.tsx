"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

export default function ConsentForm({
  token,
  consentText,
  consentVersion,
}: {
  token: string;
  consentText: string;
  consentVersion: string;
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/consent/delivery/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consent_version: consentVersion, agreed: true }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? "記録できませんでした。時間をおいて再度お試しください。");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "記録できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-gray-100 text-sm leading-relaxed">
        ご承諾を記録しました。ありがとうございました。承諾はいつでも撤回でき、撤回後は書面でお渡しします（撤回は発行した店舗、または顧客ページから）。
      </p>
    );
  }

  return (
    <div>
      <p className="text-gray-300 text-sm mb-3">
        点検整備記録簿などの写しを電子データでお渡しするには、事前にお客様のご承諾が必要です。次の内容をご確認ください。
      </p>
      <div className="whitespace-pre-wrap rounded-lg bg-gray-950 border border-gray-800 p-3 text-sm leading-relaxed text-gray-100">
        {consentText}
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-gray-100">
        <input
          type="checkbox"
          className="mt-1"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={busy}
        />
        <span>上記の内容を確認し、電磁的方法による交付に承諾します。</span>
      </label>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={!agreed || busy}
        className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-white font-semibold disabled:opacity-40"
      >
        {busy ? "記録しています…" : "承諾する"}
      </button>
      <p className="mt-3 text-xs text-gray-400">ご承諾いただかない場合は、書面でお渡しします。</p>
    </div>
  );
}
