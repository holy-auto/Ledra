import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import NewVehicleForm from "./NewVehicleForm";

export const dynamic = "force-dynamic";

export default async function NewVehiclePage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/market-vehicles/new");

  return <NewVehicleForm />;
}
