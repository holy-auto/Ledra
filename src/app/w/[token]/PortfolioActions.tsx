"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 職人本人が「他店の実績もまとめる」「まとめを外す」ための操作。
 *
 * 束ねられるのは**両方のリンクを持っている本人だけ**。店舗側にはこの操作も、
 * 束ねた事実の表示も無い（他社に稼働先が見えないようにするための設計）。
 */
export default function PortfolioActions({
  token,
  otherShops,
}: {
  token: string;
  otherShops: { link_id: string; shop_name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/staff-portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, ...body }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? j?.message ?? "うまくいきませんでした。");
      setValue("");
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 border-t border-border-default pt-5">
      {otherShops.length > 0 && (
        <div className="mb-4 space-y-1">
          <div className="text-xs font-medium text-secondary">まとめている店舗</div>
          {otherShops.map((s) => (
            <div key={s.link_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-primary">{s.shop_name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => post({ action: "unlink", link_id: s.link_id })}
                className="text-xs text-secondary hover:underline disabled:opacity-50"
              >
                まとめから外す
              </button>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-primary">他の店舗からもらったリンクを貼ってください</label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://…/w/…"
            className="w-full rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !value.trim()}
              onClick={() => post({ action: "merge", other_token: value })}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {busy ? "処理中…" : "まとめる"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMsg(null);
              }}
              className="px-3 py-2 text-sm text-secondary hover:underline"
            >
              やめる
            </button>
          </div>
          <p className="text-xs leading-5 text-muted">
            まとめても、<span className="font-semibold">店舗側には何も表示されません</span>
            。他の店舗で働いていることが知られることはありません。
          </p>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-accent underline">
          他の店舗の実績もまとめる
        </button>
      )}

      {msg && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950 dark:text-red-400">
          {msg}
        </div>
      )}
    </div>
  );
}
