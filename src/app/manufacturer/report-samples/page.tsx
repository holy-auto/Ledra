import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import PageHeader from "@/components/ui/PageHeader";
import ReportSamplesClient from "./ReportSamplesClient";

export const dynamic = "force-dynamic";

export default async function ManufacturerReportSamplesPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) redirect("/manufacturer/login");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="REPORT SAMPLES"
        title="連携レポート見本"
        description="施工店の現場データと車両データを掛け合わせると、業種ごとにこのようなレポートを出せます。表示している数値はすべてダミーです。"
      />
      <ReportSamplesClient />
    </div>
  );
}
