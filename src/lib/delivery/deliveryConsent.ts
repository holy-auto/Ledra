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
 *     未承諾もブロックする厳格運用はテナント opt-in の後続（OPEN_QUESTIONS）。
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
 * 未承諾（none）は既定では通す —— 厳格な事前承諾ゲートは別途 opt-in（上の方針参照）。
 */
export function isElectronicDeliveryBlocked(row: DeliveryConsentRow | null | undefined): boolean {
  return deliveryConsentStatus(row) === "revoked";
}

/**
 * 顧客単位で電子交付をブロックすべきか（撤回済みか）を DB から判定する共通ゲート。 [G4]
 * 記録簿の写しの電子交付を行う全経路（証明書の受領サイン依頼・署名依頼など）から呼ぶ。
 *
 * **fail-closed**: 承諾状態を確認できない（クエリ失敗）ときはブロックする —— 規制(4)の
 * 「撤回されたら交付してはならない」保護を、DB 一時障害で落とさないため。
 * `db` は tenant-scoped admin（RLS バイパス）を渡す。customerId が無い証明書は呼び出し側で除外する。
 */
export async function isElectronicDeliveryBlockedForCustomer(
  db: Pick<SupabaseClient, "from">,
  tenantId: string,
  customerId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("delivery_consents")
    .select("status, revoked_at")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) return true; // 確認できない → ブロック（fail-closed）
  return isElectronicDeliveryBlocked((data as DeliveryConsentRow | null) ?? null);
}
