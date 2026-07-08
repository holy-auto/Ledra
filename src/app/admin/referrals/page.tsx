import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import ReferralsClient, { type LeadRow } from "./ReferralsClient";

export const dynamic = "force-dynamic";

type ConsumerRow = {
  id: string;
  name: string;
};

export default async function ReferralsPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/referrals");
  if (!hasMinRole(caller.role, "admin")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-700">この機能には管理者権限が必要です。</main>
    );
  }

  // RLS により attributed_tenant_ids に caller のテナントが含まれる lead のみ
  // ヒットする。service-role でも明示フィルタで二重ガード。
  const admin = createServiceRoleAdmin("admin referral dashboard — tenant-attributed leads");
  const { data: rawLeads } = await admin
    .from("passport_referral_leads")
    .select(
      "id, vin_code_normalized, consumer_id, attributed_tenant_ids, status, sale_amount_jpy, referral_fee_jpy, partner_reference, queried_at, claimed_at",
    )
    .contains("attributed_tenant_ids", [caller.tenantId])
    .order("queried_at", { ascending: false })
    .limit(100);

  const leads = (rawLeads ?? []) as LeadRow[];

  // consumer name 解決 (PII ではないので表示可)
  const consumerIds = [...new Set(leads.map((l) => l.consumer_id))];
  let consumerNames: Record<string, string> = {};
  if (consumerIds.length > 0) {
    const { data: consumers } = await admin.from("passport_api_consumers").select("id, name").in("id", consumerIds);
    consumerNames = Object.fromEntries(((consumers ?? []) as ConsumerRow[]).map((c) => [c.id, c.name]));
  }

  return <ReferralsClient leads={leads} consumerNames={consumerNames} />;
}
