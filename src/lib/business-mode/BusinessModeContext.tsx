"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { BusinessMode } from "@/lib/features/catalog";

/**
 * BusinessModeContext
 * ------------------------------------------------------------
 * 整備 / 鈑金塗装 / コーティング / PPF ―― 今どの業務をしているかで
 * サイドバーの表示項目を絞り込むためのコンテキスト。
 *
 * - ViewModeContext と同じ設計: ユーザーがその場で切り替えるだけで、
 *   テナント全体の設定を変えるものではない。
 * - "all"（既定値）はフィルタなし = 現状の全項目表示と同じ挙動。
 * - 初期値は常に "all" (SSR と hydration のズレを避けるため)。
 * - マウント後に localStorage から復元する。
 */

/** UI/永続化用の選択状態。"all" は features/catalog.ts の BusinessMode には無い、フィルタ解除を表す特別値。 */
export type SelectedBusinessMode = "all" | BusinessMode;

const STORAGE_KEY = "ledra.businessMode";
const DEFAULT_MODE: SelectedBusinessMode = "all";
const VALID_MODES: readonly SelectedBusinessMode[] = ["all", "mechanic", "body_paint", "coating", "ppf"];

type BusinessModeContextValue = {
  mode: SelectedBusinessMode;
  setMode: (mode: SelectedBusinessMode) => void;
  /** true 後にクライアント側の永続値が反映された状態（ViewModeContext と同じ規約） */
  hydrated: boolean;
};

const BusinessModeContext = createContext<BusinessModeContextValue | null>(null);

export function BusinessModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<SelectedBusinessMode>(DEFAULT_MODE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && (VALID_MODES as string[]).includes(raw)) {
        setModeState(raw as SelectedBusinessMode);
      }
    } catch {
      /* localStorage が使えない環境では DEFAULT_MODE のまま */
    }
    setHydrated(true);
  }, []);

  const setMode = useCallback((next: SelectedBusinessMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }, []);

  return <BusinessModeContext.Provider value={{ mode, setMode, hydrated }}>{children}</BusinessModeContext.Provider>;
}

export function useBusinessMode(): BusinessModeContextValue {
  const ctx = useContext(BusinessModeContext);
  if (!ctx) {
    // Provider で包まれていない場合も壊れないように。"all"（無フィルタ）にフォールバックする。
    return { mode: DEFAULT_MODE, setMode: () => {}, hydrated: false };
  }
  return ctx;
}
