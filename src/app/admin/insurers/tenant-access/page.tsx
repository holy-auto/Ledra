import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const TenantAccessClient = dynamic(() => import("./TenantAccessClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export default async function AdminTenantAccessPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/insurers/tenant-access");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="TENANT ACCESS"
        title="テナントアクセス管理"
        description="保険会社がアクセスできるテナント（施工店）の許可管理"
      />
      <TenantAccessClient />
    </main>
  );
}
