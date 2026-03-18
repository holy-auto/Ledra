"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "./Container";
import { MobileMenu } from "./MobileMenu";

const navItems = [
  { label: "料金", href: "/pricing" },
  { label: "施工店の方", href: "/for-shops" },
  { label: "保険会社の方", href: "/for-insurers" },
  { label: "FAQ", href: "/faq" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
          CARTRUST
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-10">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[0.875rem] font-medium text-white/50 hover:text-white transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-blue-400 after:transition-all after:duration-300 hover:after:w-full"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-[0.875rem] font-medium text-white/50 hover:text-white transition-colors"
          >
            ログイン
          </Link>
          <Link
            href="/signup"
            className="bg-gradient-to-r from-blue-600 to-blue-500 text-white text-[0.875rem] font-medium px-5 py-2.5 rounded-lg hover:from-blue-500 hover:to-blue-400 transition-all shadow-[0_1px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_2px_20px_rgba(59,130,246,0.45)] hover:-translate-y-[0.5px]"
          >
            無料で始める
          </Link>
        </div>

        {/* Mobile Menu */}
        <MobileMenu navItems={navItems} />
      </Container>
    </header>
  );
}
