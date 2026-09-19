import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import JobDetailClient from "./JobDetailClient";

export const dynamic = "force-dynamic";

export default async function FieldTestJobDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; jobId: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) redirect("/manufacturer/login");
  const { projectId, jobId } = await params;

  return <JobDetailClient projectId={projectId} jobId={jobId} isAdmin={caller.role === "admin"} />;
}
