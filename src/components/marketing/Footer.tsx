import Link from "next/link";
import { Container } from "./Container";
import { NewsletterForm } from "./NewsletterForm";
import { footerNavGroups } from "@/lib/marketing/config";

const portalLinks = {
  heading: "ポータル",
  links: [
    { label: "施工店ログイン", href: "/login" },
    { label: "代理店ポータル", href: "/agent/login" },
    { label: "保険会社ポータル", href: "/insurer/login" },
    { label: "新規登録（施工店）", href: "/signup" },
    { label: "新規登録（保険会社）", href: "/join" },
  ],
};

const footerGroups = [portalLinks, ...footerNavGroups];

export function Footer() {
  return (
    <footer className="bg-[#0f1117] text-white">
      <Container>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-10 md:gap-12 py-20 md:py-24">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Ledra
            </Link>
            <p className="mt-4 text-sm text-white/75 leading-relaxed max-w-[240px]">
              記録を、業界の共通言語にする。
              <br />
              WEB施工証明書SaaS — Ledra。
            </p>
            <div className="mt-8 max-w-[280px]">
              <NewsletterForm />
            </div>
          </div>

          {/* Link columns */}
          {footerGroups.map((group) => (
            <div key={group.heading}>
              <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest mb-5">{group.heading}</h3>
              <ul className="space-y-3.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-white/80 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="py-6 border-t border-white/[0.06]">
          <p className="text-xs text-white/70">&copy; {new Date().getFullYear()} Ledra. All rights reserved.</p>
        </div>
      </Container>
    </footer>
  );
}
