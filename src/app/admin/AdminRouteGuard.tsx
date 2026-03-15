"use client";

import Link from "next/link";
import { ReactNode, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAdminBillingStatus } from "@/lib/billing/useAdminBillingStatus";
import { canUseFeature, featureLabel, normalizePlanTier, type FeatureKey } from "@/lib/billing/planFeatures";

function requiredFeatureForPath(pathname: string): FeatureKey | null {
  if (pathname.startsWith("/admin/templates")) return "manage_templates";
  if (pathname.startsWith("/admin/logo")) return "upload_logo";

  // 作成/出力系（見た目制限）
  if (pathname.startsWith("/admin/certificates/new")) return "issue_certificate";
  if (pathname.startsWith("/admin/certificates/export-selected")) return "export_selected_csv";
  if (pathname.startsWith("/admin/certificates/export-one")) return "export_one_csv";
  if (pathname.startsWith("/admin/certificates/export")) return "export_search_csv";
  if (pathname.startsWith("/admin/certificates/pdf-selected")) return "pdf_zip";
  if (pathname.startsWith("/admin/certificates/pdf-one")) return "pdf_one";

  return null;
}

export default function AdminRouteGuard({ children }: { children: ReactNode }) {
  const bs = useAdminBillingStatus();
  const pathname = usePathname();
  const sp = useSearchParams();

  const feature = requiredFeatureForPath(pathname);

  // useMemo must be called unconditionally (before any early returns)
  const nextUrl = useMemo(() => {
    const qs = sp?.toString();
    return qs ? (pathname + "?" + qs) : pathname;
  }, [pathname, sp]);

  // billing画面は常に触れる（ループ防止）
  if (!feature || pathname.startsWith("/admin/billing")) return <>{children}</>;

  // 取得できてない間は"誤ブロック"しない
  if (!bs.data) return <>{children}</>;

  const isActive = !!bs.data.is_active;
  const planTier = normalizePlanTier(bs.data.plan_tier ?? "pro");
  const allowed = isActive && canUseFeature(planTier, feature);

  if (allowed) return <>{children}</>;

  const title = !isActive
    ? "支払いが停止中のため、この画面の操作は無効です。"
    : "現在のプラン（" + planTier + "）では「" + featureLabel(feature) + "」は利用できません。";

  const cta = !isActive ? "支払いを再開" : "プランをアップグレード";

  return (
    <div className="space-y-3">
      <div className="glass-card p-4 text-sm glow-amber">
        <div className="font-semibold text-amber-400">{title}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link className="btn-primary" href={"/admin/billing?next=" + encodeURIComponent(nextUrl)}>
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
