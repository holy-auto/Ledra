"use client";

import dynamic from "next/dynamic";

const PendingOfflineCerts = dynamic(() => import("./PendingOfflineCerts"), { ssr: false });

export default function PendingOfflineCertsClient() {
  return <PendingOfflineCerts />;
}
