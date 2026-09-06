import type { DisplayMode } from "./UiPreferencesContext";

export type VehicleListPresentation = {
  variant: "simple" | "standard" | "dense";
  showBulkActions: boolean;
  showStats: boolean;
};

export function getVehicleListPresentation(displayMode: DisplayMode): VehicleListPresentation {
  if (displayMode === "simple") {
    return { variant: "simple", showBulkActions: false, showStats: false };
  }

  if (displayMode === "dense") {
    return { variant: "dense", showBulkActions: true, showStats: false };
  }

  return { variant: "standard", showBulkActions: true, showStats: true };
}
