import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform/onboarding-funnel
 *
 * 直近 N 日のサインアップに対して、各オンボーディング段階の到達率を返す。
 * 運営側が「どこで離脱しているか」を一目で把握するためのファネル可視化用。
 *
 * 段階:
 *   1. signed_up      — テナント作成
 *   2. shop_info      — 店舗連絡先 (email/phone/address のいずれか) 入力
 *   3. logo           — ロゴ設定
 *   4. first_record   — 最初の顧客 or 車両を登録
 *   5. first_cert     — 最初の証明書を発行
 *   6. first_invoice  — 最初の請求書を作成
 */

type FunnelStage = {
  id: string;
  label: string;
  count: number;
  /** 直前段階からのドロップオフ率 (0-100) */
  drop_pct: number;
};

const RANGES = [7, 30, 90] as const;

type Range = (typeof RANGES)[number];

function nDaysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

async function computeFunnel(
  admin: ReturnType<typeof createPlatformScopedAdmin>,
  rangeDays: Range,
): Promise<{ stages: FunnelStage[]; total: number }> {
  const sinceIso = nDaysAgoIso(rangeDays);

  // 期間内に作成されたテナント
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, contact_email, contact_phone, address, logo_asset_path")
    .gte("created_at", sinceIso)
    .returns<
      {
        id: string;
        contact_email: string | null;
        contact_phone: string | null;
        address: string | null;
        logo_asset_path: string | null;
      }[]
    >();

  const list = tenants ?? [];
  const total = list.length;

  if (total === 0) {
    return {
      total: 0,
      stages: [
        { id: "signed_up", label: "サインアップ", count: 0, drop_pct: 0 },
        { id: "shop_info", label: "店舗連絡先入力", count: 0, drop_pct: 0 },
        { id: "logo", label: "ロゴ設定", count: 0, drop_pct: 0 },
        { id: "first_record", label: "顧客 or 車両 登録", count: 0, drop_pct: 0 },
        { id: "first_cert", label: "初回証明書発行", count: 0, drop_pct: 0 },
        { id: "first_invoice", label: "初回請求書作成", count: 0, drop_pct: 0 },
      ],
    };
  }

  const tenantIds = list.map((t) => t.id);

  // 並列でカウント類を取得
  // documents は invoice と consolidated_invoice の両方を「請求書」として扱う
  // (一括請求のみ作成しているテナントを取りこぼさないため)
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

  // 累積条件で各段階に到達したテナントを数える。
  // 各段階は「前段階の条件を満たした上で、この段階の条件も満たす」ことを要求する
  // ことで、ファネルが厳密に単調減少になり drop_pct が常に有効値になる。
  let shopInfoCount = 0;
  let logoCount = 0;
  let firstRecordCount = 0;
  let firstCertCount = 0;
  let firstInvoiceCount = 0;

  for (const t of list) {
    const hasShopInfo = !!(t.contact_email || t.contact_phone || t.address);
    if (!hasShopInfo) continue;
    shopInfoCount++;

    const hasLogo = !!t.logo_asset_path;
    if (!hasLogo) continue;
    logoCount++;

    const hasRecord = tenantsWithVehicle.has(t.id) || tenantsWithCustomer.has(t.id);
    if (!hasRecord) continue;
    firstRecordCount++;

    const hasCert = tenantsWithCert.has(t.id);
    if (!hasCert) continue;
    firstCertCount++;

    const hasInvoice = tenantsWithInvoice.has(t.id);
    if (!hasInvoice) continue;
    firstInvoiceCount++;
  }

  const counts = [total, shopInfoCount, logoCount, firstRecordCount, firstCertCount, firstInvoiceCount];
  const labels = [
    { id: "signed_up", label: "サインアップ" },
    { id: "shop_info", label: "店舗連絡先入力" },
    { id: "logo", label: "ロゴ設定" },
    { id: "first_record", label: "顧客 or 車両 登録" },
    { id: "first_cert", label: "初回証明書発行" },
    { id: "first_invoice", label: "初回請求書作成" },
  ];

  const stages: FunnelStage[] = labels.map((l, i) => {
    const prev = i === 0 ? counts[0] : counts[i - 1];
    const drop = i === 0 || prev === 0 ? 0 : Math.round(((prev - counts[i]) / prev) * 100);
    return { id: l.id, label: l.label, count: counts[i], drop_pct: drop };
  });

  return { stages, total };
}

export const GET = withCaller(
  async (req, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const url = new URL(req.url);
      const rangeRaw = parseInt(url.searchParams.get("range") ?? "30", 10);
      const range: Range = RANGES.includes(rangeRaw as Range) ? (rangeRaw as Range) : 30;

      const admin = createPlatformScopedAdmin("platform onboarding-funnel — platform-wide signup conversion analytics");
      const result = await computeFunnel(admin, range);

      return apiJson({ ok: true, range_days: range, ...result });
    } catch (e) {
      return apiInternalError(e, "platform/onboarding-funnel");
    }
  },
  { routeName: "platform/onboarding-funnel" },
);
