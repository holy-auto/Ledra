import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import CustomerInquiriesClient from "./CustomerInquiriesClient";

export const dynamic = "force-dynamic";

export default async function CustomerInquiriesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/customer-inquiries");

  return <CustomerInquiriesClient />;
}
