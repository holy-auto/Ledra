import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

const AdminSupportClient = dynamic(() => import("./AdminSupportClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />,
});

export default async function AdminAgentSupportPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agent-support");

  return (
    <main className="space-y-6">
      <AdminSupportClient />
    </main>
  );
}
