/**
 * 公開証明書（/c/[public_id]・公開 PDF・公開メディア API）で、写真と個人情報を見せてよい閲覧者か。
 *
 * 見せるのは次のいずれかのときだけ（それ以外の匿名閲覧には出さない）:
 *   - 作業店舗: 発行テナントに所属するログイン中のスタッフ
 *   - 所有者: その証明書の顧客として顧客ポータルにログイン中（ポータルの証明書一覧と同じ範囲）
 *   - 決済済み: この車両の履歴レポート（/v/[vin]）を購入済みで、購入の開示範囲にこの証明書が入っている
 *
 * 判定できないとき（DB・認証の一時障害）は**見せない**（fail-closed）。見せないのは写真と個人情報だけで、
 * 証明書の存在確認・施工内容の骨子は従来どおり誰でも見られる。
 */
import { cookies } from "next/headers";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserId } from "@/lib/auth/checkRole";
import { CUSTOMER_COOKIE, validateSession } from "@/lib/customerPortalServer";
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";
import { certInReportScope, findValidReportAccess, reportCookieName } from "@/lib/vehicleReport/access";

/** 判定に使う certificates の列（呼び出し側の select に足す）。公開の応答には載せないこと。 */
export const DETAIL_ACCESS_COLUMNS =
  "tenant_id, vehicle_id, customer_id, customer_phone_last4_hash, hidden_from_owner_portal_at, created_at";

export type DetailAccessCert = {
  /** null は判定できない（＝見せない） */
  tenant_id: string | null;
  vehicle_id: string | null;
  customer_id: string | null;
  customer_phone_last4_hash: string | null;
  hidden_from_owner_portal_at?: string | null;
  created_at: string | null;
};

type PortalSession = { customer_id: string | null; phone_last4_hash: string | null };

/**
 * 顧客ポータルのセッションがこの証明書の所有者か。listCertificatesForCustomer と同じ範囲:
 * customer_id が焼き込まれていればそれで、無ければ電話下4桁ハッシュで照合。移転済み（旧オーナー）は除く。
 */
export function isOwnerSession(session: PortalSession | null, cert: DetailAccessCert): boolean {
  if (!session || cert.hidden_from_owner_portal_at) return false;
  if (session.customer_id) return session.customer_id === cert.customer_id;
  return !!session.phone_last4_hash && session.phone_last4_hash === cert.customer_phone_last4_hash;
}

async function isIssuingShopStaff(tenantId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const userId = await resolveUserId(supabase);
  if (!userId) return false;
  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  return !error && !!data;
}

async function hasPaidReport(cert: DetailAccessCert, cookieNames: string[], get: (n: string) => string | undefined) {
  // 履歴レポートの cookie（vrt_*）が無ければ VIN を引くまでもない
  if (!cert.vehicle_id || !isPassportPublicEnabled() || !cookieNames.some((n) => n.startsWith("vrt_"))) return false;
  // ponytail: getPublicCertificateData も同じ車両行を読むが、判定をその Promise.all に並べるため別に引く
  //   （vrt_* cookie を持つ購入者の閲覧だけで発生する 1 往復）。
  const { data } = await createServiceRoleAdmin("public certificate — VIN lookup for paid report check")
    .from("vehicles")
    .select("vin_code_normalized, passport_opt_out")
    .eq("id", cert.vehicle_id)
    .maybeSingle();
  const row = data as { vin_code_normalized: string | null; passport_opt_out: boolean | null } | null;
  // 履歴レポート（getPassportData）が載せるのは passport_opt_out=false の車両の証明書だけ。購入範囲もそれに揃える。
  const vin = row && row.passport_opt_out === false ? row.vin_code_normalized : null;
  if (!vin) return false;
  const access = await findValidReportAccess(vin, get(reportCookieName(vin)));
  return !!access && certInReportScope(access, cert.created_at);
}

/** 写真・個人情報を見せてよい閲覧者か（リクエストの cookie を読む）。 */
export async function canViewCertificateDetails(cert: DetailAccessCert): Promise<boolean> {
  const tenantId = cert.tenant_id;
  if (!tenantId) return false;
  try {
    const store = await cookies();
    const portalToken = store.get(CUSTOMER_COOKIE)?.value;
    if (portalToken && isOwnerSession(await validateSession(tenantId, portalToken), cert)) return true;
    const names = store.getAll().map((c) => c.name);
    if (await hasPaidReport(cert, names, (n) => store.get(n)?.value)) return true;
    return await isIssuingShopStaff(tenantId);
  } catch (e) {
    console.warn("[certificate detail access] check failed; hiding details:", e instanceof Error ? e.message : e);
    return false;
  }
}

const PUBLIC_DETAIL_KEYS = {
  // 作業種別・走行距離・次回点検日だけ。担当者名・所見・交換部品の自由記述は出さない。
  maintenance_json: ["work_types", "mileage", "next_service_date"],
  // 修理種別・塗装・箇所・方法だけ。修理前後のメモ・保証の自由記述は出さない。
  body_repair_json: ["repair_type", "paint_color_code", "paint_type", "affected_panels", "repair_methods"],
  // 製品・メーカー・取付位置・カテゴリだけ。担当者名・取付メモ・保証の自由記述は出さない。
  accessory_json: ["product_name", "maker_name", "install_location", "accessory_types"],
} as const;

function pick(v: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in src) out[k] = src[k];
  return out;
}

/**
 * 匿名閲覧向けに、施工内容から個人情報（担当者の氏名・自由記述）を落とす。
 * **許可リスト**: 知らないキーは出さない（キーが増えても既定で漏れない）。
 */
export function redactCertificateDetails<
  T extends {
    craftsman_name?: string | null;
    maintenance_json?: unknown;
    body_repair_json?: unknown;
    accessory_json?: unknown;
  },
>(cert: T): T {
  return {
    ...cert,
    craftsman_name: null,
    maintenance_json: pick(cert.maintenance_json, PUBLIC_DETAIL_KEYS.maintenance_json),
    body_repair_json: pick(cert.body_repair_json, PUBLIC_DETAIL_KEYS.body_repair_json),
    accessory_json: pick(cert.accessory_json, PUBLIC_DETAIL_KEYS.accessory_json),
  };
}
