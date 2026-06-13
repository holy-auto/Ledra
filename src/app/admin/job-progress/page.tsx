import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import JobProgressClient from "./JobProgressClient";

export const dynamic = "force-dynamic";

export default async function JobProgressPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/job-progress");

  return <JobProgressClient />;
}
