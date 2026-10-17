import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import WorkshopProfilesClient from "./WorkshopProfilesClient";

export const dynamic = "force-dynamic";

export default async function PlatformWorkshopProfilesPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/workshop-profiles");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="施工店の設備・資格の検証"
        description="施工店が登録した許認可・整備士資格・設備を確かめ、「検証済み」を付けます。検証済みはメーカー画面に出ます。付けられるのは運営だけで、施工店が中身を書き換えると自動で外れます。"
      />
      <WorkshopProfilesClient />
    </div>
  );
}
