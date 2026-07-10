"use client";

import Link from "next/link";
import { useMemo } from "react";
import { NAV_GROUPS, type NavItem } from "@/components/ui/Sidebar";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { groupHubEntries, type HubEntry } from "@/lib/admin/settingsHub";

type HubCard = HubEntry & { icon: React.ReactNode };

/**
 * 設定ハブ: サイドバーから外した設定・マスタ系項目 (NavItem.hub) を、歯車から
 * 開くこのページに集約表示する。項目定義は NAV_GROUPS を単一の出典として再利用し、
 * 二重管理を避ける。自分自身 (/admin/settings) はカードにしない。
 */
export default function SettingsHub() {
  const { role, loading, isPlatformAdmin, isOrgUser, can } = useCurrentRole();

  // NAV_GROUPS から hub 項目だけを取り出す（アイコンも保持）。定義は静的なので一度きり。
  const entries = useMemo<HubCard[]>(
    () =>
      NAV_GROUPS.flatMap((g) => g.items)
        .filter((i: NavItem) => i.hub)
        .map((i: NavItem) => ({
          href: i.href,
          label: i.label,
          hubSection: i.hubSection,
          platformOnly: i.platformOnly,
          orgUserVisible: i.orgUserVisible,
          requiredPermission: i.requiredPermission,
          icon: i.icon,
        })),
    [],
  );

  const sections = useMemo(
    () =>
      groupHubEntries(
        // can は Permission 型を取るが、HubGate は文字列 API。境界で 1 度だけ広げる。
        entries,
        { role, loading, isPlatformAdmin, isOrgUser, can: can as (p: string) => boolean },
        "/admin/settings",
      ),
    [entries, role, loading, isPlatformAdmin, isOrgUser, can],
  );

  if (sections.length === 0) return null;

  return (
    <section aria-label="設定・マスタ" className="glass-card space-y-5 p-5">
      <div>
        <h2 className="text-[15px] font-semibold text-primary">設定・マスタ</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          店舗・業務・連携などの設定はここに集約しました。よく使う項目はカードから開けます。
        </p>
      </div>

      {sections.map(({ section, items }) => (
        <div key={section} className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{section}</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border-subtle px-3 py-2.5 text-[13px] font-medium text-secondary transition-colors hover:border-border-default hover:bg-surface-hover hover:text-primary"
                >
                  <span className="text-muted">{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
