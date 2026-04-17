import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const AdminNotificationsClient = dynamic(() => import("./AdminNotificationsClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />,
});

export default async function AdminAgentNotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agent-notifications");

  return (
    <main className="space-y-6">
      <PageHeader tag="NOTIFICATIONS" title="通知管理" description="代理店への通知送信・管理" />
      <AdminNotificationsClient />
    </main>
  );
}
