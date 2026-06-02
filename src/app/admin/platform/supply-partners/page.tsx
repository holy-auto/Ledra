import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import SupplyPartnersClient from "./SupplyPartnersClient";

export const dynamic = "force-dynamic";

export default async function PlatformSupplyPartnersPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/supply-partners");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="供給パートナー審査・信頼管理"
        description="代理店が登録した供給パートナー(卸元/メーカー)を審査し、AI 自動発注(auto-send)の信頼ゲート is_trusted を付与/解除します。信頼付与は運営(service-role)だけが可能で、パートナー自身は変更できません。"
      />
      <SupplyPartnersClient />
    </div>
  );
}
