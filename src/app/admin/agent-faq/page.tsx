import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";

const AdminFaqClient = dynamic(() => import("./AdminFaqClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export default async function AdminFaqPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agent-faq");

  return (
    <main className="space-y-6">
      <PageHeader tag="FAQ" title="FAQ管理" description="代理店向けFAQ・ナレッジベースの管理" />
      <AdminFaqClient />
    </main>
  );
}
