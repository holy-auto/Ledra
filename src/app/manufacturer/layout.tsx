"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ManufacturerRouteGuard from "./ManufacturerRouteGuard";
import NotificationBell from "@/components/ui/NotificationBell";

const AUTH_ROUTES = ["/manufacturer/login"];

const NAV = [
  { href: "/manufacturer", label: "ダッシュボード", exact: true },
  { href: "/manufacturer/field-test", label: "実証テスト" },
  { href: "/manufacturer/tenants", label: "認定施工店" },
  { href: "/manufacturer/certificates", label: "発行履歴" },
  { href: "/manufacturer/quality", label: "品質チェック" },
  { href: "/manufacturer/templates", label: "デザインテンプレート" },
  { href: "/manufacturer/audit", label: "操作ログ" },
];

// admin ロールのみに表示するナビ。viewer には出さず、URL直打ち時も
// ページ側で /manufacturer にリダイレクトされる。
const ADMIN_NAV = [{ href: "/manufacturer/members", label: "ポータルメンバー" }];

function Sidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/manufacturer/me", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setIsAdmin(json.role === "admin");
      } catch {
        /* ignore — defaults to hiding admin nav */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  const logout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    window.location.replace("/manufacturer/login");
  };
  return (
    <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:flex-col lg:border-r lg:border-border-subtle lg:bg-surface">
      <div className="flex h-14 items-center gap-2.5 border-b border-border-subtle px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-700 to-violet-500">
          <span className="text-xs font-bold text-white">メ</span>
        </div>
        <Link href="/manufacturer" className="text-[13px] font-semibold tracking-wide text-primary">
          メーカーポータル
        </Link>
        <div className="ml-auto">
          <NotificationBell basePath="/api/manufacturer/notifications" />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {items.map((item) => {
          const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                active ? "bg-accent-dim text-accent" : "text-secondary hover:bg-surface-hover hover:text-primary"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={logout}
        className="m-3 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-hover hover:text-primary"
      >
        ログアウト
      </button>
    </aside>
  );
}

export default function ManufacturerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuthPage) return <>{children}</>;

  return (
    <ManufacturerRouteGuard>
      <div className="min-h-screen bg-[var(--bg-inset)]">
        <Sidebar />
        <main className="lg:ml-60 p-6">{children}</main>
      </div>
    </ManufacturerRouteGuard>
  );
}
