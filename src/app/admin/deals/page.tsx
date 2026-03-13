import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import DealsClient from "./DealsClient";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/deals");

  return <DealsClient />;
}
