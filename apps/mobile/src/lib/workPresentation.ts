import type { HomeDisplayMode } from "./homePresentation";

export type WorkPresentation = {
  cardVariant: "simple" | "standard" | "dense";
  initialNumToRender: number;
  maxToRenderPerBatch: number;
  queryLimit: number;
  windowSize: number;
};

export function getWorkPresentation(displayMode: HomeDisplayMode): WorkPresentation {
  if (displayMode === "simple") {
    return {
      cardVariant: "simple",
      initialNumToRender: 6,
      maxToRenderPerBatch: 6,
      queryLimit: 200,
      windowSize: 5,
    };
  }

  if (displayMode === "dense") {
    return {
      cardVariant: "dense",
      initialNumToRender: 16,
      maxToRenderPerBatch: 16,
      queryLimit: 200,
      windowSize: 9,
    };
  }

  return {
    cardVariant: "standard",
    initialNumToRender: 10,
    maxToRenderPerBatch: 10,
    queryLimit: 200,
    windowSize: 7,
  };
}
