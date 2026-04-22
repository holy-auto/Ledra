"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors([]);

    const form = new FormData(e.currentTarget);
    const email = (form.get("email") as string || "").trim();
    const password = (form.get("password") as string || "").trim();
    const passwordConfirm = (form.get("password_confirm") as string || "").trim();
    const shopName = (form.get("shop_name") as string || "").trim();
    const displayName = (form.get("display_name") as string || "").trim();
    const contactPhone = (form.get("contact_phone") as string || "").trim();

    // クライアント側バリデーション
    const clientErrors: string[] = [];
    if (!email) clientErrors.push("メールアドレスを入力してください。");
    if (!password || password.length < 8) clientErrors.push("パスワードは8文字以上で入力してください。");
    if (password !== passwordConfirm) clientErrors.push("パスワードが一致しません。");
    if (!shopName) clientErrors.push("店舗名を入力してください。");

    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      setLoading(false);
      return;
    }

    try {
      // 1) API でユーザー + テナント作成
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          shop_name: shopName,
          display_name: displayName || null,
          contact_phone: contactPhone || null,
        }),
      });

      const data = await res.json().catch(() => ({ messages: ["通信エラーが発生しました。"] }));

      if (!res.ok) {
        setErrors(data.messages ?? ["登録に失敗しました。"]);
        setLoading(false);
        return;
      }

      // 2) 作成したアカウントで自動ログイン
      const supabase = createClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

      if (loginError) {
        // ログインだけ失敗した場合はログインページに誘導
        setSuccess(true);
        setLoading(false);
        return;
      }

      // 3) 管理画面に遷移
      router.push("/admin");
    } catch {
      setErrors(["通信エラーが発生しました。再度お試しください。"]);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base p-6">
        <div className="glass-card w-full max-w-sm space-y-6 p-8 text-center">
          <div className="flex items-center justify-center gap-3">
            <Image src="/icon-192.png" alt="Ledra" width={40} height={40} className="rounded-lg" priority />
            <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
          </div>
          <div className="text-success">
            <svg className="mx-auto w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-primary">登録完了</h1>
          <p className="text-sm text-secondary">アカウントが作成されました。ログインしてご利用ください。</p>
          <Link href="/login" className="btn-primary w-full inline-block text-center">
            ログインページへ
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-md space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <Image src="/icon-192.png" alt="Ledra" width={40} height={40} className="rounded-lg" priority />
          <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">新規登録</h1>
          <p className="text-sm text-muted mt-1">施工店アカウントを作成して始めましょう</p>
        </div>

        {errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-1">
            {errors.map((err, i) => (
              <div key={i} className="text-sm text-red-400">{err}</div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 店舗情報 */}
          <div>
            <label className="block text-xs font-semibold tracking-[0.12em] text-muted mb-1">
              店舗名 <span className="text-red-400">*</span>
            </label>
            <input
              name="shop_name"
              type="text"
              placeholder="例: カーコーティング専門店 SAMPLE"
              className="input-field w-full"
              required
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold tracking-[0.12em] text-muted mb-1">
                担当者名
              </label>
              <input
                name="display_name"
                type="text"
                placeholder="例: 山田 太郎"
                className="input-field w-full"
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-[0.12em] text-muted mb-1">
                電話番号
              </label>
              <input
                name="contact_phone"
                type="tel"
                placeholder="例: 03-1234-5678"
                className="input-field w-full"
              />
            </div>
          </div>

          <hr className="border-border" />

          {/* アカウント情報 */}
          <div>
            <label className="block text-xs font-semibold tracking-[0.12em] text-muted mb-1">
              メールアドレス <span className="text-red-400">*</span>
            </label>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              className="input-field w-full"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold tracking-[0.12em] text-muted mb-1">
              パスワード <span className="text-red-400">*</span>
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
              パスワード（確認） <span className="text-red-400">*</span>
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
            {loading ? "登録中..." : "無料で始める"}
          </button>
        </form>

        <div className="text-center space-y-2">
          <p className="text-xs text-muted">
            登録すると
            <Link href="/terms" className="text-accent hover:underline mx-1">利用規約</Link>
            と
            <Link href="/privacy" className="text-accent hover:underline mx-1">プライバシーポリシー</Link>
            に同意したことになります。
          </p>
          <p className="text-sm text-secondary">
            既にアカウントをお持ちですか？{" "}
            <Link href="/login" className="text-accent hover:underline font-medium">
              ログイン
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
