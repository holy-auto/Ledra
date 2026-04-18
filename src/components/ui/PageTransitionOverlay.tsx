"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MIN_MS = 1000;
const FADE_MS = 300;
const SAFETY_MS = 10_000;

export default function PageTransitionOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  const activeRef = useRef(false);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // リンククリックを検知して overlay 開始
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
      } catch {
        return;
      }
      const currentUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
      if (href === currentUrl) return;

      show();
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [pathname, searchParams]);

  // pathname 変化 = ナビゲーション完了 → 残り時間待ってから非表示
  useEffect(() => {
    if (!activeRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(0, MIN_MS - elapsed);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(hide, remaining);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams.toString()]);

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current);
    activeRef.current = true;
    startTimeRef.current = Date.now();
    setFadingOut(false);
    setVisible(true);
    // 安全タイムアウト
    timerRef.current = setTimeout(hide, SAFETY_MS);
  }

  function hide() {
    setFadingOut(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setFadingOut(false);
      activeRef.current = false;
    }, FADE_MS);
  }

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] pointer-events-none"
      style={{ opacity: fadingOut ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}
    >
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "color-mix(in srgb, var(--bg-base) 88%, transparent)" }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border-subtle border-t-accent" />
      </div>
    </div>
  );
}
