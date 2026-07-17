import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import StoreUsageClient from "./StoreUsageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "店舗利用状況 | Ledra 運営",
  description: "店舗別の月間操作回数・予約/作業記録/請求の累計・機能別利用率を横断確認します。",
};

export default async function StoreUsagePage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/store-usage");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="店舗利用状況"
        description="店舗ごとの月間操作回数・予約/作業記録/請求の累計件数・機能別の利用率を確認します。"
      />
      <StoreUsageClient />
    </div>
  );
}
