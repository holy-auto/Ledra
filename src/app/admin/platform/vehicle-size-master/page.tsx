import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import VehicleSizeMasterClient from "./VehicleSizeMasterClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "車種サイズマスタ | Ledra 運営",
  description: "全テナント共有の車種サイズマスタ (メーカー・車種→サイズ区分) にCSVで車種を一括登録します。",
};

export default async function VehicleSizeMasterPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/vehicle-size-master");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="車種サイズマスタ"
        description="全テナント共有の車種マスタ。CSVで車種を一括登録・更新します。サイズ区分(SS〜XL)は寸法から自動決定します。"
      />
      <VehicleSizeMasterClient />
    </div>
  );
}
