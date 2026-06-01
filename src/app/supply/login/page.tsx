"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SupplyLoginPage() {
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
      window.location.href = "/supply";
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "login_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-md space-y-6 p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-lg">
            L
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">供給パートナー ログイン</h1>
          <p className="text-sm text-muted mt-1">卸元・メーカー様専用の管理画面です。</p>
        </div>

        <div className="grid gap-4">
          <label>
            <div className="text-sm text-secondary mb-1">メールアドレス</div>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onLogin()}
              className="input-field w-full"
              placeholder="email@example.com"
            />
          </label>

          <label>
            <div className="text-sm text-secondary mb-1">パスワード</div>
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onLogin()}
              className="input-field w-full"
            />
          </label>

          {err && <div className="text-sm text-red-500">{err}</div>}

          <button onClick={onLogin} disabled={busy} className="btn-primary w-full">
            {busy ? "ログイン中..." : "ログイン"}
          </button>
        </div>

        <p className="text-center text-sm text-muted">
          パートナー登録は{" "}
          <a href="/supply/register" className="text-accent hover:underline">
            こちらから
          </a>
        </p>
      </div>
    </main>
  );
}
