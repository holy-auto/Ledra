import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import InsurerReviewClient from "./InsurerReviewClient";

export default async function AdminInsurersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/insurers");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="INSURERS"
        title="保険会社管理"
        description="加盟保険会社の一覧・審査・プラン管理"
      />
      <InsurerReviewClient />
    </main>
  );
}
