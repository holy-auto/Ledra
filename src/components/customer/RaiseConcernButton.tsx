"use client";

import React, { useState } from "react";
import type { ConcernSource, ConcernCategory } from "@/lib/concerns/types";
import { CONCERN_CATEGORY_LABELS } from "@/lib/concerns/types";

/**
 * IMP-026: 「気になる点を伝える」ボタン + モーダル
 *
 * 確認フロー(受領サイン・部品確認・板金同意・進捗)に配置。
 * 顧客が懸念を送信すると customer_concerns テーブルに記録され、
 * 管理者に Slack 通知が飛ぶ。
 */

interface Props {
  sourceType: ConcernSource;
  sourceToken: string;
  /** ボタンのスタイルバリアント — 確認ページのテーマに合わせる */
  variant?: "dark" | "light";
}

const CATEGORIES: { value: ConcernCategory; label: string }[] = Object.entries(CONCERN_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as ConcernCategory, label }),
);

type Phase = "idle" | "form" | "submitting" | "done" | "error";

export default function RaiseConcernButton({ sourceType, sourceToken, variant = "light" }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<ConcernCategory | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const canSubmit = text.trim().length >= 1 && phase !== "submitting";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPhase("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/customer/concerns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          source_token: sourceToken,
          concern_text: text.trim(),
          ...(category ? { category } : {}),
          ...(name.trim() ? { customer_name: name.trim() } : {}),
          ...(email.trim() ? { customer_email: email.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorMsg((json as { message?: string }).message ?? "送信に失敗しました");
        setPhase("form");
        return;
      }

      setPhase("done");
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
      setPhase("form");
    }
  };

  if (phase === "idle") {
    return (
      <button
        onClick={() => setPhase("form")}
        className={`w-full rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
          variant === "dark"
            ? "border-gray-700 text-gray-300 hover:bg-gray-800"
            : "border-gray-300 text-gray-600 hover:bg-gray-50"
        }`}
      >
        ⚠️ 気になる点を伝える
      </button>
    );
  }

  if (phase === "done") {
    return (
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          variant === "dark"
            ? "border-green-800 bg-green-950 text-green-300"
            : "border-green-200 bg-green-50 text-green-800"
        }`}
      >
        ✅ ご連絡ありがとうございます。施工店が内容を確認いたします。
      </div>
    );
  }

  const isDark = variant === "dark";
  const labelCls = isDark ? "text-gray-300 text-sm" : "text-gray-600 text-sm";
  const inputCls = isDark
    ? "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
    : "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none";

  return (
    <div
      className={`rounded-xl border p-4 ${isDark ? "border-amber-800 bg-amber-950/30" : "border-amber-200 bg-amber-50"}`}
    >
      <h3 className={`mb-3 font-semibold ${isDark ? "text-amber-300" : "text-amber-800"}`}>⚠️ 気になる点を伝える</h3>

      <div className="flex flex-col gap-3">
        {/* カテゴリ */}
        <div>
          <label className={labelCls}>内容の種類</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ConcernCategory | "")}
            className={inputCls}
          >
            <option value="">選択してください（任意）</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* 懸念内容 */}
        <div>
          <label className={labelCls}>
            気になる点<span className="ml-1 text-red-500">*</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="気になる点をご記入ください"
            maxLength={2000}
            rows={3}
            className={inputCls}
          />
          <p className={`mt-1 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{text.length}/2000</p>
        </div>

        {/* お名前（任意） */}
        <div>
          <label className={labelCls}>お名前（任意）</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="山田太郎"
            maxLength={100}
            className={inputCls}
          />
        </div>

        {/* メール（任意） */}
        <div>
          <label className={labelCls}>メールアドレス（任意・返信用）</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputCls}
          />
        </div>

        {errorMsg && <p className={`text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>{errorMsg}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => setPhase("idle")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              isDark
                ? "border-gray-700 text-gray-400 hover:bg-gray-800"
                : "border-gray-300 text-gray-500 hover:bg-gray-100"
            }`}
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white
                       hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === "submitting" ? "送信中…" : "送信する"}
          </button>
        </div>
      </div>
    </div>
  );
}
