import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { getSalesBreakdown, type SalesWindow } from "@/lib/analytics/salesBreakdown";
import SalesBreakdownClient from "./SalesBreakdownClient";

export const dynamic = "force-dynamic";

const VALID: ReadonlySet<SalesWindow> = new Set(["3m", "6m", "12m", "24m"] as const);

function parseWindow(raw: string | string[] | undefined): SalesWindow {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && (VALID as Set<string>).has(v) ? (v as SalesWindow) : "12m";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SalesAnalyticsPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/analytics/sales");
  if (!hasMinRole(caller.role, "admin")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-700">この機能には管理者権限が必要です。</main>
    );
  }

  const sp = (await searchParams) ?? {};
  const window = parseWindow(sp.window);

  const initial = await getSalesBreakdown({ tenantId: caller.tenantId, window });

  return <SalesBreakdownClient initial={initial} />;
}
