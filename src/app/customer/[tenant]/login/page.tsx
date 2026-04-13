"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";

export default function CustomerLoginPage() {
  const router = useRouter();
  const params = useParams() as any;
  const tenant = useMemo(() => (params?.tenant ?? "").toString(), [params]);

  const [email, setEmail] = useState("");
  const [last4, setLast4] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"request" | "verify">("request");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sp = useSearchParams();

  useEffect(() => {
    const qe = sp.get("email");
    const ql = sp.get("last4");
    const qc = sp.get("code");
    const qp = sp.get("phase");
    if (qe) setEmail(qe);
    if (ql) setLast4(ql);
    if (qc) setCode(qc);
    if (qp === "verify" || qc) setPhase("verify");
  }, [sp]);
  async function requestCode() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_slug: tenant, email, phone_last4: last4 }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "request failed");
      setPhase("verify");
      setMsg("メールに6桁コードを送信しました。");
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_slug: tenant, email, phone_last4: last4, code }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "verify failed");
      router.push(`/customer/${tenant}`);
    } catch (e: any) {
      setMsg(e?.message ?? "error");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30";
  const btnCls =
    "rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary cursor-pointer hover:bg-surface-hover disabled:opacity-60 disabled:cursor-default";

  return (
    <main className="mx-auto max-w-lg p-6 font-sans">
      <h1 className="text-xl font-bold text-primary">お客様ログイン</h1>
      <div className="mt-1 text-sm text-muted">店舗: {tenant}</div>

      <label className="mt-4 block text-sm font-medium text-secondary">メール</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />

      <label className="mt-3 block text-sm font-medium text-secondary">電話番号 下4桁</label>
      <input value={last4} onChange={(e) => setLast4(e.target.value)} inputMode="numeric" className={inputCls} />

      {phase === "verify" ? (
        <>
          <label className="mt-3 block text-sm font-medium text-secondary">メールに届いた6桁コード</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" className={inputCls} />
        </>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        {phase === "request" ? (
          <button disabled={busy} onClick={requestCode} className={btnCls}>
            コード送信
          </button>
        ) : (
          <button disabled={busy} onClick={verifyCode} className={btnCls}>
            ログイン
          </button>
        )}
      </div>

      {msg ? <div className="mt-3 text-sm text-danger-text">{msg}</div> : null}

      <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-950 dark:text-blue-400">
        複数の加盟店をご利用中の場合は、共通の{" "}
        <Link href={`/my?tenant=${encodeURIComponent(tenant)}`} className="font-semibold underline">
          Ledraマイページ
        </Link>{" "}
        からログインすると、あとで加盟店を切り替えられます。
      </div>
    </main>
  );
}
