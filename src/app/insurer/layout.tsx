"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const AUTH_ROUTES = ["/insurer/login", "/insurer/forgot-password", "/insurer/reset-password"];

function InsurerSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-neutral-200 bg-white lg:block">
      <div className="flex h-14 items-center border-b border-neutral-200 px-4">
        <Link
          href="/insurer"
          className="text-sm font-bold tracking-wide text-neutral-900"
        >
          INSURER PORTAL
        </Link>
      </div>
      <nav className="space-y-1 p-3">
        <NavItem href="/insurer" label="ダッシュボード" />
        <NavItem href="/insurer/search" label="証明書検索" />
        <NavItem href="/insurer/vehicles" label="車両検索" />
        <NavItem href="/insurer/account" label="アカウント" />
        <NavItem href="/insurer/cases" label="案件管理" />
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

function MobileMenu() {
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700">
        メニュー
      </summary>
      <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
        <Link
          href="/insurer"
          className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          ダッシュボード
        </Link>
        <Link
          href="/insurer/search"
          className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          証明書検索
        </Link>
        <Link
          href="/insurer/vehicles"
          className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          車両検索
        </Link>
        <Link
          href="/insurer/account"
          className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          アカウント
        </Link>
        <Link
          href="/insurer/cases"
          className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          案件管理
        </Link>
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
          INSURER PORTAL
        </Link>
        <MobileMenu />
      </header>
      <main className="lg:pl-56">{children}</main>
    </div>
  );
}
