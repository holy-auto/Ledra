"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { shouldShowPromo, REIWA_PROMO_HREF } from "@/lib/marketing/promo";

const DISMISS_KEY = "ledra-reiwa-promo-dismissed";

/**
 * 令和の虎 出演告知の期間限定バー（全マーケページ最上部）。
 *
 * 表示可否はクライアントで判定する（`?preview_promo=1` で期間前に目視確認できるようにするため。
 * サーバ判定＋cookie/headers 参照はマーケ全ページを dynamic 化して ISR を壊すので採らない）。
 * 期間内 or プレビュー、かつ dismiss 未実施のときだけ表示。
 *
 * 初期状態は非表示（SSR と初回クライアント描画を一致させハイドレ不整合を避ける）。表示判定は
 * mount 後のエフェクトで行い、setState はヘルパー関数経由にして set-state-in-effect を避ける
 * （StickyMobileCTA と同じ流儀）。
 *
 * ponytail: 期間判定はクライアント時計依存（放送用の告知バーなので数分のずれは許容）。バーは
 * mount 後に出るため軽微なちらつきがある。キャンペーン(〜8/8)終了後はこの一式を削除する想定。
 */
export function PromoBannerClient() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const decide = () => {
      let search = "";
      try {
        search = window.location.search;
      } catch {
        // ignore
      }
      if (!shouldShowPromo(new Date(), search)) return;
      try {
        if (sessionStorage.getItem(DISMISS_KEY)) return;
      } catch {
        // ストレージ不可（プライベートモード等）でも表示は続行
      }
      setVisible(true);
    };
    decide();
  }, []);

  if (!visible) return null;

  return (
    <div className="relative z-30 border-b border-white/10 bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link
          href={REIWA_PROMO_HREF}
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
            setVisible(false);
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
