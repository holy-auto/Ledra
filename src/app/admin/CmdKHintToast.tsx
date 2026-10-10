"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ledra_cmdk_hint_shown";
const DELAY_MS = 4000; // ツアー終了後にじわっと表示

/**
 * Cmd+K (コマンドパレット) のヒントを 1 度だけ右下に表示するトースト。
 *
 * - localStorage に表示済みフラグを書き、二度目以降は出さない
 * - OnboardingTour 直後に被せないため、4 秒だけ待ってから表示
 * - 「閉じる」をクリックするか「試してみる」を押した時点で永続的に非表示
 */
export default function CmdKHintToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setVisible(true), DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* noop */
    }
    setVisible(false);
  };

  const tryIt = () => {
    dismiss();
    // CommandPalette は Cmd/Ctrl+K の keydown を listen している。
    // 同じイベントを合成して投げるとパレットが開く。
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
    const event = new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
    });
    window.dispatchEvent(event);
    document.dispatchEvent(event);
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 right-5 z-40 max-w-xs rounded-2xl border border-accent/30 bg-surface shadow-lg backdrop-blur-md p-4 animate-fade-in"
      style={{ animation: "fade-in 320ms cubic-bezier(0.4, 0, 0.2, 1)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">ヒント: 素早く検索・移動</span>
          </div>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            <kbd className="px-1.5 py-0.5 rounded bg-surface-hover border border-border-default text-[10px] font-mono">
              Cmd
            </kbd>
            <span className="mx-1 text-muted">+</span>
            <kbd className="px-1.5 py-0.5 rounded bg-surface-hover border border-border-default text-[10px] font-mono">
              K
            </kbd>
            <span className="ml-1">でいつでもパレットが開きます。ページ名・顧客名・証明書IDで検索可能。</span>
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-primary transition-colors"
          aria-label="閉じる"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M2 2 L10 10 M10 2 L2 10" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex gap-2 justify-end">
        <button type="button" onClick={dismiss} className="btn-ghost text-xs px-3 py-1.5">
          閉じる
        </button>
        <button type="button" onClick={tryIt} className="btn-primary text-xs px-3 py-1.5">
          試してみる
        </button>
      </div>
    </div>
  );
}
