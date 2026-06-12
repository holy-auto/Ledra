"use client";

import { createContext } from "react";
import type { Role } from "@/lib/auth/roles";

/**
 * ViewerModeContext
 * ------------------------------------------------------------
 * 現在ログイン中ユーザの「ロール」をクライアント側に供給するコンテキスト。
 *
 * これは閲覧専用モード (ビューパック) の土台であり、`view-mode`
 * (admin / storefront の UI 切替) とは別概念である点に注意。
 *
 * - `role`     … 解決済みロール。未解決 (取得中 / 失敗) は null。
 * - `isViewer` … role === "viewer" のショートカット。
 * - `loading`  … /api/admin/me の取得が進行中かどうか。
 *
 * MutationGuard はこの context を読み、最低ロール未満のユーザに対して
 * 変更系 UI (保存 / 追加 / 削除ボタン等) を隠す / 無効化する。
 */
export type ViewerModeContextValue = {
  role: Role | null;
  isViewer: boolean;
  loading: boolean;
};

export const ViewerModeContext = createContext<ViewerModeContextValue>({
  role: null,
  isViewer: false,
  loading: true,
});
