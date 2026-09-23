import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import LaborHoursClient from "./LaborHoursClient";

export const revalidate = 0;

export default async function LaborHoursPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/labor-hours");
  return <LaborHoursClient />;
}
