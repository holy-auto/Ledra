import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import OutsourcedWorkClient from "./OutsourcedWorkClient";

/**
 * 支給部品を伴う外注施工の作業依頼（外注施工履歴）。
 * 発注元としても施工事業者としても同じ画面で、依頼ごとの立場に応じて起こせる操作が変わる。
 */
export const dynamic = "force-dynamic";

export default async function OutsourcedWorkPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/outsourced-work");
  return <OutsourcedWorkClient tenantId={caller.tenantId} />;
}
