import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const MaterialsManager = dynamic(() => import("./MaterialsManager"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export default async function AdminAgentMaterialsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agents/materials");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="AGENT MATERIALS"
        title="代理店向け資料管理"
        description="代理店パートナーに共有する営業資料・契約書・マニュアル等をアップロード・管理します。"
      />
      <MaterialsManager />
    </main>
  );
}
