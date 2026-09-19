import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import PageHeader from "@/components/ui/PageHeader";
import NewProjectClient from "./NewProjectClient";

export const dynamic = "force-dynamic";

export default async function NewFieldTestProjectPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) redirect("/manufacturer/login");
  if (caller.role !== "admin") redirect("/manufacturer/field-test");

  return (
    <div className="space-y-6">
      <PageHeader tag="NEW PROJECT" title="新規プロジェクト作成" />
      <NewProjectClient />
    </div>
  );
}
