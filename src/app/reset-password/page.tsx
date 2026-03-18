"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const password = (form.get("password") as string || "").trim();
    const passwordConfirm = (form.get("password_confirm") as string || "").trim();

    if (!password || password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      setLoading(false);
      return;
    }

    if (password !== passwordConfirm) {
      setError("パスワードが一致しません。");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError("パスワードの更新に失敗しました。リンクが期限切れの場合は再度リセットしてください。");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/admin"), 2000);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base p-6">
        <div className="glass-card w-full max-w-sm space-y-6 p-8 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ background: "linear-gradient(135deg, #0071e3, #5856d6)" }}>
              C
            </div>
            <span className="text-xl font-bold text-primary tracking-wide">CARTRUST</span>
          </div>
          <div className="text-[#28a745]">
            <svg className="mx-auto w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-primary">パスワード更新完了</h1>
          <p className="text-sm text-secondary">管理画面に移動します...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-sm space-y-6 p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ background: "linear-gradient(135deg, #0071e3, #5856d6)" }}>
            C
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">CARTRUST</span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">新しいパスワード設定</h1>
          <p className="text-sm text-muted mt-1">新しいパスワードを入力してください</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="text-sm text-red-400">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-[0.12em] text-muted mb-1">
              新しいパスワード
            </label>
            <input
              name="password"
              type="password"
              placeholder="8文字以上"
              className="input-field w-full"
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold tracking-[0.12em] text-muted mb-1">
              パスワード（確認）
            </label>
            <input
              name="password_confirm"
              type="password"
              placeholder="もう一度入力"
              className="input-field w-full"
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "更新中..." : "パスワードを更新"}
          </button>
        </form>

        <p className="text-sm text-secondary text-center">
          <Link href="/login" className="text-[#0071e3] hover:underline font-medium">
            ログインに戻る
          </Link>
        </p>
      </div>
    </main>
  );
}
