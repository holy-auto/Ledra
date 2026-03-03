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
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>保険会社ポータル ログイン</h1>
      <p style={{ opacity: 0.8 }}>認証は Supabase Auth（Email/Password）です。</p>

      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Email</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Password</div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>

        {err && <div style={{ color: "crimson" }}>{err}</div>}

        <button onClick={onLogin} disabled={busy} style={{ padding: 12, fontWeight: 700 }}>
          {busy ? "..." : "ログイン"}
        </button>
      </div>
    </main>
  );
}
