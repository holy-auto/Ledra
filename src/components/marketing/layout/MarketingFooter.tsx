import Link from "next/link";
import { siteConfig, footerNavGroups } from "@/lib/marketing/config";

export function MarketingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-16">
        {/* 上段: ロゴ + ナビゲーション */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {/* ブランド */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-zinc-900"
            >
              {siteConfig.siteName}
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              施工証明をデジタルで。
              <br />
              施工店と保険会社をつなぐ
              <br />
              SaaSプラットフォーム。
            </p>
          </div>

          {/* ナビリンクグループ */}
          {footerNavGroups.map((group) => (
            <div key={group.heading}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {group.heading}
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 下段: コピーライト */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-zinc-200 pt-8 text-sm text-zinc-500 sm:flex-row sm:items-center">
          <p>© {currentYear} {siteConfig.siteName}. All rights reserved.</p>
          <a
            href={`mailto:${siteConfig.contactEmail}`}
            className="transition-colors hover:text-zinc-600"
          >
            {siteConfig.contactEmail}
          </a>
        </div>
      </div>
    </footer>
  );
}
