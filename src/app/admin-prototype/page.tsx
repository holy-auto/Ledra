import type { Metadata } from "next";
import LedraPrototype from "./LedraPrototype";

// Design reference only — keep it out of search indexes.
export const metadata: Metadata = {
  title: "Ledra Admin — プロトタイプ",
  description: "Ledra Admin ポータルのクリック動作プロトタイプ（デザインリファレンス）。",
  robots: { index: false, follow: false },
};

export default function AdminPrototypePage() {
  return <LedraPrototype />;
}
