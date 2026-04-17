import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const AdminCampaignsClient = dynamic(() => import("./AdminCampaignsClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />,
});

export default async function AdminCampaignsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agent-campaigns");

  return (
    <main className="space-y-6">
      <PageHeader tag="CAMPAIGNS" title="キャンペーン管理" description="代理店向けキャンペーンの作成・管理" />
      <AdminCampaignsClient />
    </main>
  );
}
