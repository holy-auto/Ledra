"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AgentLoginPage() {
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
      window.location.href = "/agent";
    } catch (e: any) {
      setErr(e?.message ?? "login_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-md space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-lg">
            C
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">CARTRUST</span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">代理店ポータル ログイン</h1>
          <p className="text-sm text-muted mt-1">代理店パートナー専用の管理画面です。</p>
        </div>

        <div className="grid gap-4">
          <label>
            <div className="text-sm text-secondary mb-1">メールアドレス</div>
            <input
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
          パートナー登録については{" "}
          <a href="/contact" className="text-accent hover:underline">
            お問い合わせ
          </a>
          {" "}ください
        </p>
      </div>
    </main>
  );
}
