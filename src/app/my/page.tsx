"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function GlobalPortalLoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [last4, setLast4] = useState(sp.get("last4") ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const tenant = useMemo(() => (sp.get("tenant") ?? "").trim(), [sp]);
  const from = useMemo(() => (sp.get("from") ?? "").trim(), [sp]);
  const pid = useMemo(() => (sp.get("pid") ?? "").trim(), [sp]);

  async function requestCode() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone_last4: last4,
          preferred_tenant_slug: tenant || undefined,
          from: from || undefined,
          public_id: pid || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? "request failed");

      const next = new URLSearchParams({ email, last4 });
      if (tenant) next.set("tenant", tenant);
      if (from) next.set("from", from);
      if (pid) next.set("pid", pid);
      router.push(`/my/verify?${next.toString()}`);
    } catch (e: any) {
      setMsg(e?.message ?? "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30";
  const btnCls =
    "inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60";

  return (
    <main className="mx-auto max-w-lg p-6 font-sans">
      <div className="rounded-3xl border border-border-default bg-surface p-6 shadow-sm">
        <div className="text-sm font-semibold text-accent">Ledra</div>
        <h1 className="mt-2 text-2xl font-bold text-primary">マイページにログイン</h1>
        <p className="mt-2 text-sm leading-6 text-secondary">
          ご利用中の加盟店情報をまとめて確認できます。まずはご本人確認を行ってください。
        </p>

        {from === "nfc" ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950 dark:text-emerald-400">
            NFCタグから開いた証明書に関連するマイページへご案内します。
          </div>
        ) : null}

        {tenant ? (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-950 dark:text-blue-400">
            {tenant} の情報を優先して表示します。
          </div>
        ) : null}

        <label className="mt-5 block text-sm font-medium text-secondary">メールアドレス</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" />

        <label className="mt-4 block text-sm font-medium text-secondary">電話番号 下4桁</label>
        <input
          value={last4}
          onChange={(e) => setLast4(e.target.value)}
          inputMode="numeric"
          maxLength={4}
          className={inputCls}
        />

        <button disabled={busy} onClick={requestCode} className={`${btnCls} mt-5 w-full`}>
          {busy ? "送信中…" : "確認コードを送る"}
        </button>

        {msg ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950 dark:text-red-400">{msg}</div>
        ) : null}

        <div className="mt-5 text-xs leading-6 text-muted">
          ご利用中の加盟店が複数ある場合でも、ログイン後に店舗を選べます。
        </div>
        <div className="mt-2 text-xs text-muted">
          既に店舗URLをお持ちの場合は{" "}
          <Link href={tenant ? `/customer/${tenant}/login` : "/"} className="text-accent underline">
            店舗別ログイン
          </Link>{" "}
          も利用できます。
        </div>
      </div>
    </main>
  );
}
