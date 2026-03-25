import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const AdminInvoicesClient = dynamic(() => import("./AdminInvoicesClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export default async function AdminAgentInvoicesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agent-invoices");

  return (
    <main className="space-y-6">
      <PageHeader tag="INVOICES" title="代理店請求書" description="代理店向け請求書の管理・発行" />
      <AdminInvoicesClient />
    </main>
  );
}
