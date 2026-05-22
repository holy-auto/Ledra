"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  vehicleId: string;
};

type Mode = "idle" | "submitting" | "done" | "error";

export default function TransferInitiateForm({ vehicleId }: Props) {
  const router = useRouter();
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!toEmail.trim()) return;
    setMode("submitting");
    setError(null);
    try {
      const res = await fetch("/api/passport/transfers/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          to_email: toEmail.trim(),
          to_name: toName.trim() || null,
          message: message.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMode("error");
        setError(json.message ?? "送信に失敗しました。");
        return;
      }
      setMode("done");
      setTimeout(() => router.refresh(), 600);
    } catch {
      setMode("error");
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    }
  }

  if (mode === "done") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
        <p className="font-semibold">移転依頼を送信しました。</p>
        <p className="mt-2">新しいオーナー様のメールアドレスに受諾用リンクを送信しました。</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">新しいオーナーへ移転依頼</h2>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-zinc-600">メールアドレス *</span>
          <input
            type="email"
            required
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="new-owner@example.com"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            disabled={mode === "submitting"}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-zinc-600">お名前（任意）</span>
          <input
            type="text"
            value={toName}
            onChange={(e) => setToName(e.target.value)}
            placeholder="山田 太郎"
            maxLength={120}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            disabled={mode === "submitting"}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-zinc-600">メッセージ（任意）</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="新しいオーナー様へのご挨拶など"
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            disabled={mode === "submitting"}
          />
        </label>

        <button
          type="submit"
          disabled={mode === "submitting" || !toEmail.trim()}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-400"
        >
          {mode === "submitting" ? "送信中..." : "移転依頼を送信"}
        </button>

        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-zinc-500">
          移転依頼は受諾期限 14 日です。期限切れまたはキャンセル後は再送信できます。
        </p>
      </form>
    </section>
  );
}
