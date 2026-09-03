"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FloatingField } from "@/components/ui/FloatingField";

type FieldKey = "shop_name" | "display_name" | "contact_phone" | "email" | "password" | "password_confirm";

const initialValues: Record<FieldKey, string> = {
  shop_name: "",
  display_name: "",
  contact_phone: "",
  email: "",
  password: "",
  password_confirm: "",
};

const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v);

export default function SignupPage() {
  const router = useRouter();
  const [values, setValues] = useState<Record<FieldKey, string>>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const setValue = (key: FieldKey) => (v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    // 入力するそばからエラーを解除し、ストレスを減らす。
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  /** 単一フィールドの即時バリデーション（onBlur 用） */
  const validateField = (key: FieldKey) => (raw: string) => {
    const v = raw.trim();
    let msg: string | undefined;
    if (key === "shop_name" && !v) msg = "店舗名（個人事業主は屋号）を入力してください";
    else if (key === "email") {
      if (!v) msg = "メールアドレスを入力してください";
      else if (!isEmail(v)) msg = "メールアドレスの形式が正しくありません";
    } else if (key === "password") {
      if (!v || v.length < 8) msg = "8文字以上で入力してください";
    } else if (key === "password_confirm") {
      if (v !== values.password.trim()) msg = "パスワードが一致しません";
    }
    if (msg) setFieldErrors((prev) => ({ ...prev, [key]: msg }));
  };

  function validateAll(): boolean {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!values.shop_name.trim()) next.shop_name = "店舗名（個人事業主は屋号）を入力してください";
    if (!values.email.trim()) next.email = "メールアドレスを入力してください";
    else if (!isEmail(values.email.trim())) next.email = "メールアドレスの形式が正しくありません";
    if (!values.password || values.password.trim().length < 8) next.password = "8文字以上で入力してください";
    if (values.password.trim() !== values.password_confirm.trim()) next.password_confirm = "パスワードが一致しません";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    if (!validateAll()) return;

    setLoading(true);
    const email = values.email.trim();
    const password = values.password.trim();

    try {
      // 1) API でユーザー + テナント作成
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          shop_name: values.shop_name.trim(),
          display_name: values.display_name.trim() || null,
          contact_phone: values.contact_phone.trim() || null,
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
        setDone(true);
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

  if (done) {
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

        {/* 登録の流れ — 3ステップで迷わせない */}
        <ol className="space-y-1.5 text-sm text-secondary" aria-label="登録の流れ">
          {["お店の名前とメールを入力", "パスワードを決めて入力", "登録完了（約2分）"].map((step, i) => (
            <li key={step} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent text-xs font-semibold">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

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
          {/* 店舗情報（最小限） */}
          <FloatingField
            label="店舗名・屋号"
            name="shop_name"
            required
            maxLength={100}
            placeholder="例: カーコーティング専門店 SAMPLE / 個人事業主は屋号"
            value={values.shop_name}
            onChange={setValue("shop_name")}
            onBlur={validateField("shop_name")}
            error={fieldErrors.shop_name}
          />

          <FloatingField
            label="メールアドレス"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={values.email}
            onChange={setValue("email")}
            onBlur={validateField("email")}
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
            value={values.password}
            onChange={setValue("password")}
            onBlur={validateField("password")}
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
            value={values.password_confirm}
            onChange={setValue("password_confirm")}
            onBlur={validateField("password_confirm")}
            error={fieldErrors.password_confirm}
          />

          {/* 任意項目はデフォルトで折りたたみ、入力欄を最小化 */}
          {showDetails ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <FloatingField
                label="担当者名"
                name="display_name"
                maxLength={50}
                placeholder="例: 山田 太郎"
                value={values.display_name}
                onChange={setValue("display_name")}
              />
              <FloatingField
                label="電話番号"
                name="contact_phone"
                type="tel"
                placeholder="例: 03-1234-5678"
                value={values.contact_phone}
                onChange={setValue("contact_phone")}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="text-xs text-accent hover:underline pt-1"
            >
              ＋ 担当者名・電話番号を追加（任意）
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? "送信中..." : "無料で始める"}
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
          <p className="text-xs text-muted">
            登録がうまくいかないときは
            <Link href="/contact" className="text-accent hover:underline mx-1">
              お問い合わせ
            </Link>
            ください。スタッフが一緒に登録をお手伝いします。
          </p>
        </div>
      </div>
    </main>
  );
}
