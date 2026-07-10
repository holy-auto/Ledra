"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "ledra-sticky-cta-dismissed";

/**
 * モバイル専用のスティッキー CTA バー。
 * ファーストビュー通過後に出現し、一度閉じたらセッション中は再表示しない
 * （鬱陶しさは離脱要因。exit-intent は使わない方針の代替導線）。
 * クリック計測は CTATracker の data-cta-location 委譲リスナーに乗る。
 */
export function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // ストレージ不可 (プライベートモード等) でも表示自体は続行
    }
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.9) {
        setVisible(true);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0f1a]/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
      <div className="flex items-center gap-2.5">
        <Link
          href="/signup"
          data-cta-location="sticky-bar"
          data-cta-label="無料で試す"
          className="flex-1 rounded-lg bg-white px-3 py-3 text-center text-sm font-medium text-[#060a12]"
        >
          無料で試す
        </Link>
        <Link
          href="/resources"
          data-cta-location="sticky-bar"
          data-cta-label="資料ダウンロード"
          className="flex-1 rounded-lg border border-white/25 px-3 py-3 text-center text-sm font-medium text-white"
        >
          資料ダウンロード
        </Link>
        <button
          type="button"
          aria-label="このバーを閉じる"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // 保存できなくても閉じる操作は成立させる
            }
            setVisible(false);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
