"use client";

import { useContext } from "react";
import { ViewerModeContext, type ViewerModeContextValue } from "@/components/ui/ViewerModeContext";

/**
 * 現在ユーザのロール / 閲覧専用 (viewer) 判定を取得するフック。
 *
 * `<ViewerModeProvider>` 配下で使う。Provider 外で呼ばれた場合は
 * context のデフォルト値 ({ role: null, isViewer: false, loading: true })
 * が返るため、クラッシュはしない。
 *
 * @example
 * const { isViewer } = useViewerMode();
 */
export function useViewerMode(): ViewerModeContextValue {
  return useContext(ViewerModeContext);
}
