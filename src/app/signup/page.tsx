"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FloatingField } from "@/components/ui/FloatingField";

type FieldKey = "shop_name" | "display_name" | "contact_phone" | "email" | "password" | "password_confirm";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors([]);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const email = ((form.get("email") as string) || "").trim();
    const password = ((form.get("password") as string) || "").trim();
    const passwordConfirm = ((form.get("password_confirm") as string) || "").trim();
    const shopName = ((form.get("shop_name") as string) || "").trim();
    const displayName = ((form.get("display_name") as string) || "").trim();
    const contactPhone = ((form.get("contact_phone") as string) || "").trim();

    // クライアント側バリデーション
    const clientFieldErrors: Partial<Record<FieldKey, string>> = {};
    if (!shopName) clientFieldErrors.shop_name = "店舗名を入力してください";
    if (!email) clientFieldErrors.email = "メールアドレスを入力してください";
    else if (!/^\S+@\S+\.\S+$/.test(email)) clientFieldErrors.email = "メールアドレスの形式が正しくありません";
    if (!password || password.length < 8) clientFieldErrors.password = "8文字以上で入力してください";
    if (password !== passwordConfirm) clientFieldErrors.password_confirm = "パスワードが一致しません";

    if (Object.keys(clientFieldErrors).length > 0) {
      setFieldErrors(clientFieldErrors);
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
          <div className="text-success mx-auto">
            <svg className="mx-auto w-14 h-14" viewBox="0 0 80 80" fill="none" aria-hidden>
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                style={{ animation: "path-draw 700ms cubic-bezier(0.65, 0, 0.35, 1) both" }}
              />
              <path
                d="M24 41 L36 53 L56 30"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                pathLength={1}
                strokeDasharray={1}
                style={{ animation: "path-draw 480ms 600ms cubic-bezier(0.65, 0, 0.35, 1) both" }}
              />
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
              <div key={i} className="text-sm text-red-400">
                {err}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-2">
          {/* 店舗情報 */}
          <FloatingField
            label="店舗名"
            name="shop_name"
            required
            maxLength={100}
            placeholder="例: カーコーティング専門店 SAMPLE"
            error={fieldErrors.shop_name}
          />

          <div className="grid grid-cols-2 gap-3">
            <FloatingField label="担当者名" name="display_name" maxLength={50} placeholder="例: 山田 太郎" />
            <FloatingField label="電話番号" name="contact_phone" type="tel" placeholder="例: 03-1234-5678" />
          </div>

          <hr className="border-border my-2" />

          {/* アカウント情報 */}
          <FloatingField
            label="メールアドレス"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            error={fieldErrors.email}
          />

          <FloatingField
            label="パスワード"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="8文字以上"
            error={fieldErrors.password}
          />

          <FloatingField
            label="パスワード（確認）"
            name="password_confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="もう一度入力"
            error={fieldErrors.password_confirm}
          />

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? "登録中..." : "無料で始める"}
          </button>
        </form>

        <div className="text-center space-y-2">
          <p className="text-xs text-muted">
            登録すると
            <Link href="/terms" className="text-accent hover:underline mx-1">
              利用規約
            </Link>
            と
            <Link href="/privacy" className="text-accent hover:underline mx-1">
              プライバシーポリシー
            </Link>
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
