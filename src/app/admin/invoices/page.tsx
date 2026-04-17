import { Suspense } from "react";
import nextDynamic from "next/dynamic";

const BillingModeSwitch = nextDynamic(() => import("./BillingModeSwitch"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />,
});

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">読み込み中...</div>}>
      <BillingModeSwitch />
    </Suspense>
  );
}
