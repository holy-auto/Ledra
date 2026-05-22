/**
 * 事故車両マッチング: 保険会社が事故車両の VIN を渡してきた時に、
 * その車両を最も得意とする施工店をランキングして返す。
 *
 * Phase D #8。passport_api_keys (scope: accident:match) で認証された
 * consumer (= 保険会社の事故担当 / 査定システム) からの GET 専用 API
 * から呼ばれる。
 *
 * ランキングロジック (MVP):
 *   1. 過去 24ヶ月の certificates を VIN ベースで全テナント集約
 *   2. tenant_id ごとに以下を集計:
 *      - 直近の施工日 (recency)
 *      - 施工種別 (service_type) ごとの件数
 *      - 写真品質 (avg authenticity_grade) ※ 改ざんに強い証拠を出せる店
 *   3. スコア = recency + service_match + photo_quality_bonus
 *   4. 上位 5 店を返す (PII 無し: shop_name / capabilities / score / last_service_at)
 *
 * 個人情報は一切返さない (顧客名・連絡先・車両ID内部 ID)。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type AdminLike = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type AccidentMatchService = "ppf" | "coating" | "body_repair" | "maintenance" | "wrapping" | "other";

export type AccidentMatchShop = {
  tenant_slug: string | null;
  shop_name: string | null;
  recent_service_count: number;
  last_service_at: string | null;
  capabilities: Array<{ service_type: AccidentMatchService; count: number }>;
  avg_photo_quality: number | null;
  rank_score: number;
};

export type AccidentMatchResult = {
  vin_normalized: string;
  passport_id: string;
  total_history_count: number;
  ranked_shops: AccidentMatchShop[];
};

const SERVICE_TYPE_MAP: Record<string, AccidentMatchService> = {
  ppf: "ppf",
  coating: "coating",
  body_repair: "body_repair",
  maintenance: "maintenance",
  wrapping: "wrapping",
};

function normalizeServiceType(raw: string | null): AccidentMatchService {
  if (!raw) return "other";
  return SERVICE_TYPE_MAP[raw] ?? "other";
}

function gradeNumeric(grade: string | null): number | null {
  switch (grade) {
    case "unverified":
      return 0;
    case "basic":
      return 1;
    case "verified":
      return 2;
    case "premium":
      return 3;
    default:
      return null;
  }
}

/**
 * VIN に該当するパスポート + 全テナント横断の証明書履歴を集約して、
 * 上位 5 店をランキングして返す。VIN にパスポートが無ければ null。
 */
