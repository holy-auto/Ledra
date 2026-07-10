"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "ledra-sticky-cta-dismissed";
/** バーの高さ（py-3×2 + ボタン44px）。下のスペーサーと fixed バーで共有する。 */
const BAR_HEIGHT_CLASS = "h-[calc(68px+env(safe-area-inset-bottom))]";

/**
 * モバイル専用のスティッキー CTA バー。
 * ファーストビュー通過後に出現し、一度閉じたらセッション中は再表示しない
 * （鬱陶しさは離脱要因。exit-intent は使わない方針の代替導線）。
 *
 * - Cookie 同意バナー（z-60・bottom 固定）が出ている間は表示しない。
 *   同意前の初回訪問で 2 枚が下端で重なるのを防ぐ。
 * - 表示中は同じ高さのスペーサーを文書フローに置き、フッター末尾
 *   （© 行・法的リンク）が fixed バーの背後に隠れないようにする。
 * - クリック計測は CTATracker の data-cta-location 委譲リスナーに乗る。
 */
export function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // ストレージ不可 (プライベートモード等) でも表示自体は続行
    }
    const check = () => {
      if (window.scrollY <= window.innerHeight * 0.9) return;
      // Cookie 同意が未回答の間は出さない（CookieConsent が下端を使っている）
      if (!document.cookie.includes("__ledra_consent=")) return;
      setVisible(true);
      window.removeEventListener("scroll", check);
    };
    window.addEventListener("scroll", check, { passive: true });
    // アンカー直リンクや bfcache 復元でスクロールイベントが発火しないケースを拾う
    check();
    return () => window.removeEventListener("scroll", check);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* フッターの下に同じ高さの余白を確保し、最終コンテンツをバーの上へ逃がす */}
      <div aria-hidden className={`${BAR_HEIGHT_CLASS} md:hidden`} />
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0f1a]/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden`}
      >
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
    </>
  );
}
