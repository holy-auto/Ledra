import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import PlatformTemplateOrdersClient from "./PlatformTemplateOrdersClient";

export const dynamic = "force-dynamic";

export default async function PlatformTemplateOrdersPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/template-orders");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader tag="運営専用" title="テンプレートオーダー管理" />
      <PlatformTemplateOrdersClient />
    </div>
  );
}
