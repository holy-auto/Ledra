/**
 * 記録簿の写しの「電子交付」への事前承諾と撤回。 [G3/G4 / 第２ ４（３）（４）]
 *
 * 規制: (3) 電磁的方法で交付する前に交付方法を示して承諾を得る、(4) 承諾が得られない/撤回された場合は
 * 電磁的交付をしてはならない。本モジュールは顧客単位の承諾状態（delivery_consents）の
 * **正準語彙・開示文言・判定**の単一定義源。見積/請求の送付（documents/share）は対象外。
 *
 * enforcement 方針（docs/e-maintenance-record-compliance.md に明記）:
 *   - **撤回（revoked）されたら電子交付をブロックする**（規制(4)の絶対条件。常時オン）。
 *   - 未承諾（none）のハードブロックは既定で行わない（既存の交付を一斉に止めないための非破壊既定）。
 *     承諾は店舗が取得・記録し、交付画面に状態（未承諾/承諾済/撤回）を出して運用で担保する。
 *   - テナントが tenants.require_delivery_consent を true にした場合は、未承諾もブロックする（規制(3)の
 *     事前承諾をシステムで強制する opt-in）。
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryConsentState } from "@/lib/domain/states";

export const DELIVERY_CONSENT_VERSION = "delivery-consent-v1";

/** 承諾が無い（行の非在）を含む、UI/判定用の状態。granted/revoked は正準軸（states.ts）。 */
export type DeliveryConsentStatus = "none" | DeliveryConsentState;

export interface DeliveryConsentRow {
  status: DeliveryConsentState;
  revoked_at?: string | null;
}

/**
 * 承諾取得時に使用者へ開示する交付方法の文言（施行規則第11条第１項の交付方法）。
 * 文言を変えたら VERSION を必ずバンプする（過去の承諾と文言がズレないように）。
 */
export function deliveryConsentText(): string {
  return [
    "点検整備記録簿・指定整備記録簿等の写しを、次の電磁的方法のいずれかで交付することに承諾します。",
    "・電子メールによる送信",
    "・LINE 等メッセージによる送信",
    "・SMS（ショートメッセージ）による送信",
    "・ウェブ/クラウド上のリンクからのダウンロード",
    "交付された電子データは、お客様ご自身で画面表示・印刷して書面を作成できます。",
    "この承諾はいつでも撤回でき、撤回後は電磁的方法による交付を行いません（書面交付等に切り替えます）。",
  ].join("\n");
}

// ponytail: sha256-hex は customerPortalServer にも同型の sha256Hex があるが、本モジュールは
//   純粋なリーフ（DB/サーバ初期化に依存しない・単体テストもそのまま回る）に保ちたいので標準ライブラリで自前。
export function computeDeliveryConsentTextHash(): string {
  return createHash("sha256").update(deliveryConsentText(), "utf8").digest("hex");
}

/** 行（無ければ null）から現在の承諾状態を返す。 */
export function deliveryConsentStatus(row: DeliveryConsentRow | null | undefined): DeliveryConsentStatus {
  if (!row) return "none";
  return row.status === "revoked" ? "revoked" : "granted";
}

/**
 * 電子交付をブロックすべきか（規制(4)）。**撤回済みのときだけブロック**する（非破壊既定）。
 * 未承諾（none）のブロックはテナント opt-in で、DB ゲート electronicDeliveryBlockMessage が判定する。
 */
export function isElectronicDeliveryBlocked(row: DeliveryConsentRow | null | undefined): boolean {
  return deliveryConsentStatus(row) === "revoked";
}

const BLOCKED_REVOKED =
  "この顧客は電子交付の承諾を撤回しています。電磁的方法での交付はできません（書面交付等に切り替えてください）。";
const BLOCKED_NO_CONSENT =
  "この顧客から電子交付の承諾を得ていません（店舗設定で事前承諾を必須にしています）。顧客詳細で承諾を記録するか、書面交付等に切り替えてください。";
const BLOCKED_NO_CUSTOMER =
  "顧客が紐付いていない証明書は承諾を確認できません（店舗設定で事前承諾を必須にしています）。顧客を紐付けて承諾を記録するか、書面交付等に切り替えてください。";
/** 承諾状態を確認できなかった（DB 一時障害）ときの理由。呼び出し側が「再試行で直る」ものとして扱えるよう公開する。 */
export const BLOCKED_UNVERIFIED = "電子交付の承諾状態を確認できませんでした。時間をおいて再度お試しください。";

/**
 * テナントが電子交付の事前承諾を必須にしているか（tenants.require_delivery_consent）。
 * **fail-open（既定 false 扱い）**: 列の未適用（デプロイとマイグレーションの順序差）や一時障害で、
 * opt-in していない全テナントの交付を止めないため。tenantRequiresInspectorQualification と同じ方針。
 */
async function tenantRequiresDeliveryConsent(db: Pick<SupabaseClient, "from">, tenantId: string): Promise<boolean> {
  const { data, error } = await db.from("tenants").select("require_delivery_consent").eq("id", tenantId).maybeSingle();
  if (error || !data) return false;
  return (data as { require_delivery_consent: boolean | null }).require_delivery_consent === true;
}

/**
 * 記録簿の写し（証明書）の電子交付をブロックすべきかを判定する共通ゲート。 [G3/G4]
 * 電子交付を行う全経路（証明書の受領サイン依頼・署名依頼など）から呼ぶ。ブロックするなら利用者向けの
 * 理由メッセージを、通すなら null を返す。
 *
 * - 撤回済み → 常にブロック。承諾状態を確認できないときも **fail-closed** でブロック（規制(4)の保護を
 *   DB 一時障害で落とさない）。
 * - 未承諾・顧客未紐付け（customerId=null）→ テナントが事前承諾を必須にしているときだけブロック（規制(3)・opt-in）。
 *   テナント設定は該当時のみ読む。
 * `db` は tenant-scoped admin（RLS バイパス）を渡す。
 */
export async function electronicDeliveryBlockMessage(
  db: Pick<SupabaseClient, "from">,
  tenantId: string,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) {
    return (await tenantRequiresDeliveryConsent(db, tenantId)) ? BLOCKED_NO_CUSTOMER : null;
  }
  const { data, error } = await db
    .from("delivery_consents")
    .select("status, revoked_at")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) return BLOCKED_UNVERIFIED;
  const status = deliveryConsentStatus((data as DeliveryConsentRow | null) ?? null);
  if (status === "revoked") return BLOCKED_REVOKED;
  if (status === "granted") return null;
  return (await tenantRequiresDeliveryConsent(db, tenantId)) ? BLOCKED_NO_CONSENT : null;
}
