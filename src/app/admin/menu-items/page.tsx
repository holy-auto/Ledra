import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import MenuItemsClient from "./MenuItemsClient";

export const dynamic = "force-dynamic";

export default async function MenuItemsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/menu-items");
  return <MenuItemsClient />;
}
