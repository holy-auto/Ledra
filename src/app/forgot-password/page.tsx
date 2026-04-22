"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = (form.get("email") as string || "").trim();

    if (!email) {
      setError("メールアドレスを入力してください。");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });

      if (resetError) {
        setError("パスワードリセットメールの送信に失敗しました。");
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base p-6">
        <div className="glass-card w-full max-w-sm space-y-6 p-8 text-center">
          <div className="flex items-center justify-center gap-3">
            <Image src="/icon-192.png" alt="Ledra" width={40} height={40} className="rounded-lg" priority />
            <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
          </div>
          <div className="text-accent">
            <svg className="mx-auto w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-primary">メール送信完了</h1>
          <p className="text-sm text-secondary">パスワードリセット用のリンクをメールで送信しました。メールをご確認ください。</p>
          <Link href="/login" className="btn-primary w-full inline-block text-center">
            ログインページに戻る
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-sm space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <Image src="/icon-192.png" alt="Ledra" width={40} height={40} className="rounded-lg" priority />
          <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">パスワードリセット</h1>
          <p className="text-sm text-muted mt-1">登録済みのメールアドレスを入力してください</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="text-sm text-red-400">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-[0.12em] text-muted mb-1">
              メールアドレス
            </label>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              className="input-field w-full"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "送信中..." : "リセットメールを送信"}
          </button>
        </form>

        <p className="text-sm text-secondary text-center">
          <Link href="/login" className="text-accent hover:underline font-medium">
            ログインに戻る
          </Link>
        </p>
      </div>
    </main>
  );
}
