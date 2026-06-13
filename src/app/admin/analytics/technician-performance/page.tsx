import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import TechnicianPerformanceClient from "./TechnicianPerformanceClient";

export const dynamic = "force-dynamic";

export default async function TechnicianPerformancePage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/analytics/technician-performance");
  if (!hasMinRole(caller.role, "admin")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-secondary">この機能には管理者権限が必要です。</main>
    );
  }

  return <TechnicianPerformanceClient />;
}
