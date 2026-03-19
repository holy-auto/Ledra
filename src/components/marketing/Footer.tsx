import Link from "next/link";
import { Container } from "./Container";

// Pre-launch: only show contact link
const footerLinks = [
  {
    title: "サポート",
    links: [
      { label: "お問い合わせ", href: "/contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-[#0f1117] text-white">
      <Container>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-16 py-20 md:py-24">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-lg font-bold tracking-tight">
              CARTRUST
            </Link>
            <p className="mt-4 text-sm text-white/40 leading-relaxed max-w-[200px]">
              施工証明をデジタルで。
              <br />
              信頼を、かんたんに。
            </p>
          </div>

          {/* Link columns */}
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-5">
                {group.title}
              </h3>
              <ul className="space-y-3.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/60 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="py-6 border-t border-white/[0.06]">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} CARTRUST. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
