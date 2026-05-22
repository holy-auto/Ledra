"use client";

// Next.js 16 (Turbopack) では Server Component から
// `dynamic({ ssr: false })` を呼べないため、ssr: false 指定を
// このクライアントラッパーに閉じ込めている。
// PendingOfflineCerts は IndexedDB の Outbox を読むため SSR では空表示にする。

import dynamic from "next/dynamic";

const PendingOfflineCerts = dynamic(() => import("./PendingOfflineCerts"), {
  ssr: false,
});

export default function PendingOfflineCertsClient() {
  return <PendingOfflineCerts />;
}
