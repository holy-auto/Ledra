import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import CertNewFormWrapper from "./CertNewFormWrapper";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tid?: string; vehicle_id?: string }>;
}) {
  const sp = await searchParams;
  const selectedTemplateId = sp.tid ?? "";
  const defaultVehicleId = sp.vehicle_id ?? "";

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/certificates/new");

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  if (!mem) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6">
        <p className="text-sm text-neutral-600">tenant_memberships が見つかりません。</p>
      </main>
    );
  }
  const tenantId = mem.tenant_id as string;

  // Fetch tenant info (logo + plan_tier)
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("logo_asset_path, plan_tier")
    .eq("id", tenantId)
    .single();
  const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;
  const planTier = normalizePlanTier((tenantRow as any)?.plan_tier);

  // Templates
  const { data: templates, error: tplErr } = await supabase
    .from("templates")
    .select("id,name,schema_json,created_at")
    .eq("scope", "tenant")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (tplErr) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6">
        <p className="text-sm text-red-700">テンプレ読み込みエラー: {tplErr.message}</p>
      </main>
    );
  }

  const list = (templates ?? []) as Array<{ id: string; name: string; schema_json: any; created_at: string }>;
  const fallbackId = list[0]?.id ?? "";
  const tid = selectedTemplateId || fallbackId;
  const selected = list.find((t) => t.id === tid) ?? list[0] ?? null;

  // Vehicles
  const { data: vehiclesData } = await supabase
    .from("vehicles")
    .select("id,maker,model,year,plate_display,customer_name")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  const vehicles = (vehiclesData ?? []) as Array<{
    id: string;
    maker: string | null;
    model: string | null;
    year: number | null;
    plate_display: string | null;
    customer_name: string | null;
  }>;

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              NEW CERTIFICATE
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                新規証明書を発行
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                車両を選択してテンプレートから施工証明書を発行します。
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Link
              href="/admin/certificates"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              証明書一覧
            </Link>
            <Link
              href="/admin/templates"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              テンプレ管理
            </Link>
          </div>
        </header>

        <CertNewFormWrapper
          vehicles={vehicles}
          defaultVehicleId={defaultVehicleId || undefined}
          templates={list.map((t) => ({ id: t.id, name: t.name, schema_json: t.schema_json }))}
          selectedTemplate={selected ? { id: selected.id, name: selected.name, schema_json: selected.schema_json } : null}
          tenantLogoPath={tenantLogoPath}
          planTier={planTier}
          tid={tid}
        />

      </div>
    </main>
  );
}
