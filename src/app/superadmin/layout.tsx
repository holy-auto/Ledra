import Link from "next/link";
import { requireSuperAdminSession } from "./_auth";

const navItems = [
  { href: "/superadmin", label: "ダッシュボード" },
  { href: "/superadmin/tenants", label: "テナント一覧" },
  { href: "/market/admin", label: "HolyMarket 管理" },
];

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireSuperAdminSession();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-bold text-base tracking-tight">CARTRUST</span>
            <span className="text-[10px] font-semibold tracking-widest bg-white/10 px-2 py-0.5 rounded-full">
              SUPER ADMIN
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 text-sm text-neutral-300 hover:text-white hover:bg-white/10 rounded-md transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="text-xs text-neutral-400">{email}</div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
