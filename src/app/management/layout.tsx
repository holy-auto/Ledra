import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const navItems = [
  { label: "ダッシュボード", href: "/management" },
  { label: "テナント一覧", href: "/management/tenants" },
  { label: "証明書検索", href: "/management/certificates" },
  { label: "課金状況", href: "/management/billing" },
];

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: userRes, error: authError } = await supabase.auth.getUser();
  console.log("[ManagementLayout] auth:", { user: userRes?.user?.id, email: userRes?.user?.email, authError });
  if (!userRes?.user) notFound();

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "super_admin")
    .limit(1)
    .maybeSingle();

  console.log("[ManagementLayout] membership:", { membership, membershipError });
  if (!membership) notFound();

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Top nav */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold tracking-[0.18em] text-neutral-900">CARTRUST MANAGEMENT</span>
            <nav className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
          >
            テナント管理へ
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        {children}
      </main>
    </div>
  );
}
