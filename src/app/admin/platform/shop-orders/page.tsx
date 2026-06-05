import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import PlatformShopOrdersClient from "./PlatformShopOrdersClient";

export const dynamic = "force-dynamic";

export default async function PlatformShopOrdersPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/shop-orders");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="ショップ注文管理"
        description="全テナントのショップ注文の確認・出荷ステータス管理"
      />
      <PlatformShopOrdersClient />
    </div>
  );
}
