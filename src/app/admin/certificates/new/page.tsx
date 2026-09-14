import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import PageHeader from "@/components/ui/PageHeader";
import FirstUseInlineGuide from "@/components/ui/FirstUseInlineGuide";
import CertNewFormWrapper, { type Template, type TemplateSchema } from "./CertNewFormWrapper";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import type { PlanTier } from "@/lib/billing/planFeatures";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    tid?: string;
    vehicle_id?: string;
    customer_id?: string;
    reservation_id?: string;
    job_order_id?: string;
    category?: string;
    stage?: string;
  }>;
}) {
  const sp = await searchParams;
  const selectedTemplateId = sp.tid ?? "";
  const selectedCategory = sp.category ?? "";
  const defaultVehicleId = sp.vehicle_id ?? undefined;
  const defaultCustomerId = sp.customer_id ?? undefined;
  const defaultReservationId = sp.reservation_id ?? undefined;
  // 外注施工: 受発注画面 (/admin/orders/[id]) の「証明書を発行」導線から来た場合、
  // 発行する証明書をその発注に紐付ける（双方が同じ発注画面から成果物を辿れる）。
  const defaultJobOrderId = sp.job_order_id ?? undefined;
  // 案件ワークフローの「作業中の写真を撮る」導線から来た場合、アップロードする写真を
  // stage=in_progress として記録する（施工前/後のみだった撮影段階タグを作業中にも拡張）。
  const defaultPhotoStage = sp.stage === "in_progress" ? "in_progress" : undefined;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/certificates/new");
  const tenantId = caller.tenantId;

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
    size_class: string | null;
    customer_id: string | null;
    customer: { id: string; name: string } | null;
  };
  type CustomerRow = {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  const [
    { data: tenantRow },
    { data: templates, error: tplErr },
    { data: vehiclesRaw },
    { data: customersRaw },
    brandedTemplateResult,
  ] = await Promise.all([
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
      .select("id, maker, model, year, plate_display, vin_code, size_class, customer_id, customer:customers(id, name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<VehicleRow[]>(),
    supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<CustomerRow[]>(),
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

  // 案件の「部品交換あり」トグルが ON なら、整備内容セクションへの既定メモを用意する
  // (発行前に人が編集・削除できる下書きへの差し込みで、壁3は維持される)。
  let defaultPartsReplacedNote: string | undefined;
  if (defaultReservationId) {
    const { data: sourceReservation } = await supabase
      .from("reservations")
      .select("parts_replacement")
      .eq("id", defaultReservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (sourceReservation?.parts_replacement) {
      defaultPartsReplacedNote = "部品交換あり";
    }
  }

  const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;
  const planTier = normalizePlanTier(tenantRow?.plan_tier) as PlanTier;
  const defaultWarrantyExclusions = (tenantRow?.default_warranty_exclusions as string | null) ?? "";
  const hasBrandedTemplate = !!brandedTemplateResult[0].data && !!brandedTemplateResult[1].data;

  const list = templates ?? [];
  // tid 未指定なら category (大カテゴリー) 一致テンプレを優先。
  // 完全一致が無いカテゴリー (wrapping / window_film 等、専用テンプレ未シード) は
  // general テンプレへフォールバックし、無関係な先頭テンプレを開かないようにする。
  const categoryMatchId = selectedCategory
    ? (list.find((t) => (t.category ?? null) === selectedCategory)?.id ??
      list.find((t) => (t.category ?? null) === "general")?.id ??
      "")
    : "";
  const fallbackId = categoryMatchId || list[0]?.id || "";
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

      <FirstUseInlineGuide
        storageKey="certificates_new"
        title="証明書を発行するには"
        description="施工内容と写真を記録して、QRコード付きのデジタル証明書を発行します。"
        steps={[
          {
            title: "車両を選択",
            description: "登録済みの車両から選択するか、その場で新規追加できます。",
          },
          {
            title: "施工内容・写真を入力",
            description: "メニュー・コーティング剤・施工写真をアップロード。テンプレートで入力項目が変わります。",
          },
          {
            title: "発行 → 顧客に共有",
            description: "QRコードと公開URLが生成され、顧客にそのまま渡せます。",
          },
        ]}
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
        customers={customersRaw ?? []}
        defaultVehicleId={defaultVehicleId}
        defaultCustomerId={defaultCustomerId}
        defaultReservationId={defaultReservationId}
        defaultJobOrderId={defaultJobOrderId}
        defaultPartsReplacedNote={defaultPartsReplacedNote}
        defaultPhotoStage={defaultPhotoStage}
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
                : selected?.category === "accessory"
                  ? "accessory"
                  : undefined
        }
        defaultWarrantyExclusions={defaultWarrantyExclusions}
      />
    </div>
  );
}
