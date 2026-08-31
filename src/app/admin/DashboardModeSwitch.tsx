"use client";

import type { ReactNode } from "react";
import { useViewMode } from "@/lib/view-mode/ViewModeContext";
import { useUiPreferences } from "@/lib/ui-preferences/UiPreferencesContext";
import StorefrontDashboard from "./StorefrontDashboard";
import DisplayModeOnboarding from "./DisplayModeOnboarding";

/**
 * DashboardModeSwitch
 * ------------------------------------------------------------
 * ダッシュボード (/admin) の表示切替ラッパー。
 * - storefront (店頭モード): POS 風の大ボタン + カンバン UI
 * - admin (管理モード): 従来の統計・分析・クイックアクション一覧
 *
 * サーバーで生成した管理モードの JSX は `adminContent` として受け取り、
 * クライアント側でモードに応じて出し分ける。
 */
export default function DashboardModeSwitch({ adminContent }: { adminContent: ReactNode }) {
  const { mode, hydrated } = useViewMode();
  const { displayMode, loading } = useUiPreferences();

  // hydration 前は SSR と同じ admin 表示を出して画面フラッシュを避ける。
  // 読み込み後は 3 種類の表示設定を /admin の第一階層で常に選べるようにする。
  const showAdminContent = !hydrated || loading || (displayMode === "standard" && mode === "admin");

  return (
    <div className="space-y-6">
      <DisplayModeOnboarding />
      {showAdminContent ? adminContent : <StorefrontDashboard />}
    </div>
  );
}
