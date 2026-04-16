"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * NavigationProgress
 * ------------------------------------------------------------
 * ページ遷移時に画面上部に現れる薄い進捗バー (NProgress 的なもの)。
 * クリック直後から表示され、pathname の変化で完了する。
 *
 * - 200ms 以下の遷移ではちらつかないよう表示を遅延
 * - Link / a タグ内クリックを document レベルで検知 (router.push なども
 *   Next.js の Link 経由なら捕捉可能。完全な捕捉は pathname watcher に依存)
 * - pathname 変化 or 10s で自動リセット
 *
 * Next.js App Router 公式のルーターイベントが無いため、
 * 「クリック検知 + pathname 監視」の折衷アプローチを採用。
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  // クリック検知 (内部リンクのみ)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // 修飾キー付きクリック (新規タブ等) は無視
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;

      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#")) return;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        // 外部リンクは内部遷移でないのでスキップ (ただし同一オリジン内部 URL は OK)
        try {
          const url = new URL(href, window.location.origin);
          if (url.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      // 同じ URL ならスキップ
      const currentUrl =
        pathname +
        (searchParams.toString() ? `?${searchParams.toString()}` : "");
      if (href === currentUrl) return;

      startProgress();
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [pathname, searchParams]);

  // pathname / searchParams 変化で完了
  useEffect(() => {
    if (activeRef.current) {
      finishProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams.toString()]);

  // 進捗を非線形に進める (90%まで)
  useEffect(() => {
    if (!visible) return;
    const iv = setInterval(() => {
      setProgress((p) => (p < 90 ? p + (90 - p) * 0.12 : p));
    }, 180);
    return () => clearInterval(iv);
  }, [visible]);

  function startProgress() {
    activeRef.current = true;
    // 200ms 以下の遷移ではちらつかないよう、遅延表示
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => {
      if (!activeRef.current) return;
      setVisible(true);
      setProgress(15);
    }, 150);

    // Safety: 10 秒で強制終了
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => {
      finishProgress();
    }, 10_000);
  }

  function finishProgress() {
    activeRef.current = false;
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    // 既に表示されているなら 100% まで埋めてフェードアウト
    if (visible) {
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 280);
    } else {
      setProgress(0);
    }
  }

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 right-0 top-0 z-[9999] pointer-events-none h-[3px] bg-transparent"
    >
      <div
        className="h-full bg-accent shadow-[0_0_10px_rgba(59,130,246,0.5)]"
        style={{
          width: `${progress}%`,
          transition: "width 180ms ease-out, opacity 200ms ease-out",
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
