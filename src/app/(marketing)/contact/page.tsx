"use client";

import { useState, type ReactNode, type FormEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { siteConfig } from "@/lib/marketing/config";

// ─── フォームデータ ───────────────────────────────────────────────────────

type FormData = {
  name: string;
  company: string;
  email: string;
  category: string;
  message: string;
};

const initialForm: FormData = {
  name: "",
  company: "",
  email: "",
  category: "",
  message: "",
};

const categories = [
  { value: "shop", label: "施工店として利用したい" },
  { value: "insurer", label: "保険会社として利用したい" },
  { value: "pricing", label: "料金・プランについて" },
  { value: "api", label: "API連携について" },
  { value: "other", label: "その他" },
];

// ─── コンポーネント ───────────────────────────────────────────────────────

function Label({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-zinc-700"
    >
      {children}
      {required && (
        <span className="ml-1 text-xs font-normal text-red-400">必須</span>
      )}
    </label>
  );
}

function Input({
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
    />
  );
}

// ─── ページ本体 ───────────────────────────────────────────────────────────

export default function ContactPage() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );

  function update(field: keyof FormData) {
    return (value: string) => setForm((f: FormData) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");

    try {
      // TODO: API ルートへの POST に差し替え
      await new Promise((r) => setTimeout(r, 800));
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <section className="flex min-h-[70vh] items-center justify-center px-6">
        <div className="text-center">
          <span className="text-5xl" aria-hidden="true">✅</span>
          <h2 className="mt-6 text-2xl font-bold text-zinc-900">
            送信が完了しました
          </h2>
          <p className="mt-3 text-zinc-500">
            内容を確認のうえ、担当者から2営業日以内にご連絡します。
          </p>
          <Link
            href="/"
            className="mt-8 inline-block rounded-full bg-zinc-900 px-7 py-3 text-sm font-medium text-white hover:bg-zinc-700"
          >
            トップページへ戻る
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* ヘッダー */}
      <section className="bg-white px-6 pb-16 pt-28 text-center">
        <div className="mx-auto max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Contact
          </span>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-900">
            お問い合わせ
          </h1>
          <p className="mt-4 text-zinc-500">
            導入相談・資料請求・API仕様のご確認など、お気軽にどうぞ。
            <br />
            通常2営業日以内にご返信します。
          </p>
        </div>
      </section>

      {/* フォーム */}
      <section className="bg-zinc-50 px-6 py-16">
        <div className="mx-auto max-w-xl">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
              {/* 名前 */}
              <div>
                <Label htmlFor="name" required>
                  お名前
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={update("name")}
                  placeholder="山田 太郎"
                  required
                />
              </div>

              {/* 会社名 */}
              <div>
                <Label htmlFor="company">会社名・店舗名</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={update("company")}
                  placeholder="株式会社〇〇"
                />
              </div>

              {/* メール */}
              <div>
                <Label htmlFor="email" required>
                  メールアドレス
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={update("email")}
                  placeholder="taro@example.com"
                  required
                />
              </div>

              {/* 問い合わせ種別 */}
              <div>
                <Label htmlFor="category" required>
                  お問い合わせの種別
                </Label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => update("category")(e.target.value)}
                  required
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
                >
                  <option value="" disabled>
                    選択してください
                  </option>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* メッセージ */}
              <div>
                <Label htmlFor="message" required>
                  お問い合わせ内容
                </Label>
                <textarea
                  id="message"
                  value={form.message}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update("message")(e.target.value)}
                  required
                  rows={5}
                  placeholder="ご質問・ご要望をご記入ください"
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              {/* プライバシー同意 */}
              <p className="text-xs text-zinc-400">
                送信することで、
                <Link href="/privacy" className="underline">
                  プライバシーポリシー
                </Link>
                に同意したものとみなします。
              </p>

              {/* エラー */}
              {status === "error" && (
                <p className="text-sm text-red-500">
                  送信に失敗しました。時間をおいて再度お試しください。
                </p>
              )}

              {/* 送信ボタン */}
              <button
                type="submit"
                disabled={status === "sending"}
                className="rounded-full bg-zinc-900 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "sending" ? "送信中…" : "送信する"}
              </button>
            </form>
          </div>

          {/* 直接連絡先 */}
          <div className="mt-8 text-center text-sm text-zinc-400">
            メールで直接連絡する場合:{" "}
            <a
              href={`mailto:${siteConfig.contactEmail}`}
              className="font-medium text-zinc-600 hover:underline"
            >
              {siteConfig.contactEmail}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
