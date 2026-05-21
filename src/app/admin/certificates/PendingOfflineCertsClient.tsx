"use client";

import dynamic from "next/dynamic";

// Next.js 16: `ssr: false` を伴う dynamic は Server Component から直接使えない。
// Client Component の薄いラッパー経由で、IndexedDB を読む PendingOfflineCerts を
// クライアント限定で読み込む。
const PendingOfflineCerts = dynamic(() => import("./PendingOfflineCerts"), { ssr: false });

export default function PendingOfflineCertsClient() {
  return <PendingOfflineCerts />;
}
