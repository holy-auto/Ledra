import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import MarketVehiclesClient from "./MarketVehiclesClient";

export const dynamic = "force-dynamic";

export default async function MarketVehiclesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/market-vehicles");

  return <MarketVehiclesClient />;
}
