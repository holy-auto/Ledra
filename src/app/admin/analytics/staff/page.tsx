import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { getStaffPerformance, type AnalyticsWindow } from "@/lib/analytics/staff";
import StaffPerformanceClient from "./StaffPerformanceClient";

export const dynamic = "force-dynamic";

const VALID: ReadonlySet<AnalyticsWindow> = new Set(["30d", "90d", "365d", "all"] as const);

function parseWindow(raw: string | string[] | undefined): AnalyticsWindow {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && (VALID as Set<string>).has(v) ? (v as AnalyticsWindow) : "30d";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StaffAnalyticsPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/analytics/staff");
  if (!hasMinRole(caller.role, "admin")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-700">この機能には管理者権限が必要です。</main>
    );
  }

  const sp = (await searchParams) ?? {};
  const window = parseWindow(sp.window);

  const initial = await getStaffPerformance({ tenantId: caller.tenantId, window });

  return <StaffPerformanceClient initial={initial} />;
}
