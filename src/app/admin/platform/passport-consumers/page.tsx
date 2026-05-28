import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import PassportConsumersClient from "./PassportConsumersClient";

export const dynamic = "force-dynamic";

export default async function PassportConsumersPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/passport-consumers");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="Passport API 利用者"
        description="第三者 (中古車店・買取・査定・保険など) に発行する Passport 検証 API のコンシューマ管理。キー発行は次画面、ステータス変更・クォータ調整はここから。"
      />
      <PassportConsumersClient />
    </div>
  );
}
