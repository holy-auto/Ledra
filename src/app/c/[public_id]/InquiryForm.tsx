"use client";

import { useState } from "react";

type Props = {
  publicId: string;
  shopName?: string;
};

export default function InquiryForm({ publicId, shopName }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const canSubmit = status === "idle" && name.trim().length > 0 && body.trim().length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/inquiries/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_id: publicId,
          sender_name: name.trim(),
          sender_email: email.trim() || undefined,
          body: body.trim(),
          website,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `送信に失敗しました (${res.status})`);
      }

      setStatus("success");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "送信に失敗しました");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <div className="text-sm font-bold text-emerald-800 mb-1">お問い合わせを送信しました</div>
        <p className="text-sm text-emerald-700">
          {shopName ? `${shopName}へ` : "店舗へ"}お問い合わせを送信しました。店舗からのご連絡をお待ちください。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-[10px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">Contact</div>
        <div className="text-base font-bold text-neutral-900 mt-0.5">お問い合わせ</div>
        <p className="mt-1 text-xs text-neutral-500">
          この証明書の発行店舗{shopName ? `（${shopName}）` : ""}へお問い合わせを送信できます
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {/* honeypot */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, width: 0 }}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <div>
          <label className="block text-xs font-semibold text-neutral-600 mb-1">
            お名前 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            placeholder="山田 太郎"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-600 mb-1">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            placeholder="example@mail.com"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-600 mb-1">
            お問い合わせ内容 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            required
            rows={4}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 resize-y"
            placeholder="お問い合わせ内容をご記入ください"
          />
          <div className="text-right text-[11px] text-neutral-400 mt-0.5">{body.length}/2000</div>
        </div>

        {status === "error" && errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "submitting" ? "送信中..." : "送信する"}
        </button>
      </form>
    </section>
  );
}
