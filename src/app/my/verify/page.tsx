"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function GlobalPortalVerifyPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const email = useMemo(() => sp.get("email") ?? "", [sp]);
  const last4 = useMemo(() => sp.get("last4") ?? "", [sp]);
  const tenant = useMemo(() => (sp.get("tenant") ?? "").trim(), [sp]);
  const [code, setCode] = useState(sp.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function verifyCode() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone_last4: last4, code, preferred_tenant_slug: tenant || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? "verify failed");
      router.push(j?.redirect_to || "/my/shops");
    } catch (e: any) {
      setMsg(e?.message ?? "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone_last4: last4, preferred_tenant_slug: tenant || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? "resend failed");
      setMsg("確認コードを再送しました。");
    } catch (e: any) {
      setMsg(e?.message ?? "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200";
  const btnPrimary =
    "inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60";
  const btnSecondary =
    "inline-flex items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60";

  return (
    <main className="mx-auto max-w-lg p-6 font-sans">
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-blue-600">Ledra</div>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900">確認コードを入力</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {email || "登録メールアドレス"} 宛に6桁コードを送信しました。
        </p>

        <label className="mt-5 block text-sm font-medium text-neutral-700">確認コード</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          className={inputCls}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button disabled={busy} onClick={verifyCode} className={btnPrimary}>
            {busy ? "確認中…" : "ログイン"}
          </button>
          <button disabled={busy} onClick={resendCode} className={btnSecondary}>
            コードを再送する
          </button>
        </div>

        {msg ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        <div className="mt-5 text-xs leading-6 text-neutral-500">
          メールが届かない場合は、迷惑メールフォルダをご確認ください。
        </div>
      </div>
    </main>
  );
}
