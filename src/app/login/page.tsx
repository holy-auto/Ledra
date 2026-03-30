"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onLogin = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "/admin/certificates";
    } catch {
      setErr("メールアドレスまたはパスワードが正しくありません。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-sm space-y-6 p-8">
        <div className="flex items-center justify-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ background: "linear-gradient(135deg, var(--accent-blue), #5856d6)" }}
          >
            L
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
        </div>

        <h1 className="text-xl font-bold text-primary text-center">ログイン</h1>

        {err && <div className="text-sm text-red-400 text-center">{err}</div>}

        <div className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && onLogin()}
            placeholder="Email"
            className="input-field w-full"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && onLogin()}
            placeholder="Password"
            className="input-field w-full"
          />
          <button onClick={onLogin} disabled={busy} className="btn-primary w-full">
            {busy ? "ログイン中..." : "ログイン"}
          </button>
        </div>

        <div className="text-center space-y-2">
          <Link href="/forgot-password" className="text-xs text-accent hover:underline">
            パスワードをお忘れですか？
          </Link>
          <p className="text-sm text-secondary">
            アカウントをお持ちでないですか？{" "}
            <Link href="/signup" className="text-accent hover:underline font-medium">
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
