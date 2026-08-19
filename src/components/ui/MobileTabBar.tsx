"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { NAV_GROUPS, type NavItem } from "@/components/ui/adminNav";

/**
 * モバイル専用の下部タブバー。どの画面でも主要導線（ホーム/作業/車両/証明書/その他）へ
 * 1タップで戻れるよう常時表示する。ラベル・アイコン・権限は Sidebar の NAV 定義
 * (NAV_GROUPS) を単一の出典として再利用し、タブバー用に短いラベルだけ上書きする。
 * lg 以上ではサイドバーがあるため非表示（lg:hidden）。
 *
 * v2.0 §2 / 製品不変条件 #2: タブ構成は WEB_TABS（navigation/tabs.ts）を単一定義源とする。
 */
import { WEB_TABS } from "@/lib/navigation/tabs";

const TAB_HREFS = new Set(WEB_TABS.map((t) => t.href));
const TABS: { href: string; label: string }[] = WEB_TABS.map((t) => ({ href: t.href, label: t.label }));

export default function MobileTabBar() {
  const pathname = usePathname();
  const { can, role, loading } = useCurrentRole();

  // href → NavItem（アイコン・権限・exact をタブに流用）。
  const navByHref = useMemo(() => {
    const m = new Map<string, NavItem>();
    for (const g of NAV_GROUPS) for (const it of g.items) if (!m.has(it.href)) m.set(it.href, it);
    return m;
  }, []);

  const tabs = useMemo(
    () =>
      TABS.map((t) => ({ ...t, nav: navByHref.get(t.href) }))
        .filter((t): t is typeof t & { nav: NavItem } => !!t.nav)
        // 権限ゲート（Sidebar と同じく role 確定前は楽観的に表示）。
        // ponytail: 正準タブ（WEB_TABS 由来）は構造的導線なので権限で消さない。
        // 中のページは個別にゲートされる。消すと staff が「その他」に辿り着けない。
        .filter(
          (t) =>
            TAB_HREFS.has(t.href) || !(t.nav.requiredPermission && !loading && role && !can(t.nav.requiredPermission)),
        ),
    [navByHref, can, role, loading],
  );

  // z-20: 本文より前・各種オーバーレイより後ろ。サイドバードロワー(overlay z-30 / aside z-40)や
  // モーダル(z-50)が開いたときはそれらの下に隠れ、フッター等を覆わない。
  return (
    <nav
      aria-label="タブバー"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border-default bg-[var(--bg-surface-solid)] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map((t) => {
        const active = t.nav.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
              active ? "text-accent" : "text-muted hover:text-primary"
            }`}
          >
            <span className="[&_svg]:h-[22px] [&_svg]:w-[22px]">{t.nav.icon}</span>
            <span className="max-w-full truncate">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
