"use client";

import dynamic from "next/dynamic";

/**
 * Client-side wrapper around <PendingOfflineCerts>.
 *
 * Next.js 16 (Turbopack) disallows `dynamic({ ssr: false })` inside
 * Server Components. The underlying component reads IndexedDB at
 * mount, which is meaningless during SSR, so we keep the
 * "skip-SSR" behavior by hosting the dynamic call here.
 */
const PendingOfflineCerts = dynamic(() => import("./PendingOfflineCerts"), { ssr: false });

export default function PendingOfflineCertsClient() {
  return <PendingOfflineCerts />;
}
