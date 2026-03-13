"use client";

import { useState } from "react";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="text-center py-16 px-8 rounded-xl bg-surface-alt border border-border">
        <div className="w-16 h-16 mx-auto bg-primary/[0.08] rounded-full flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-primary">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-6 text-xl font-bold text-heading">送信完了</h3>
        <p className="mt-3 text-body">
          お問い合わせいただきありがとうございます。<br />
          1営業日以内にご返信いたします。
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-heading mb-2">
            お名前 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            className="w-full px-4 py-3 rounded-lg border border-border bg-white text-heading text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            placeholder="山田 太郎"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-heading mb-2">
            会社名
          </label>
          <input
            type="text"
            className="w-full px-4 py-3 rounded-lg border border-border bg-white text-heading text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            placeholder="株式会社〇〇"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-heading mb-2">
          メールアドレス <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          required
          className="w-full px-4 py-3 rounded-lg border border-border bg-white text-heading text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          placeholder="example@company.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-heading mb-2">
          お問い合わせ種別
        </label>
        <select className="w-full px-4 py-3 rounded-lg border border-border bg-white text-heading text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors">
          <option value="">選択してください</option>
          <option value="demo">デモのご依頼</option>
          <option value="document">資料請求</option>
          <option value="pricing">料金のご相談</option>
          <option value="support">技術的なご質問</option>
          <option value="other">その他</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-heading mb-2">
          お問い合わせ内容 <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={5}
          className="w-full px-4 py-3 rounded-lg border border-border bg-white text-heading text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none"
          placeholder="お問い合わせ内容をご記入ください"
        />
      </div>
      <button
        type="submit"
        className="w-full sm:w-auto inline-flex items-center justify-center font-medium rounded-lg text-[0.938rem] px-8 py-3.5 bg-primary text-white hover:bg-primary-hover shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(11,92,186,0.25)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_6px_20px_rgba(11,92,186,0.35)] hover:-translate-y-[1px] transition-all duration-200"
      >
        送信する
      </button>
    </form>
  );
}
