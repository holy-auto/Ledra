export type HomeDisplayMode = "simple" | "standard" | "dense";

export type HomePresentation = {
  activeWorkLimit: 3 | 6;
  collapseScope: boolean;
  nextActionFirst: boolean;
  showDetailedStatus: boolean;
};

export function getHomePresentation(displayMode: HomeDisplayMode): HomePresentation {
  return {
    activeWorkLimit: displayMode === "dense" ? 6 : 3,
    collapseScope: displayMode === "simple",
    nextActionFirst: displayMode === "simple",
    showDetailedStatus: displayMode !== "simple",
  };
}
