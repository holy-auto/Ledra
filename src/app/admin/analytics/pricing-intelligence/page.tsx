import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { buildPricingContext } from "@/lib/ai/pricingIntelligence";
import PricingIntelligenceClient from "./PricingIntelligenceClient";

export const dynamic = "force-dynamic";

export default async function PricingIntelligencePage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/analytics/pricing-intelligence");
  if (!hasMinRole(caller.role, "admin")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-700">この機能には管理者権限が必要です。</main>
    );
  }

  const initial = await buildPricingContext(caller.tenantId);

  return <PricingIntelligenceClient initial={initial} />;
}
