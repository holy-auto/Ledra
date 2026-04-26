"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Container } from "./Container";
import { MobileMenu } from "./MobileMenu";

const navItems: { label: string; href: string }[] = [
  { label: "機能", href: "/features" },
  { label: "BtoB発注", href: "/for-btob" },
  { label: "料金", href: "/pricing" },
  { label: "セキュリティ", href: "/security" },
  { label: "サポート", href: "/support" },
  { label: "FAQ", href: "/faq" },
];

const portalItems = [
  { label: "施工店ログイン", href: "/login", description: "証明書の作成・管理" },
  { label: "代理店ポータル", href: "/agent/login", description: "紹介・コミッション管理" },
  { label: "保険会社ポータル", href: "/insurer/login", description: "証明書の確認・査定" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPortalOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pathname = usePathname();
  const handleAnchorClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      const hash = href.split("#")[1];
      if (!hash) return;
      // If already on the homepage, smooth-scroll instead of navigating
      if (pathname === "/") {
        e.preventDefault();
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      // If on another page, Link will navigate to /#hash and the browser scrolls natively
    },
    [pathname],
  );

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#060a12]/95 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)]"
          : "bg-[#060a12]/70 backdrop-blur-xl border-b border-white/[0.04]"
      }`}
    >
      <Container className="flex items-center justify-between h-[72px]">
        <Link
          href="/"
          className="text-[1.375rem] font-bold tracking-tight text-white hover:opacity-80 transition-opacity"
        >
          Ledra
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => handleAnchorClick(e, item.href)}
              className="text-sm text-white/60 hover:text-white px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          {/* Portal login dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setPortalOpen(!portalOpen)}
              className="text-sm text-white/60 hover:text-white px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors inline-flex items-center gap-1.5"
            >
              ログイン
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className={`w-3 h-3 transition-transform duration-200 ${portalOpen ? "rotate-180" : ""}`}
              >
                <path d="M3 4.5l3 3 3-3" />
              </svg>
            </button>

            {portalOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-[#0f1117] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden animate-[hero-fade-in_0.15s_ease-out]">
                <div className="p-1.5">
                  {portalItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex flex-col gap-0.5 px-3.5 py-3 rounded-lg hover:bg-white/[0.06] transition-colors"
                      onClick={() => setPortalOpen(false)}
                    >
                      <span className="text-sm font-medium text-white">{item.label}</span>
                      <span className="text-xs text-white/40">{item.description}</span>
                    </Link>
                  ))}
                </div>
                <div className="border-t border-white/[0.06] p-1.5">
                  <Link
                    href="/signup"
                    className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium text-blue-400 hover:bg-blue-500/[0.08] transition-colors"
                    onClick={() => setPortalOpen(false)}
                  >
                    新規登録（施工店）
                  </Link>
                </div>
              </div>
            )}
          </div>

          <Link
            href="/signup"
            className="text-sm font-medium text-[#060a12] bg-white hover:bg-gray-100 px-4 py-2 rounded-lg transition-colors"
          >
            無料で試す
          </Link>
        </div>

        {/* Mobile menu */}
        <MobileMenu navItems={navItems} portalItems={portalItems} />
      </Container>
    </header>
  );
}
