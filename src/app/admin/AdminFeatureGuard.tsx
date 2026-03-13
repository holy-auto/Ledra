"use client";

import Link from "next/link";
import { ReactNode, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAdminBillingStatus } from "@/lib/billing/useAdminBillingStatus";
import { canUseFeature, normalizePlanTier, type FeatureKey } from "@/lib/billing/planFeatures";
export default function AdminFeatureGuard({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const bs = useAdminBillingStatus();
  const pathname = usePathname();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const qs = sp?.toString();
    return pathname + (qs ? `?\${qs}` : "");
  }, [pathname, sp]);

  const isActive = bs.data?.is_active ?? true;
  const planTier = normalizePlanTier(bs.data?.plan_tier ?? "pro");
  const allowed = isActive && canUseFeature(planTier, feature);

  if (allowed) return <>{children}</>;

  const title = !isActive
    ? "支払いが停止中のため、この画面の操作は無効です。"
    : `現在のプラン（\${planTier}）ではこの機能は利用できません。`;

  const cta = !isActive ? "支払いを再開" : "プランをアップグレード";

  return (
    <div className="space-y-3">
      <div className="glass-card p-4 text-sm glow-amber">
        <div className="font-semibold text-amber-400">{title}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link className="btn-primary" href={`/admin/billing?next=${encodeURIComponent(nextUrl)}`}>
            {cta}
          </Link>
          <span className="text-xs text-muted">plan: {planTier} / active: {String(isActive)}</span>
        </div>
      </div>

      <div className="opacity-60 pointer-events-none select-none" aria-disabled="true">
        {children}
      </div>
    </div>
  );
}

