import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import ProjectDetailClient from "./ProjectDetailClient";

export const dynamic = "force-dynamic";

export default async function FieldTestProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) redirect("/manufacturer/login");
  const { projectId } = await params;

  return <ProjectDetailClient projectId={projectId} isAdmin={caller.role === "admin"} />;
}
