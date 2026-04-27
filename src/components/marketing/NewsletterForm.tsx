"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import Link from "next/link";
import { useState } from "react";
import { track } from "@/lib/marketing/analytics";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors";

/**
 * Simple email-only newsletter form for the footer.
 * Submits as source=`newsletter` with implicit consent via the visible
 * checkbox; no auto-reply subscription flow beyond the standard Resend reply.
 */
export function NewsletterForm() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  if (submitted) {
    return (
      <p className="text-xs text-white/80 leading-relaxed">ご登録ありがとうございます。確認メールをお送りしました。</p>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSending(true);

    const fd = new FormData(e.currentTarget);
    const email = ((fd.get("email") as string | null) ?? "").trim();
    const consent = fd.get("consent") === "on";

    if (!consent) {
      setError("同意が必要です。");
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/marketing/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "newsletter", email, consent }),
      });
      if (!res.ok) {
        const data = (await parseJsonSafe(res)) as { message?: string } | null;
        throw new Error(data?.message ?? "登録に失敗しました。");
      }
      track({ name: "lead_submitted", props: { source: "newsletter" } });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました。");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <label htmlFor="nl-email" className="block text-xs font-medium text-white/80">
        メルマガ登録
      </label>
      <div className="flex gap-2">
        <input
          id="nl-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="example@company.com"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={sending}
          className="shrink-0 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-xs font-medium bg-white/[0.08] text-white hover:bg-white/[0.14] transition-colors disabled:opacity-50"
        >
          {sending ? "..." : "登録"}
        </button>
      </div>
      <label htmlFor="nl-consent" className="flex items-start gap-2 text-[0.688rem] text-white/75 leading-relaxed">
        <input
          id="nl-consent"
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-white/[0.05] text-blue-500 focus:ring-blue-500/40"
        />
        <span>
          <Link href="/privacy" className="underline hover:text-white/70">
            プライバシーポリシー
          </Link>
          に同意
        </span>
      </label>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </form>
  );
}
