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
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-md space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0071e3] flex items-center justify-center text-white font-bold text-lg">
            C
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">CARTRUST</span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">保険会社ポータル ログイン</h1>
          <p className="text-sm text-muted mt-1">認証は Supabase Auth（Email/Password）です。</p>
        </div>

        <div className="grid gap-4">
          <label>
            <div className="text-sm text-secondary mb-1">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field w-full"
            />
          </label>

          <label>
            <div className="text-sm text-secondary mb-1">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field w-full"
            />
          </label>

          {err && <div className="text-sm text-red-500">{err}</div>}

          <button onClick={onLogin} disabled={busy} className="btn-primary w-full">
            {busy ? "..." : "ログイン"}
          </button>
        </div>

        <p className="text-center text-sm text-muted">
          アカウントをお持ちでない方は{" "}
          <a href="/join" className="text-[#0071e3] hover:underline">
            新規登録
          </a>
        </p>
      </div>
    </main>
  );
}
