"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import SidebarShell from "@/components/ui/SidebarShell";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/supply",
    label: "ダッシュボード",
    exact: true,
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
        />
      </svg>
    ),
  },
  {
    href: "/supply/products",
    label: "商材カタログ",
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
        />
      </svg>
    ),
  },
  {
    href: "/supply/integration",
    label: "API 連携設定",
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
        />
      </svg>
    ),
  },
  {
    href: "/supply/settings",
    label: "プロフィール",
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
        />
      </svg>
    ),
  },
];

export default function SupplySidebar() {
  const pathname = usePathname();
  const [partnerName, setPartnerName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/supply/profile", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!cancelled && j?.partner?.name) {
          setPartnerName(j.partner.name as string);
        }
      } catch {
        // silently ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderItem = (item: NavItem) => {
    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ${
            isActive ? "bg-accent-dim text-accent" : "text-secondary hover:bg-surface-hover hover:text-primary"
          }`}
        >
          <span className={isActive ? "text-accent" : "text-muted"}>{item.icon}</span>
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <SidebarShell>
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border-subtle px-5">
        <Image src="/icon-192.png" alt="Ledra" width={28} height={28} className="rounded-lg" />
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold tracking-wide text-primary">Ledra</span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted">Supply Portal</span>
        </div>
      </div>

      {/* Partner name */}
      {partnerName && (
        <div className="border-b border-border-subtle px-5 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-dim">
              <svg
                width="14"
                height="14"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-accent"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4"
                />
              </svg>
            </div>
            <span className="truncate text-[12px] font-medium text-secondary">{partnerName}</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">{NAV_ITEMS.map(renderItem)}</ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border-subtle px-3 py-3">
        <button
          type="button"
          onClick={async () => {
            try {
              const supabase = createClient();
              await supabase.auth.signOut();
              try {
                sessionStorage.clear();
              } catch {
                /* ignore */
              }
            } catch {
              /* ignore */
            }
            window.location.replace("/supply/login");
          }}
          className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] font-medium text-muted transition-all duration-150 hover:bg-surface-hover hover:text-primary"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            />
          </svg>
          ログアウト
        </button>
      </div>
    </SidebarShell>
  );
}
