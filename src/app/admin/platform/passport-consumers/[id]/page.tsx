import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import ConsumerDetailClient from "./ConsumerDetailClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConsumerDetailPage({ params }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  const { id } = await params;
  if (!caller) redirect(`/login?next=/admin/platform/passport-consumers/${id}`);
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/platform/passport-consumers" className="text-xs text-muted hover:underline">
          ← 一覧に戻る
        </Link>
      </div>
      <PageHeader
        tag="運営専用"
        title="Passport API 利用者 詳細"
        description="ステータス・クォータの編集、API キーの発行・失効、直近 30 日の利用状況を確認できます。"
      />
      <ConsumerDetailClient consumerId={id} />
    </div>
  );
}
