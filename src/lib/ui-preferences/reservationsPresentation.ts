import type { DisplayMode } from "./UiPreferencesContext";
import type { ViewMode } from "../view-mode/ViewModeContext";

export type ReservationSurface = "storefront" | "admin";

export type WebReservationPresentation = {
  listVariant: "standard" | "dense";
  pageSize: number;
  showStatsCards: boolean;
};

export function reservationSurface(
  displayMode: DisplayMode,
  viewMode: ViewMode,
  forceAdmin = false,
): ReservationSurface {
  if (forceAdmin) return "admin";
  if (displayMode === "simple") return "storefront";
  if (displayMode === "dense") return "admin";
  return viewMode === "storefront" ? "storefront" : "admin";
}

export function getWebReservationPresentation(displayMode: DisplayMode): WebReservationPresentation {
  if (displayMode === "dense") {
    return { listVariant: "dense", pageSize: 200, showStatsCards: false };
  }

  return { listVariant: "standard", pageSize: 200, showStatsCards: true };
}
