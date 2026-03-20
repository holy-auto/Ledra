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

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/contact"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            お問い合わせ
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium px-5 py-2 rounded-lg bg-white text-[#060a12] hover:bg-gray-100 transition-colors"
          >
            無料で始める
          </Link>
        </div>

        {/* Mobile menu */}
        <MobileMenu navItems={navItems} />
      </Container>
    </header>
  );
}
