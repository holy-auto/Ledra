import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { getPricingElasticity, type PricingWindow } from "@/lib/analytics/pricing";
import PricingElasticityClient from "./PricingElasticityClient";

export const dynamic = "force-dynamic";

const VALID: ReadonlySet<PricingWindow> = new Set(["90d", "180d", "365d", "730d"] as const);

function parseWindow(raw: string | string[] | undefined): PricingWindow {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && (VALID as Set<string>).has(v) ? (v as PricingWindow) : "365d";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingAnalyticsPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/analytics/pricing");
  if (!hasMinRole(caller.role, "admin")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-700">この機能には管理者権限が必要です。</main>
    );
  }

  const sp = (await searchParams) ?? {};
  const window = parseWindow(sp.window);

  const initial = await getPricingElasticity({ tenantId: caller.tenantId, window });

  return <PricingElasticityClient initial={initial} />;
}
