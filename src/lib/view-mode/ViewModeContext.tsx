"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * ViewModeContext
 * ------------------------------------------------------------
 * 管理者向けの従来 UI (admin) と、店頭ワンタップ操作向けの POS 風 UI (storefront) を
 * ユーザーが能動的に切り替えるためのコンテキスト。
 *
 * - 初期値は常に "admin" (SSR と hydration のズレを避けるため)
 * - マウント後に localStorage から復元する
 * - 切替時は即座に localStorage に永続化
 */

export type ViewMode = "admin" | "storefront";

const STORAGE_KEY = "ledra.viewMode";
const DEFAULT_MODE: ViewMode = "admin";

type ViewModeContextValue = {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  toggle: () => void;
  /** true 後にクライアント側の永続値が反映された状態 */
  hydrated: boolean;
};

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>(DEFAULT_MODE);
  const [hydrated, setHydrated] = useState(false);

  // マウント時に localStorage から復元
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "admin" || raw === "storefront") {
        setModeState(raw);
      }
    } catch {
      /* localStorage が使えない環境では DEFAULT_MODE のまま */
    }
    setHydrated(true);
  }, []);

  const setMode = useCallback((next: ViewMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: ViewMode = prev === "admin" ? "storefront" : "admin";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  return <ViewModeContext.Provider value={{ mode, setMode, toggle, hydrated }}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): ViewModeContextValue {
  const ctx = useContext(ViewModeContext);
  if (!ctx) {
    // Provider で包まれていない場合も壊れないように。UIが admin モードにフォールバックする。
    return {
      mode: DEFAULT_MODE,
      setMode: () => {},
      toggle: () => {},
      hydrated: false,
    };
  }
  return ctx;
}