export async function matchShopsForAccident(
  admin: AdminLike,
  vinNormalized: string,
): Promise<AccidentMatchResult | null> {
  // 1) passport 行を取得 (= 「Ledra でアンカー実績がある車両」かどうかの fast guard)
  const { data: passportRaw } = await admin
    .from("vehicle_passports")
    .select("vin_code_normalized")
    .eq("vin_code_normalized", vinNormalized)
    .maybeSingle();
  if (!passportRaw) return null;

  // 2) この VIN に紐づく全テナントの vehicle 行
  const { data: vehiclesRaw } = await admin
    .from("vehicles")
    .select("id, tenant_id")
    .eq("vin_code_normalized", vinNormalized)
    .eq("passport_opt_out", false);
  const vehicles = (vehiclesRaw ?? []) as Array<{ id: string; tenant_id: string }>;
  if (vehicles.length === 0) return null;
  const vehicleIds = vehicles.map((v) => v.id);
  const tenantIds = [...new Set(vehicles.map((v) => v.tenant_id))];

  // 3) 過去 24 ヶ月の certificates
  const since = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: certsRaw } = await admin
    .from("certificates")
    .select("id, tenant_id, service_type, created_at")
    .in("vehicle_id", vehicleIds)
    .neq("status", "void")
    .gte("created_at", since);
  const certs = (certsRaw ?? []) as Array<{
    id: string;
    tenant_id: string;
    service_type: string | null;
    created_at: string;
  }>;

  // 写真品質を補強 (certificate_images の authenticity_grade を join)
  const certIds = certs.map((c) => c.id);
  let photoGradeMap = new Map<string, number[]>();
  if (certIds.length > 0) {
    const { data: imgsRaw } = await admin
      .from("certificate_images")
      .select("certificate_id, authenticity_grade")
      .in("certificate_id", certIds);
    const imgs = (imgsRaw ?? []) as Array<{ certificate_id: string; authenticity_grade: string | null }>;
    photoGradeMap = imgs.reduce((map, img) => {
      const g = gradeNumeric(img.authenticity_grade);
      if (g !== null) {
        const arr = map.get(img.certificate_id) ?? [];
        arr.push(g);
        map.set(img.certificate_id, arr);
      }
      return map;
    }, new Map<string, number[]>());
  }

  // 4) tenants name lookup
  const { data: tenantRowsRaw } = await admin.from("tenants").select("id, name, slug").in("id", tenantIds);
  const tenantMap = new Map(
    ((tenantRowsRaw ?? []) as Array<{ id: string; name: string | null; slug: string | null }>).map((t) => [t.id, t]),
  );

  // 5) tenant ごとの集計
  type TenantAcc = {
    tenant_id: string;
    count: number;
    last_at: string | null;
    services: Map<AccidentMatchService, number>;
    grade_sum: number;
    grade_count: number;
  };
  const acc = new Map<string, TenantAcc>();
  const nowMs = Date.now();

  for (const c of certs) {
    let entry = acc.get(c.tenant_id);
    if (!entry) {
      entry = {
        tenant_id: c.tenant_id,
        count: 0,
        last_at: null,
        services: new Map(),
        grade_sum: 0,
        grade_count: 0,
      };
      acc.set(c.tenant_id, entry);
    }
    entry.count++;
    if (!entry.last_at || c.created_at > entry.last_at) entry.last_at = c.created_at;
    const svc = normalizeServiceType(c.service_type);
    entry.services.set(svc, (entry.services.get(svc) ?? 0) + 1);
    const grades = photoGradeMap.get(c.id) ?? [];
    for (const g of grades) {
      entry.grade_sum += g;
      entry.grade_count++;
    }
  }

  // 6) スコア計算 + ランキング
  const shops: AccidentMatchShop[] = [];
  for (const entry of acc.values()) {
    const t = tenantMap.get(entry.tenant_id);
    const recencyDays = entry.last_at ? (nowMs - new Date(entry.last_at).getTime()) / 86_400_000 : 1000;
    // recency: 30 日以内なら 100, 365 日で 0 に線形減衰
    const recencyScore = Math.max(0, 100 - Math.max(0, recencyDays - 30) / 3.35);
    // volume: 件数 (上限 50)
    const volumeScore = Math.min(50, entry.count * 5);
    // 写真品質: 平均 grade (0-3) × 10
    const avgGrade = entry.grade_count > 0 ? entry.grade_sum / entry.grade_count : null;
    const qualityScore = avgGrade !== null ? avgGrade * 10 : 0;

    const totalScore = recencyScore + volumeScore + qualityScore;

    const capabilities: Array<{ service_type: AccidentMatchService; count: number }> = [];
    for (const [svc, count] of entry.services) {
      capabilities.push({ service_type: svc, count });
    }
    capabilities.sort((a, b) => b.count - a.count);

    shops.push({
      tenant_slug: t?.slug ?? null,
      shop_name: t?.name ?? t?.slug ?? null,
      recent_service_count: entry.count,
      last_service_at: entry.last_at,
      capabilities,
      avg_photo_quality: avgGrade,
      rank_score: Math.round(totalScore * 100) / 100,
    });
  }

  shops.sort((a, b) => b.rank_score - a.rank_score);
  const ranked = shops.slice(0, 5);

  return {
    vin_normalized: vinNormalized,
    passport_id: vinNormalized.slice(-6),
    total_history_count: certs.length,
    ranked_shops: ranked,
  };
}
