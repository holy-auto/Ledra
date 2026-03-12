import Link from "next/link";
import { Container } from "./Container";
import { MobileMenu } from "./MobileMenu";

const navItems = [
  { label: "料金", href: "/pricing" },
  { label: "施工店の方", href: "/for-shops" },
  { label: "保険会社の方", href: "/for-insurers" },
  { label: "FAQ", href: "/faq" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/[0.04]">
      <Container className="flex items-center justify-between h-[72px]">
        <Link
          href="/"
          className="text-[1.375rem] font-bold tracking-tight text-heading"
        >
          CARTRUST
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-10">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[0.875rem] font-medium text-muted hover:text-heading transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-[0.875rem] font-medium text-muted hover:text-heading transition-colors"
          >
            ログイン
          </Link>
          <Link
            href="/contact"
            className="bg-heading text-white text-[0.875rem] font-medium px-5 py-2.5 rounded-lg hover:bg-heading/90 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.1)]"
          >
            お問い合わせ
          </Link>
        </div>

        {/* Mobile Menu */}
        <MobileMenu navItems={navItems} />
      </Container>
    </header>
  );
}
