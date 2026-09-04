"use client";

import { useSearchParams } from "next/navigation";
import { useViewMode } from "@/lib/view-mode/ViewModeContext";
import { useUiPreferences } from "@/lib/ui-preferences/UiPreferencesContext";
import { reservationSurface } from "@/lib/ui-preferences/reservationsPresentation";
import ReservationsClient from "./ReservationsClient";
import StorefrontReservations from "./StorefrontReservations";

/**
 * ReservationsModeSwitch
 * ------------------------------------------------------------
 * /admin/reservations のモード切替ラッパー。
 * - storefront: 日付範囲 + 4 列カンバン + 1 タップ遷移
 * - admin: 従来の検索・カレンダー・詳細編集 UI
 *
 * 例外: URL に `create=1` がある場合は、モードに関わらず管理モード UI
 * (ReservationsClient) を表示し、新規予約フォームを自動で開く。
 * (Quick Create などから渡ってくるクエリを確実に拾うため。
 * CustomersModeSwitch と同じ規約)
 */
export default function ReservationsModeSwitch() {
  const { mode, hydrated } = useViewMode();
  const { displayMode, loading } = useUiPreferences();
  const sp = useSearchParams();
  const forceAdmin = sp.get("create") === "1";
  const surface = reservationSurface(displayMode, mode, forceAdmin);

  if (!hydrated || loading || surface === "admin") {
    return <ReservationsClient />;
  }
  return <StorefrontReservations />;
}
