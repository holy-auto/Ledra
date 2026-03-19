import { Suspense } from "react";
import nextDynamic from "next/dynamic";

const BillingHubClient = nextDynamic(() => import("./BillingHubClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">読み込み中...</div>}>
      <BillingHubClient />
    </Suspense>
  );
}
