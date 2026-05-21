"use client";

import dynamic from "next/dynamic";

// Next.js 16: `ssr: false` を伴う dynamic は Server Component から直接使えない。
// Client Component の薄いラッパーに移して、IndexedDB / Service Worker 依存の
// OfflineBanner をクライアント限定で読み込む。
const OfflineBanner = dynamic(() => import("./OfflineBanner"), { ssr: false });

export default function OfflineBannerClient() {
  return <OfflineBanner />;
}
