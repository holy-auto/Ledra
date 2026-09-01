export type HomeDisplayMode = "simple" | "standard" | "dense";

export type HomePresentation = {
  activeWorkLimit: 3 | 6;
  nextActionFirst: boolean;
  showDetailedStatus: boolean;
};

export function getHomePresentation(displayMode: HomeDisplayMode): HomePresentation {
  return {
    activeWorkLimit: displayMode === "dense" ? 6 : 3,
    nextActionFirst: displayMode === "simple",
    showDetailedStatus: displayMode !== "simple",
  };
}
