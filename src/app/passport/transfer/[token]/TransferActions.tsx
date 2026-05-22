"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  token: string;
  presetName: string | null;
  recipientEmail: string;
  vehicleLabel: string | null;
};

type Mode = "idle" | "accepting" | "rejecting" | "done" | "rejected" | "error";

export default function TransferActions({ token, presetName, recipientEmail, vehicleLabel }: Props) {
  const router = useRouter();
  const [name, setName] = useState(presetName ?? "");
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submitAccept(e: React.FormEvent) {
    e.preventDefault();
    setMode("accepting");
    setError(null);
    try {
      const res = await fetch(`/api/passport/transfers/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_name: name.trim() || null }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        setMode("error");
        setError(json.message ?? "受諾に失敗しました。");
        return;
      }
      setMode("done");
      // Soft refresh so the server-side page re-renders with the
      // updated status badge.
      setTimeout(() => router.refresh(), 800);
    } catch {
      setMode("error");
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    }
  }

  async function submitReject() {
    if (!confirm("この移転リクエストを辞退します。よろしいですか？")) return;
    setMode("rejecting");
    setError(null);
    try {
      const res = await fetch(`/api/passport/transfers/${encodeURIComponent(token)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMode("error");
        setError(json.message ?? "辞退に失敗しました。");
        return;
      }
      setMode("rejected");
      setTimeout(() => router.refresh(), 800);
    } catch {
      setMode("error");
      setError("通信に失敗しました。時間をおいて再度お試しください。");
    }
  }

  if (mode === "done") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
        <p className="font-semibold">受諾しました。</p>
        <p className="mt-2">
          {vehicleLabel ? `${vehicleLabel} の` : ""}車両パスポートの所有者として {recipientEmail} を登録しました。
        </p>
      </section>
    );
  }

  if (mode === "rejected") {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-700">
        <p>辞退しました。送信元に通知が送られます。</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <form className="space-y-4" onSubmit={submitAccept}>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
            お名前（任意）
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="山田 太郎"
            maxLength={120}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            disabled={mode === "accepting" || mode === "rejecting"}
          />
          <span className="mt-1 block text-xs text-zinc-500">新オーナーとしての表示名。後から変更できます。</span>
        </label>

        <button
          type="submit"
          disabled={mode === "accepting" || mode === "rejecting"}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-400"
        >
          {mode === "accepting" ? "受諾中..." : "受諾する"}
        </button>
      </form>

      <button
        type="button"
        onClick={submitReject}
        disabled={mode === "accepting" || mode === "rejecting"}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
      >
        {mode === "rejecting" ? "辞退中..." : "辞退する"}
      </button>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
