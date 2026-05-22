"use client";

// Next.js 16 (Turbopack) では Server Component で `dynamic({ ssr: false })` を
// 使えないため、`ssr: false` 指定をこのクライアントラッパーに閉じ込めている。
// Service Worker / IndexedDB / navigator.onLine に依存する OfflineBanner を
// SSR せず、初回はサーバ側で何も描画しない (suspense-safe な空ノード) ようにする。

import dynamic from "next/dynamic";

const OfflineBanner = dynamic(() => import("@/components/OfflineBanner"), {
  ssr: false,
});

export default function OfflineBannerClient() {
  return <OfflineBanner />;
}
