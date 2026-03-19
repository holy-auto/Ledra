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

        {/* Pre-launch: nav hidden */}
      </Container>
    </header>
  );
}
