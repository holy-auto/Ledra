"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 一定時間操作がなければ自動ログアウトするコンポーネント
 * 管理画面レイアウトに配置する
 *
 * デフォルト: 30分間操作なし → 警告表示 → 60秒後に自動ログアウト
 */

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30分
const WARNING_BEFORE_MS = 60 * 1000; // 警告表示から60秒後にログアウト

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;

export default function IdleAutoLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningDialogRef = useRef<HTMLDialogElement | null>(null);
  const lastActivityRef = useRef(Date.now());

  const doLogout = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      // sessionStorageのキャッシュもクリア
      try { sessionStorage.clear(); } catch { /* ignore */ }
    } catch { /* ignore */ }
    // replaceでbfcacheに管理画面を残さない
    window.location.replace("/login?reason=idle");
  }, []);

  const dismissWarning = useCallback(() => {
    warningDialogRef.current?.close();
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  const showWarning = useCallback(() => {
    warningDialogRef.current?.showModal();
    // 60秒後に自動ログアウト
    warningTimerRef.current = setTimeout(doLogout, WARNING_BEFORE_MS);
  }, [doLogout]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    // 警告ダイアログが出ている場合は閉じる
    if (warningDialogRef.current?.open) {
      dismissWarning();
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(showWarning, IDLE_TIMEOUT_MS);
  }, [showWarning, dismissWarning]);

  useEffect(() => {
    // 初回タイマー開始
    resetTimer();

    // アクティビティ検出（throttle付き）
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const onActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; }, 2000);
      resetTimer();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    // タブ復帰時にもチェック
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= IDLE_TIMEOUT_MS + WARNING_BEFORE_MS) {
          doLogout();
        } else if (elapsed >= IDLE_TIMEOUT_MS) {
          showWarning();
        } else {
          resetTimer();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [resetTimer, showWarning, doLogout]);

  return (
    <dialog
      ref={warningDialogRef}
      className="fixed inset-0 z-[9999] m-auto w-[90vw] max-w-md rounded-2xl border border-amber-200 bg-white p-0 shadow-2xl backdrop:bg-black/50"
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900">セッション期限切れ間近</h3>
            <p className="text-sm text-neutral-600">
              操作が検出されないため、まもなく自動ログアウトされます。
            </p>
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          このまま操作がなければ60秒後に自動的にログアウトされます。
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => { dismissWarning(); resetTimer(); }}
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
          >
            操作を続ける
          </button>
          <button
            type="button"
            onClick={doLogout}
            className="rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            ログアウト
          </button>
        </div>
      </div>
    </dialog>
  );
}
