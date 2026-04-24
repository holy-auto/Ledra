import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import CertNewFormWrapper, { type Template, type TemplateSchema } from "./CertNewFormWrapper";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import type { PlanTier } from "@/lib/billing/planFeatures";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tid?: string; vehicle_id?: string; customer_id?: string }>;
}) {
  const sp = await searchParams;
  const selectedTemplateId = sp.tid ?? "";
  const defaultVehicleId = sp.vehicle_id ?? undefined;
  const defaultCustomerId = sp.customer_id ?? undefined;

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/certificates/new");

  const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();

  if (!mem) return <div className="text-sm text-muted">tenant_memberships が見つかりません。</div>;
  const tenantId = mem.tenant_id as string;

  // tenantId 確定後は全クエリを並列実行
  // DB の schema_json は任意 JSON なので、TemplateSchema 互換として扱う
  // ため Template + category の shape にキャストする。
  type TemplateRow = Template & { category: string | null; created_at: string | null };
  type VehicleRow = {
    id: string;
    maker: string | null;
    model: string | null;
    year: number | null;
    plate_display: string | null;
    vin_code: string | null;
    customer_id: string | null;
    customer: { id: string; name: string } | null;
  };
  const [{ data: tenantRow }, { data: templates, error: tplErr }, { data: vehiclesRaw }, brandedTemplateResult] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("logo_asset_path, plan_tier, default_warranty_exclusions")
        .eq("id", tenantId)
        .single(),
      supabase
        .from("templates")
        .select("id, name, schema_json, category, created_at")
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        .order("created_at", { ascending: false })
        .returns<TemplateRow[]>(),
      supabase
        .from("vehicles")
        .select("id, maker, model, year, plate_display, vin_code, customer_id, customer:customers(id, name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(300)
        .returns<VehicleRow[]>(),
      // ブランドテンプレート確認（2クエリを並列）
      Promise.all([
        (async (): Promise<{ data: { status: string } | null }> => {
          try {
            return await supabase
              .from("tenant_option_subscriptions")
              .select("status")
              .eq("tenant_id", tenantId)
              .in("status", ["active", "past_due"])
              .limit(1)
              .maybeSingle();
          } catch {
            return { data: null };
          }
        })(),
        (async (): Promise<{ data: { id: string } | null }> => {
          try {
            return await supabase
              .from("tenant_template_configs")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("is_active", true)
              .limit(1)
              .maybeSingle();
          } catch {
            return { data: null };
          }
        })(),
      ]),
    ]);

  if (tplErr) return <div className="text-sm text-danger">テンプレ読み込みエラー: {tplErr.message}</div>;

  const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;
  const planTier = normalizePlanTier(tenantRow?.plan_tier) as PlanTier;
  const defaultWarrantyExclusions = (tenantRow?.default_warranty_exclusions as string | null) ?? "";
  const hasBrandedTemplate = !!brandedTemplateResult[0].data && !!brandedTemplateResult[1].data;

  const list = templates ?? [];
  const fallbackId = list[0]?.id ?? "";
  const tid = selectedTemplateId || fallbackId;
  const selected = list.find((t) => t.id === tid) ?? list[0] ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        tag="証明書発行"
        title="新規発行"
        description={tenantLogoPath ? undefined : "ロゴ未設定（設定 → ロゴ管理）"}
        actions={
          <div className="flex gap-3 items-center">
            <Link className="btn-ghost" href="/admin/certificates">
              一覧へ
            </Link>
          </div>
        }
      />

      {hasBrandedTemplate && (
        <div className="glass-card p-3 text-sm text-accent glow-cyan flex items-center justify-between">
          <span>ブランドテンプレートが適用中です。発行される証明書PDFに自動で反映されます。</span>
          <Link href="/admin/template-options" className="text-xs underline">
            設定を確認
          </Link>
        </div>
      )}

      <CertNewFormWrapper
        vehicles={vehiclesRaw ?? []}
        defaultVehicleId={defaultVehicleId}
        defaultCustomerId={defaultCustomerId}
        templates={list}
        selectedTemplate={selected}
        tenantLogoPath={tenantLogoPath}
        planTier={planTier}
        tid={tid}
        serviceType={
          selected?.category === "ppf"
            ? "ppf"
            : selected?.category === "maintenance"
              ? "maintenance"
              : selected?.category === "body_repair"
                ? "body_repair"
                : undefined
        }
        defaultWarrantyExclusions={defaultWarrantyExclusions}
      />
    </div>
  );
}
