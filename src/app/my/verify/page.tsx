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
    "w-full rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30";
  const btnPrimary =
    "inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60";
  const btnSecondary =
    "inline-flex items-center justify-center rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm font-semibold text-primary hover:bg-surface-hover disabled:opacity-60";

  return (
    <main className="mx-auto max-w-lg p-6 font-sans">
      <div className="rounded-3xl border border-border-default bg-surface p-6 shadow-sm">
        <div className="text-sm font-semibold text-accent">Ledra</div>
        <h1 className="mt-2 text-2xl font-bold text-primary">確認コードを入力</h1>
        <p className="mt-2 text-sm leading-6 text-secondary">
          {email || "登録メールアドレス"} 宛に6桁コードを送信しました。
        </p>

        <label className="mt-5 block text-sm font-medium text-secondary">確認コード</label>
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
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950 dark:text-red-400">{msg}</div>
        ) : null}

        <div className="mt-5 text-xs leading-6 text-muted">
          メールが届かない場合は、迷惑メールフォルダをご確認ください。
        </div>
      </div>
    </main>
  );
}
