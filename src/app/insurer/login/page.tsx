"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function InsurerLoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onLogin = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "/insurer";
    } catch (e: any) {
      setErr(e?.message ?? "login_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            INSURER PORTAL
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            保険会社ポータル
          </h1>
          <p className="text-sm text-neutral-500">
            メールアドレスとパスワードでログイン
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-neutral-700">メールアドレス</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onLogin()}
              placeholder="insurer@example.com"
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-neutral-700">パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onLogin()}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </label>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}

          <button
            onClick={onLogin}
            disabled={busy}
            className="w-full rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? "ログイン中..." : "ログイン"}
          </button>
        </div>

      </div>
    </main>
  );
}
