"use client";

import Link from "next/link";
import { ReactNode, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAdminBillingStatus } from "@/lib/billing/useAdminBillingStatus";
import { canUseFeature, featureLabel, normalizePlanTier, type FeatureKey } from "@/lib/billing/planFeatures";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { requiredPermissionForPath } from "@/lib/auth/permissions";

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

  // Pro 限定機能（料金プラン詳細資料 p.3 比較表）
  if (pathname.startsWith("/admin/audit")) return "audit_log";
  if (pathname.startsWith("/admin/thickness-reports")) return "detailed_reports";

  return null;
}

export default function AdminRouteGuard({ children }: { children: ReactNode }) {
  const bs = useAdminBillingStatus();
  const { can, loading: roleLoading, isOrgUser } = useCurrentRole();
  const pathname = usePathname();
  const sp = useSearchParams();

  const feature = requiredFeatureForPath(pathname);
  const requiredPerm = requiredPermissionForPath(pathname);

  // 本社専用ユーザ (tenant role 無し) は本社向け画面のみアクセス可能。
  const isHqPage = pathname.startsWith("/admin/hq-overview") || pathname.startsWith("/admin/organizations");

  // useMemo must be called unconditionally (before any early returns)
  const nextUrl = useMemo(() => {
    const qs = sp?.toString();
    return qs ? pathname + "?" + qs : pathname;
  }, [pathname, sp]);

  // Role-based access check (skip while loading to avoid false blocks).
  // 本社専用ユーザは本社向け画面 (isHqPage) では許可する。
  if (!roleLoading && requiredPerm && !can(requiredPerm) && !(isOrgUser && isHqPage)) {
    return (
      <div className="space-y-3">
        <div className="glass-card p-4 text-sm glow-amber">
          <div className="font-semibold text-warning">この画面へのアクセス権限がありません。</div>
          <div className="mt-3">
            <Link className="btn-primary" href="/admin">
              ダッシュボードに戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="font-semibold text-warning">{title}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link className="btn-primary" href={"/admin/billing?next=" + encodeURIComponent(nextUrl)}>
            {cta}
          </Link>
          <span className="text-xs text-muted">
            plan: {planTier} / active: {String(isActive)}
          </span>
        </div>
      </div>

      <div className="opacity-60 pointer-events-none select-none" aria-disabled="true">
        {children}
      </div>
    </div>
  );
}
