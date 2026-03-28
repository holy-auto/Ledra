import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import PlatformOperationsClient from "./PlatformOperationsClient";

export const dynamic = "force-dynamic";

export default async function PlatformOperationsPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/operations");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="プラットフォーム運営ダッシュボード"
        description="システム監視・テナント管理・セキュリティ監査・遠隔操作を一元管理"
      />
      <PlatformOperationsClient />
    </div>
  );
}
