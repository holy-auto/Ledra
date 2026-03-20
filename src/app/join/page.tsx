"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function InsurerRegisterPage() {
  const supabase = createClient();
  const [form, setForm] = useState({
    company_name: "",
    contact_person: "",
    email: "",
    phone: "",
    password: "",
    password_confirm: "",
    requested_plan: "basic",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async () => {
    setErr(null);

    // client-side validation
    if (!form.company_name.trim()) return setErr("会社名を入力してください");
    if (!form.contact_person.trim()) return setErr("担当者名を入力してください");
    if (!form.email.trim()) return setErr("メールアドレスを入力してください");
    if (form.password.length < 8)
      return setErr("パスワードは8文字以上で入力してください");
    if (!/[A-Z]/.test(form.password))
      return setErr("パスワードに大文字を1文字以上含めてください");
    if (!/[a-z]/.test(form.password))
      return setErr("パスワードに小文字を1文字以上含めてください");
    if (!/[0-9]/.test(form.password))
      return setErr("パスワードに数字を1文字以上含めてください");
    if (form.password !== form.password_confirm)
      return setErr("パスワードが一致しません");

    setBusy(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          contact_person: form.contact_person.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          password: form.password,
          requested_plan: form.requested_plan,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.details && Array.isArray(json.details)) {
          throw new Error(json.details.join("\n"));
        }
        throw new Error(json.message ?? json.error ?? "登録に失敗しました");
      }

      // 登録成功 → 自動ログイン
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (loginError) {
        // ログイン失敗してもアカウントは作成済み
        window.location.href = "/insurer/login";
        return;
      }

      window.location.href = "/insurer";
    } catch (e: any) {
      setErr(e?.message ?? "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-lg space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-lg">
            C
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">
            CARTRUST
          </span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">
            加盟店 新規登録
          </h1>
          <p className="text-sm text-muted mt-1">
            会社情報と担当者情報を入力して登録してください。
          </p>
        </div>

        <div className="grid gap-4">
          {/* 会社名 */}
          <label>
            <div className="text-sm text-secondary mb-1">
              会社名 <span className="text-red-500">*</span>
            </div>
            <input
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              placeholder="株式会社○○"
              className="input-field w-full"
            />
          </label>

          {/* 担当者名 */}
          <label>
            <div className="text-sm text-secondary mb-1">
              担当者名 <span className="text-red-500">*</span>
            </div>
            <input
              value={form.contact_person}
              onChange={(e) => set("contact_person", e.target.value)}
              placeholder="山田 太郎"
              className="input-field w-full"
            />
          </label>

          {/* メールアドレス */}
          <label>
            <div className="text-sm text-secondary mb-1">
              メールアドレス <span className="text-red-500">*</span>
            </div>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="example@company.co.jp"
              className="input-field w-full"
            />
          </label>

          {/* 電話番号 */}
          <label>
            <div className="text-sm text-secondary mb-1">電話番号</div>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="03-1234-5678"
              className="input-field w-full"
            />
          </label>

          {/* パスワード */}
          <label>
            <div className="text-sm text-secondary mb-1">
              パスワード <span className="text-red-500">*</span>
            </div>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="8文字以上"
              className="input-field w-full"
            />
          </label>

          {/* パスワード確認 */}
          <label>
            <div className="text-sm text-secondary mb-1">
              パスワード（確認） <span className="text-red-500">*</span>
            </div>
            <input
              type="password"
              value={form.password_confirm}
              onChange={(e) => set("password_confirm", e.target.value)}
              placeholder="もう一度入力"
              className="input-field w-full"
            />
          </label>

          {/* プラン選択 */}
          <label>
            <div className="text-sm text-secondary mb-1">希望プラン</div>
            <select
              value={form.requested_plan}
              onChange={(e) => set("requested_plan", e.target.value)}
              className="input-field w-full"
            >
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="pro">Pro</option>
            </select>
          </label>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">
              {err}
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={busy}
            className="btn-primary w-full"
          >
            {busy ? "登録中..." : "登録する"}
          </button>
        </div>

        <p className="text-center text-sm text-muted">
          既にアカウントをお持ちの方は{" "}
          <a
            href="/insurer/login"
            className="text-accent hover:underline"
          >
            ログイン
          </a>
        </p>
      </div>
    </main>
  );
}
