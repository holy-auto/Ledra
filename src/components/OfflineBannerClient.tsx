"use client";

import dynamic from "next/dynamic";

const OfflineBanner = dynamic(() => import("./OfflineBanner"), { ssr: false });

export default function OfflineBannerClient() {
  return <OfflineBanner />;
}
