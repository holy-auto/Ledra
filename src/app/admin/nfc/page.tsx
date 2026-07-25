import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import NfcClient from "./NfcClient";

export const dynamic = "force-dynamic";

export default async function AdminNfcPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/nfc");

  const tenantId = caller.tenantId;
  const isAdmin = caller.role === "admin" || caller.role === "owner";

  const { data: rows, error } = await supabase
    .from("nfc_tags")
    .select("id,tag_code,uid,vehicle_id,certificate_id,status,written_at,attached_at,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return <div className="text-sm text-red-500">エラー: {error.message}</div>;
  }

  const nfcRows = (rows ?? []) as Array<{
    id: string;
    tag_code: string | null;
    uid: string | null;
    vehicle_id: string | null;
    certificate_id: string | null;
    status: string | null;
    written_at: string | null;
    attached_at: string | null;
    created_at: string | null;
  }>;

  const vehicleIds = [...new Set(nfcRows.map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const certIds = [...new Set(nfcRows.map((r) => r.certificate_id).filter(Boolean))] as string[];

  const vehicleMap: Record<string, any> = {};
  const certMap: Record<string, any> = {};

  if (vehicleIds.length > 0) {
    const { data: vs } = await supabase
      .from("vehicles")
      .select("id,maker,model,year,plate_display")
      .in("id", vehicleIds);
    for (const v of vs ?? []) vehicleMap[v.id] = v;
  }
  if (certIds.length > 0) {
    const { data: cs } = await supabase.from("certificates").select("id,public_id,status").in("id", certIds);
    for (const c of cs ?? []) certMap[c.id] = c;
  }

  return <NfcClient initialRows={nfcRows} vehicleMap={vehicleMap} certMap={certMap} isAdmin={isAdmin} />;
}
