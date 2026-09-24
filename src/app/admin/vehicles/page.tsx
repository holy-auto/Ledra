import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import VehicleListClient, { type VehicleListRow } from "./VehicleListClient";

export const dynamic = "force-dynamic";

export default async function AdminVehicleListPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/vehicles");

  // 複数テナント所属時は選択中テナント (active_tenant_id) を使う
  const caller = await resolveCallerWithRole(supabase);
  const membership = caller ? { tenant_id: caller.tenantId } : null;

  if (!membership?.tenant_id) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted">tenant_memberships が見つかりません。</p>
      </div>
    );
  }

  const {
    data: vehicles,
    error,
    count,
  } = await supabase
    .from("vehicles")
    .select(
      "id,maker,model,year,plate_display,vin_code,notes,created_at,updated_at,customer_id,customer:customers(id,name)",
      { count: "exact" },
    )
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<
      Array<{
        id: string;
        maker: string | null;
        model: string | null;
        year: number | null;
        plate_display: string | null;
        vin_code: string | null;
        notes: string | null;
        created_at: string | null;
        updated_at: string | null;
        customer_id: string | null;
        customer: { id: string; name: string | null } | null;
      }>
    >();

  if (error) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-red-500">車両データ読み込みエラー: {error.message}</p>
      </div>
    );
  }

  const rows = (vehicles ?? []) as VehicleListRow[];
  return <VehicleListClient rows={rows} total={count ?? rows.length} />;
}
