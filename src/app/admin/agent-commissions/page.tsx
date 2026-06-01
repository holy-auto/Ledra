import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const AdminCommissionsClient = dynamic(() => import("./AdminCommissionsClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />,
});

export default async function AdminAgentCommissionsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agent-commissions");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="COMMISSIONS"
        title="代理店コミッション"
        description="紹介経由の有料化で自動計上されたコミッションの承認・送金（Stripe Connect）"
      />
      <AdminCommissionsClient />
    </main>
  );
}
