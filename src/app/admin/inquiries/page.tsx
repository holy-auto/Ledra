import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import InquiriesClient from "./InquiriesClient";

export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/inquiries");

  return <InquiriesClient />;
}
