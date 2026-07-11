/**
 * NetworkGraph と CarJourneySection で共有するアクセントカラー。
 *
 * globals.css の --accent-blue/-violet/-emerald/-gold トークンとは
 * 意図的に別値（ダーク背景の SVG/グラフィック上でより発色させるため）。
 * 2箇所への手書き複製を避けるためだけにここへ集約する。
 */
export const BRAND_ACCENT = {
  gold: "#c9a55c",
  blue: "#4d9fff",
  violet: "#a78bfa",
  emerald: "#34d399",
} as const;
