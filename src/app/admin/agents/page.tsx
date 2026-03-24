import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const AgentReviewClient = dynamic(() => import("./AgentReviewClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export default async function AdminAgentsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agents");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="AGENTS"
        title="代理店管理"
        description="代理店パートナーの一覧・審査・コミッション設定"
      />
      <AgentReviewClient />
    </main>
  );
}
