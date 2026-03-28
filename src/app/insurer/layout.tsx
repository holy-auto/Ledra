"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const AUTH_ROUTES = ["/insurer/login", "/insurer/forgot-password", "/insurer/reset-password"];

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
        {title}
      </div>
      {children}
    </div>
  );
}

function InsurerSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-neutral-200 bg-white lg:block overflow-y-auto">
      <div className="flex h-14 items-center border-b border-neutral-200 px-4">
        <Link
          href="/insurer"
          className="text-sm font-bold tracking-wide text-neutral-900"
        >
          保険会社ポータル
        </Link>
      </div>
      <nav className="pb-6">
        <NavSection title="メイン">
          <NavItem href="/insurer" label="ダッシュボード" />
          <NavItem href="/insurer/notifications" label="通知センター" />
        </NavSection>

        <NavSection title="検索">
          <NavItem href="/insurer/search" label="証明書検索" />
          <NavItem href="/insurer/vehicles" label="車両検索" />
          <NavItem href="/insurer/stores" label="店舗検索" />
          <NavItem href="/insurer/watchlist" label="ウォッチリスト" />
        </NavSection>

        <NavSection title="案件">
          <NavItem href="/insurer/cases" label="案件管理" />
          <NavItem href="/insurer/templates" label="テンプレート" />
          <NavItem href="/insurer/rules" label="自動振り分け" />
          <NavItem href="/insurer/sla" label="SLA管理" />
        </NavSection>

        <NavSection title="分析">
          <NavItem href="/insurer/analytics" label="検索分析" />
          <NavItem href="/insurer/reports" label="案件レポート" />
          <NavItem href="/insurer/tenants" label="テナント統計" />
        </NavSection>

        <NavSection title="管理">
          <NavItem href="/insurer/users" label="ユーザー管理" />
          <NavItem href="/insurer/audit" label="操作ログ" />
          <NavItem href="/insurer/security" label="セキュリティ" />
          <NavItem href="/insurer/settings" label="通知設定" />
          <NavItem href="/insurer/account" label="アカウント" />
        </NavSection>
      </nav>
    </aside>
  );
}

function NavItem({
  href,
  label,
  badge,
}: {
  href: string;
  label: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
    >
      {label}
      {badge && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          {badge}
        </span>
      )}
    </Link>
  );
}

const MOBILE_LINKS = [
  { href: "/insurer", label: "ダッシュボード" },
  { href: "/insurer/notifications", label: "通知センター" },
  { href: "/insurer/search", label: "証明書検索" },
  { href: "/insurer/vehicles", label: "車両検索" },
  { href: "/insurer/stores", label: "店舗検索" },
  { href: "/insurer/watchlist", label: "ウォッチリスト" },
  { href: "/insurer/cases", label: "案件管理" },
  { href: "/insurer/templates", label: "テンプレート" },
  { href: "/insurer/rules", label: "自動振り分け" },
  { href: "/insurer/sla", label: "SLA管理" },
  { href: "/insurer/analytics", label: "検索分析" },
  { href: "/insurer/reports", label: "案件レポート" },
  { href: "/insurer/tenants", label: "テナント統計" },
  { href: "/insurer/users", label: "ユーザー管理" },
  { href: "/insurer/audit", label: "操作ログ" },
  { href: "/insurer/security", label: "セキュリティ" },
  { href: "/insurer/settings", label: "通知設定" },
  { href: "/insurer/account", label: "アカウント" },
];

function MobileMenu() {
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700">
        メニュー
      </summary>
      <div className="absolute right-0 top-full mt-1 w-48 max-h-[70vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
        {MOBILE_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export default function InsurerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <InsurerSidebar />
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:hidden">
        <Link
          href="/insurer"
          className="text-sm font-bold tracking-wide text-neutral-900"
        >
          保険会社ポータル
        </Link>
        <MobileMenu />
      </header>
      <main className="lg:pl-56">{children}</main>
    </div>
  );
}
