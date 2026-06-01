"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 供給パートナー新規登録。ログイン済み (Supabase アカウントあり) の前提で、
 * 自分を owner とするパートナー行を作成する (POST /api/supply/profile)。
 * 未ログインなら /supply/login へ誘導する。
 */
export default function SupplyRegisterPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setAuthed(Boolean(session));
      // 既にパートナー登録済みならダッシュボードへ
      if (session) {
        try {
          const res = await fetch("/api/supply/profile", { cache: "no-store" });
          const j = await res.json().catch(() => null);
          if (!cancelled && j?.partner) window.location.replace("/supply");
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/supply/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contact_email: email || null,
          contact_phone: phone || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setErr(j?.message ?? "登録に失敗しました。");
        return;
      }
      window.location.href = "/supply";
    } catch {
      setErr("通信エラーが発生しました。");
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
          <h1 className="text-xl font-bold text-primary">供給パートナー登録</h1>
          <p className="text-sm text-muted mt-1">卸元・メーカーとして商材を登録できます。</p>
        </div>

        {authed === false ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-secondary">登録には Ledra アカウントでのログインが必要です。</p>
            <a href="/supply/login" className="btn-primary inline-block">
              ログインへ
            </a>
          </div>
        ) : (
          <div className="grid gap-4">
            <label>
              <div className="text-sm text-secondary mb-1">事業者名 *</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field w-full"
                placeholder="株式会社サンプル商会"
              />
            </label>
            <label>
              <div className="text-sm text-secondary mb-1">連絡先メール</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field w-full"
                placeholder="sales@example.com"
              />
            </label>
            <label>
              <div className="text-sm text-secondary mb-1">連絡先電話</div>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field w-full"
                placeholder="03-1234-5678"
              />
            </label>

            {err && <div className="text-sm text-red-500">{err}</div>}

            <button onClick={onSubmit} disabled={busy || !name.trim()} className="btn-primary w-full">
              {busy ? "登録中..." : "登録する"}
            </button>
            <p className="text-xs text-muted">
              登録後は審査待ち状態になります。審査中も商材・API 設定の入力は可能です。
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
