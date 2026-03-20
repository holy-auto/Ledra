"use client";

import { useState } from "react";

const inputClass =
  "w-full px-4 py-3 rounded-lg border border-white/[0.08] bg-white/[0.05] text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

export function ContactForm() {
  const [formState, setFormState] = useState<FormState>({ status: "idle" });
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  if (formState.status === "success") {
    return (
      <div className="text-center py-16 px-8 rounded-xl bg-white/[0.04] border border-white/[0.07]">
        <div className="w-16 h-16 mx-auto bg-blue-500/[0.1] rounded-full flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-blue-400">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-6 text-xl font-bold text-white">送信完了</h3>
        <p className="mt-3 text-white/55">
          お問い合わせいただきありがとうございます。<br />
          1営業日以内にご返信いたします。
        </p>
      </div>
    );
  }

  const isSubmitting = formState.status === "submitting";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors([]);
    setFormState({ status: "submitting" });

    const form = e.currentTarget;
    const formData = new FormData(form);

    const body = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      company: formData.get("company") as string,
      category: formData.get("category") as string,
      message: formData.get("message") as string,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setFormState({ status: "success" });
        return;
      }

      const data = await res.json().catch(() => null);

      if (res.status === 429) {
        setFormState({
          status: "error",
          message: data?.message ?? "送信が多すぎます。しばらくしてから再度お試しください。",
        });
        return;
      }

      if (data?.details) {
        setFieldErrors(data.details);
      }

      setFormState({
        status: "error",
        message: data?.error === "Missing required fields"
          ? "入力内容をご確認ください。"
          : "送信に失敗しました。しばらくしてから再度お試しください。",
      });
    } catch {
      setFormState({
        status: "error",
        message: "ネットワークエラーが発生しました。接続をご確認ください。",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formState.status === "error" && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {formState.message}
          {fieldErrors.length > 0 && (
            <ul className="mt-2 list-disc list-inside">
              {fieldErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            お名前 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="name"
            required
            disabled={isSubmitting}
            className={inputClass}
            placeholder="山田 太郎"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            会社名
          </label>
          <input
            type="text"
            name="company"
            disabled={isSubmitting}
            className={inputClass}
            placeholder="株式会社〇〇"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          メールアドレス <span className="text-red-400">*</span>
        </label>
        <input
          type="email"
          name="email"
          required
          disabled={isSubmitting}
          className={inputClass}
          placeholder="example@company.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          お問い合わせ種別
        </label>
        <select name="category" disabled={isSubmitting} className={inputClass}>
          <option value="">選択してください</option>
          <option value="デモのご依頼">デモのご依頼</option>
          <option value="資料請求">資料請求</option>
          <option value="料金のご相談">料金のご相談</option>
          <option value="技術的なご質問">技術的なご質問</option>
          <option value="その他">その他</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          お問い合わせ内容 <span className="text-red-400">*</span>
        </label>
        <textarea
          name="message"
          required
          disabled={isSubmitting}
          rows={5}
          className={`${inputClass} resize-none`}
          placeholder="お問い合わせ内容をご記入ください"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto inline-flex items-center justify-center font-medium rounded-lg text-[0.938rem] px-8 py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-[0_1px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_2px_20px_rgba(59,130,246,0.45)] hover:-translate-y-[0.5px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            送信中...
          </>
        ) : (
          "送信する"
        )}
      </button>
    </form>
  );
}
