"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "ledra-reiwa-promo-dismissed";

/**
 * 期間限定告知バーの見た目＋「閉じる」操作（セッション中は再表示しない）。
 * 表示可否の期間判定はサーバ側の `PromoBanner` が担う。ここは dismiss のみ。
 *
 * 初期状態は「表示」（SSR と初回クライアント描画を一致させ、ハイドレ不整合を避ける）。
 * dismiss 済みなら mount 後のエフェクトで隠す。setState はヘルパー関数経由にして
 * set-state-in-effect を避ける（StickyMobileCTA と同じ流儀）。
 */
export function PromoBannerClient({ href }: { href: string }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        if (sessionStorage.getItem(DISMISS_KEY)) setDismissed(true);
      } catch {
        // ストレージ不可（プライベートモード等）でも表示は続行
      }
    };
    sync();
  }, []);

  if (dismissed) return null;

  return (
    <div className="relative z-30 border-b border-white/10 bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link
          href={href}
          data-cta-location="reiwa-promo-banner"
          data-cta-label="令和の虎-収録後アップデート"
          className="flex flex-1 items-center justify-center gap-2 text-center text-sm font-medium hover:underline"
        >
          <span aria-hidden>🐯</span>
          <span>
            「令和の虎」に出演しました ― <span className="font-bold">収録時から Ledra は進化を続けています。</span>
            アップデートを見る →
          </span>
        </Link>
        <button
          type="button"
          aria-label="この告知を閉じる"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // 保存できなくても閉じる操作は成立させる
            }
            setDismissed(true);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
