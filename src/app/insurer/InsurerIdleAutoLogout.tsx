"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Idle auto-logout for the insurer portal.
 * Default: 30 min idle → warning → 60s later → auto-logout
 */

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min
const WARNING_BEFORE_MS = 60 * 1000; // 60s after warning

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;

export default function InsurerIdleAutoLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningDialogRef = useRef<HTMLDialogElement | null>(null);
  const lastActivityRef = useRef(Date.now());

  const doLogout = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      try { sessionStorage.clear(); } catch { /* ignore */ }
    } catch { /* ignore */ }
    window.location.replace("/insurer/login?reason=idle");
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
    warningTimerRef.current = setTimeout(doLogout, WARNING_BEFORE_MS);
  }, [doLogout]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (warningDialogRef.current?.open) {
      dismissWarning();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(showWarning, IDLE_TIMEOUT_MS);
  }, [showWarning, dismissWarning]);

  useEffect(() => {
    resetTimer();

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const onActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; }, 2000);
      resetTimer();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

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
      className="fixed inset-0 z-[9999] m-auto w-[90vw] max-w-md rounded-2xl border border-amber-500/30 bg-white p-0 shadow-2xl backdrop:bg-black/50"
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
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            操作を続ける
          </button>
          <button
            type="button"
            onClick={doLogout}
            className="rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            ログアウト
          </button>
        </div>
      </div>
    </dialog>
  );
}
