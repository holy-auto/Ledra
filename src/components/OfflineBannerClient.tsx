"use client";

import dynamic from "next/dynamic";

/**
 * Client-side wrapper around <OfflineBanner>.
 *
 * Next.js 16 (Turbopack) disallows `dynamic({ ssr: false })` inside
 * Server Components. The banner depends on `navigator.onLine` and
 * Service Worker / IndexedDB events at mount, so SSR rendering
 * adds no value — we keep that wrapper here.
 */
const OfflineBanner = dynamic(() => import("@/components/OfflineBanner"), { ssr: false });

export default function OfflineBannerClient() {
  return <OfflineBanner />;
}
