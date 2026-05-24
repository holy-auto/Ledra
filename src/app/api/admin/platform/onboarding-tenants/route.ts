import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform/onboarding-tenants
 *
 * テナント別に「オンボーディングのどの段階で止まっているか」を返す。
 * onboarding-funnel が集計値だけ返すのに対し、こちらは個別テナントの
 * 進捗を一覧化して「介入すべき施工店」を特定できるようにする。
 *
 * クエリ:
 *   range=7|30|90  — 直近 N 日にサインアップしたテナントに絞る
 *   stage=signed_up|shop_info|logo|first_record|first_cert|first_invoice
 *                  — その段階で止まっているテナントのみ返す (省略時は全件)
 */

type Stage = "signed_up" | "shop_info" | "logo" | "first_record" | "first_cert" | "first_invoice";

const STAGE_ORDER: Stage[] = ["signed_up", "shop_info", "logo", "first_record", "first_cert", "first_invoice"];

const STAGE_LABELS: Record<Stage, string> = {
  signed_up: "サインアップ",
  shop_info: "店舗連絡先入力",
  logo: "ロゴ設定",
  first_record: "顧客 or 車両 登録",
  first_cert: "初回証明書発行",
  first_invoice: "初回請求書作成",
};

type TenantRow = {
  tenant_id: string;
  tenant_name: string | null;
  plan_tier: string;
  created_at: string;
  days_since_signup: number;
  current_stage: Stage;
  current_stage_label: string;
  next_stage: Stage | null;
  next_stage_label: string | null;
};

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

function nDaysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const url = new URL(req.url);
    const rangeRaw = parseInt(url.searchParams.get("range") ?? "30", 10);
    const range: Range = RANGES.includes(rangeRaw as Range) ? (rangeRaw as Range) : 30;
    const stageFilter = url.searchParams.get("stage") as Stage | null;

    const admin = createPlatformScopedAdmin("platform onboarding-tenants — per-tenant onboarding stage breakdown");
    const sinceIso = nDaysAgoIso(range);
    const nowIso = new Date().toISOString();

    const { data: tenants } = await admin
      .from("tenants")
      .select("id, name, plan_tier, contact_email, contact_phone, address, logo_asset_path, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          name: string | null;
          plan_tier: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          address: string | null;
          logo_asset_path: string | null;
          created_at: string;
        }[]
      >();

    const list = tenants ?? [];
    if (list.length === 0) {
      return apiJson({ ok: true, range_days: range, total: 0, tenants: [] });
    }

    const tenantIds = list.map((t) => t.id);

    const [vehicleData, customerData, certData, invoiceData] = await Promise.all([
      admin.from("vehicles").select("tenant_id").in("tenant_id", tenantIds),
      admin.from("customers").select("tenant_id").in("tenant_id", tenantIds),
      admin.from("certificates").select("tenant_id").in("tenant_id", tenantIds),
      admin
        .from("documents")
        .select("tenant_id")
        .in("doc_type", ["invoice", "consolidated_invoice"])
        .in("tenant_id", tenantIds),
    ]);

    const tenantsWithVehicle = new Set((vehicleData.data ?? []).map((r) => r.tenant_id as string));
    const tenantsWithCustomer = new Set((customerData.data ?? []).map((r) => r.tenant_id as string));
    const tenantsWithCert = new Set((certData.data ?? []).map((r) => r.tenant_id as string));
    const tenantsWithInvoice = new Set((invoiceData.data ?? []).map((r) => r.tenant_id as string));

    const rows: TenantRow[] = list.map((t) => {
      const hasShopInfo = !!(t.contact_email || t.contact_phone || t.address);
      const hasLogo = !!t.logo_asset_path;
      const hasRecord = tenantsWithVehicle.has(t.id) || tenantsWithCustomer.has(t.id);
      const hasCert = tenantsWithCert.has(t.id);
      const hasInvoice = tenantsWithInvoice.has(t.id);

      // current_stage = 最後まで累積条件を満たした段階。first_invoice まで到達
      // した時点で完全オンボーディング済み。
      let currentStage: Stage = "signed_up";
      if (hasShopInfo) currentStage = "shop_info";
      if (hasShopInfo && hasLogo) currentStage = "logo";
      if (hasShopInfo && hasLogo && hasRecord) currentStage = "first_record";
      if (hasShopInfo && hasLogo && hasRecord && hasCert) currentStage = "first_cert";
      if (hasShopInfo && hasLogo && hasRecord && hasCert && hasInvoice) currentStage = "first_invoice";

      const idx = STAGE_ORDER.indexOf(currentStage);
      const nextStage = idx === STAGE_ORDER.length - 1 ? null : (STAGE_ORDER[idx + 1] ?? null);

      return {
        tenant_id: t.id,
        tenant_name: t.name,
        plan_tier: t.plan_tier ?? "free",
        created_at: t.created_at,
        days_since_signup: daysBetween(t.created_at, nowIso),
        current_stage: currentStage,
        current_stage_label: STAGE_LABELS[currentStage],
        next_stage: nextStage,
        next_stage_label: nextStage ? STAGE_LABELS[nextStage] : null,
      };
    });

    const filtered = stageFilter ? rows.filter((r) => r.current_stage === stageFilter) : rows;

    return apiJson({
      ok: true,
      range_days: range,
      total: filtered.length,
      tenants: filtered,
    });
  } catch (e) {
    return apiInternalError(e, "platform/onboarding-tenants");
  }
}
