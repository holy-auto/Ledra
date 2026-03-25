import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const AdminAnnouncementsClient = dynamic(() => import("./AdminAnnouncementsClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export default async function AdminAnnouncementsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agent-announcements");

  return (
    <main className="space-y-6">
      <PageHeader tag="ANNOUNCEMENTS" title="お知らせ管理" description="代理店向けお知らせの作成・編集" />
      <AdminAnnouncementsClient />
    </main>
  );
}
