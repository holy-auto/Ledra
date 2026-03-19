"use client";

import { useState } from "react";

const inputClass =
  "w-full px-4 py-3 rounded-lg border border-white/[0.08] bg-white/[0.05] text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="text-center py-16 px-8 rounded-xl bg-white/[0.04] border border-white/[0.07]">
        <div className="w-16 h-16 mx-auto bg-blue-500/[0.1] rounded-full flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-blue-400">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-6 text-xl font-bold text-white">送信完了</h3>
        <p className="mt-3 text-white/50">
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
          <label className="block text-sm font-medium text-white/80 mb-2">
            お名前 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
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
          required
          className={inputClass}
          placeholder="example@company.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          お問い合わせ種別
        </label>
        <select className={inputClass}>
          <option value="">選択してください</option>
          <option value="demo">デモのご依頼</option>
          <option value="document">資料請求</option>
          <option value="pricing">料金のご相談</option>
          <option value="support">技術的なご質問</option>
          <option value="other">その他</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          お問い合わせ内容 <span className="text-red-400">*</span>
        </label>
        <textarea
          required
          rows={5}
          className={`${inputClass} resize-none`}
          placeholder="お問い合わせ内容をご記入ください"
        />
      </div>
      <button
        type="submit"
        className="w-full sm:w-auto inline-flex items-center justify-center font-medium rounded-lg text-[0.938rem] px-8 py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-[0_1px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_2px_20px_rgba(59,130,246,0.45)] hover:-translate-y-[0.5px] transition-all duration-200"
      >
        送信する
      </button>
    </form>
  );
}
