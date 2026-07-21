"use client";

import { useEffect } from "react";
import { captureUtm } from "@/lib/marketing/utm";

/**
 * 着地時に URL の utm を first-touch として保存する副作用専用コンポーネント。
 * マーケレイアウト直下に1回だけ置き、`/tora`→`/news` 着地の utm を導線を跨いで
 * リードフォームまで運ぶ（実体は `@/lib/marketing/utm`）。
 */
export function UtmCapture(): null {
  useEffect(() => {
    captureUtm();
  }, []);

  return null;
}
