"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function InsurerForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;

    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/insurer/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(v, {
        redirectTo,
      });

      if (error) throw error;

      setMsg("再設定メールを送信しました。メール内リンクから新しいパスワードを設定してください。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">パスワード再設定</h1>
        <p className="text-sm text-neutral-500">
          初回設定もこの画面から進められます。
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-500"
            placeholder="info@example.com"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "送信中..." : "再設定メールを送信"}
        </button>

        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
      </form>

      <Link
        href="/insurer/login"
        className="inline-flex rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
      >
        ログインへ戻る
      </Link>
    </main>
  );
}
