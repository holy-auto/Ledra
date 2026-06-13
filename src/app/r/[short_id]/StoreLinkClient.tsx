"use client";

/**
 * 店舗用登録リンクの公開ランディング.
 *
 * フロー:
 *   1. ?t=<token> を URL から取得
 *   2. GET /api/intake/link/:short_id でリンク検証 → 店舗名を表示
 *   3. 「登録をはじめる」で POST → その都度 1 回限りの intake を mint
 *   4. 返ってきた /intake/:short_id?t=... へ遷移 (既存フォームに合流)
 *
 * GET でフォームを直接出さず「ボタンを押してから mint」する設計にすることで、
 * QR のプレビュー取得やボットのクロールで空の intake が量産されるのを防ぐ。
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface LinkInfo {
  ok: true;
  store_name: string | null;
  label: string | null;
}

export default function StoreLinkClient({ shortId }: { shortId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const rawToken = sp?.get("t") ?? "";

  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ok"; data: LinkInfo } | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);

  useEffect(() => {
    if (!rawToken) {
      setState({ kind: "error", message: "URL が不正です (token がありません)" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/intake/link/${shortId}?t=${encodeURIComponent(rawToken)}`);
        const j = await res.json();
        if (!res.ok || !j?.ok) {
          setState({ kind: "error", message: j?.error?.message ?? j?.message ?? "リンクが見つかりません" });
          return;
        }
        setState({ kind: "ok", data: j });
      } catch (e) {
        setState({ kind: "error", message: e instanceof Error ? e.message : "通信エラー" });
      }
    })();
  }, [shortId, rawToken]);

  async function start() {
    setStarting(true);
    setStartErr(null);
    try {
      const res = await fetch(`/api/intake/link/${shortId}?t=${encodeURIComponent(rawToken)}`, {
        method: "POST",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok || !j.intake_path) {
        setStartErr(j?.error?.message ?? j?.message ?? "開始できませんでした");
        return;
      }
      router.push(j.intake_path as string);
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setStarting(false);
    }
  }

  if (state.kind === "loading") {
    return <div className="p-6 text-sm text-muted">読み込み中…</div>;
  }

  if (state.kind === "error") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-bold text-primary">ご利用いただけません</h1>
        <p className="mt-2 text-sm text-danger-text">{state.message}</p>
        <p className="mt-2 text-xs text-muted">店舗に新しい QR / URL の発行をご依頼ください。</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 font-sans space-y-5">
      <div>
        {state.data.store_name && <p className="text-sm font-semibold text-accent">{state.data.store_name}</p>}
        <h1 className="mt-1 text-xl font-bold text-primary">お客様情報のご登録</h1>
        <p className="mt-2 text-sm text-secondary">
          ご来店の受付にあたり、お客様情報のご登録をお願いしております。下のボタンから入力フォームにお進みください。
        </p>
      </div>

      <ul className="space-y-2 rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm text-secondary">
        <li>・所要時間は 1〜2 分です</li>
        <li>・身分証の撮影による自動入力（任意）もご利用いただけます</li>
        <li>・マイナンバー（12 桁の個人番号）は取り扱いません</li>
      </ul>

      {startErr && (
        <div className="rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
          {startErr}
        </div>
      )}

      <button
        type="button"
        disabled={starting}
        onClick={start}
        className="w-full rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-on-primary disabled:opacity-50"
      >
        {starting ? "準備中…" : "登録をはじめる"}
      </button>
    </main>
  );
}
