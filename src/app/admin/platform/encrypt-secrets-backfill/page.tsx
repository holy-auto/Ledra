import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import EncryptSecretsBackfillClient from "./EncryptSecretsBackfillClient";

export const dynamic = "force-dynamic";

export default async function EncryptSecretsBackfillPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/encrypt-secrets-backfill");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="機微情報バックフィル"
        description="LINE / Square の DB 平文列を暗号化列にバックフィルします (idempotent)"
      />
      <EncryptSecretsBackfillClient />
    </div>
  );
}
