import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import PageHeader from "@/components/ui/PageHeader";
import FieldTestProjectsClient from "./FieldTestProjectsClient";

export const dynamic = "force-dynamic";

export default async function FieldTestPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) redirect("/manufacturer/login");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="FIELD TESTING"
        title="実証テスト"
        description="製品の実証テストプロジェクトを管理し、施工店の募集から品質検証までの全工程を統括できます。"
      />
      <FieldTestProjectsClient isAdmin={caller.role === "admin"} />
    </div>
  );
}
