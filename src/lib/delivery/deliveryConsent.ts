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

import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryConsentState } from "@/lib/domain/states";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";

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

/** 承諾依頼リンク（/consent/delivery/<token>）の有効日数。 */
export const CONSENT_REQUEST_TTL_DAYS = 14;

/** 承諾依頼リンクのトークンは平文で保存せず、sha256 だけを持つ（DB が漏れてもリンクを再現できない）。 */
export function hashConsentRequestToken(token: string): string {
  return createHash("sha256").update(`delivery-consent-request|${token}`, "utf8").digest("hex");
}

export function newConsentRequestToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashConsentRequestToken(token) };
}

export type ConsentRequestLookup =
  | { state: "ok"; id: string; tenantId: string; customerId: string; createdAt: string; sentVia: string }
  | { state: "used" | "expired" | "not_found" }
  | { state: "error"; error: unknown };

/** 承諾依頼リンクのトークンから依頼を引く（公開ページと承諾 API の共通）。`db` は service-role。 */
export async function findConsentRequest(
  db: Pick<SupabaseClient, "from">,
  token: string,
  now: Date = new Date(),
): Promise<ConsentRequestLookup> {
  // 発行するトークンは 32 バイトの base64url（43 文字）。形の違うものは DB に問い合わせない。
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: "not_found" };
  const { data, error } = await db
    .from("delivery_consent_requests")
    .select("id, tenant_id, customer_id, sent_via, expires_at, used_at, created_at")
    .eq("token_hash", hashConsentRequestToken(token))
    .maybeSingle();
  if (error) return { state: "error", error };
  const r = data as {
    id: string;
    tenant_id: string;
    customer_id: string;
    sent_via: string;
    expires_at: string;
    used_at: string | null;
    created_at: string;
  } | null;
  if (!r) return { state: "not_found" };
  if (r.used_at) return { state: "used" };
  if (new Date(r.expires_at).getTime() <= now.getTime()) return { state: "expired" };
  return {
    state: "ok",
    id: r.id,
    tenantId: r.tenant_id,
    customerId: r.customer_id,
    createdAt: r.created_at,
    sentVia: r.sent_via,
  };
}

/** 承諾依頼リンクの発行（createdAt）以降に撤回されたか。撤回後に古いリンクで承諾に戻さないための判定（規制(4)）。 */
export function revokedSinceRequest(
  consent: { status?: string | null; revoked_at?: string | null } | null | undefined,
  requestCreatedAt: string,
): boolean {
  return (
    consent?.status === "revoked" &&
    !!consent.revoked_at &&
    new Date(consent.revoked_at).getTime() >= new Date(requestCreatedAt).getTime()
  );
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
  "この顧客から電子交付の承諾を得ていません（店舗設定で事前承諾を必須にしています）。顧客詳細の「電子交付の承諾」から承諾のお願いを送るか承諾を記録するか、書面交付等に切り替えてください。";
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

/** お客様向け画面（署名・受領リンク）で電子交付を止めるときの応答（apiError にそのまま渡せる形）。店舗向けの理由は含めない。 */
export type CustomerFacingDeliveryBlock = { code: "conflict" | "db_error"; status: 409 | 503; message: string };

const CUSTOMER_BLOCKED: CustomerFacingDeliveryBlock = {
  code: "conflict",
  status: 409,
  message:
    "電子データでのお渡しに必要なご承諾が確認できないため、このリンクはご利用いただけません。書面でのお渡しは発行店舗へお問い合わせください。",
};
const CUSTOMER_UNAVAILABLE: CustomerFacingDeliveryBlock = {
  code: "db_error",
  status: 503,
  message: "現在このリンクを確認できません。時間をおいて再度お試しください。",
};

/**
 * 発行済みの署名/受領リンク（お客様が開く・送信する時点）で、その証明書の電子交付を止めるべきかを返す。 [G3/G4]
 * リンク発行後に承諾が撤回された・テナントが事前承諾を必須にした場合も、開いた時点の状態で判定する（失効の代わり）。
 * 判定できない（DB 一時障害）ときは承諾の問題とせず再試行を案内する。止めたときは audit_logs に残す（G4 の証跡）。
 * `db` は service-role（トークンで引いたセッションの certificate_id は信頼できる）。
 */
export async function customerFacingDeliveryBlock(
  db: Pick<SupabaseClient, "from">,
  certificateId: string | null | undefined,
  ctx: { sessionId: string; req?: Request },
): Promise<CustomerFacingDeliveryBlock | null> {
  // 証明書に紐付かないセッション（修理同意など）は記録簿の写しの交付ではないので対象外
  if (!certificateId) return null;
  const { data, error } = await db
    .from("certificates")
    .select("tenant_id, customer_id")
    .eq("id", certificateId)
    .maybeSingle();
  if (error) return CUSTOMER_UNAVAILABLE;
  const row = data as { tenant_id: string; customer_id: string | null } | null;
  if (!row) return null; // 証明書が無い＝交付するものが無い（後続の処理が扱う）
  const m = await electronicDeliveryBlockMessage(db, row.tenant_id, row.customer_id ?? null);
  if (!m) return null;
  const block = m === BLOCKED_UNVERIFIED ? CUSTOMER_UNAVAILABLE : CUSTOMER_BLOCKED;
  void logTenantAuditEvent(db, {
    tenantId: row.tenant_id,
    actorType: "system",
    action: "delivery_link_blocked",
    table: "signature_sessions",
    recordId: ctx.sessionId,
    extra: { certificate_id: certificateId, status: block.status },
    req: ctx.req,
  });
  return block;
}

/**
 * 使用者本人の承諾を記録する（顧客ポータル・承諾依頼リンクの共通処理）。 [G3 / 第２ ４（３）]
 * 本人の承諾が既にあれば何もしない。店舗が記録した承諾は本人の承諾で置き換える（誰が記録していたかは監査ログに残す）。
 * 本人の承諾は granted_by=null で表す（店舗の記録は必ず granted_by=操作者）。method は「示した交付方法」の列なので
 * 入れず、示した文言は consent_version / consent_text_hash で特定する。撤回後の再承諾は同じ行を上書きするので、
 * 撤回の記録と経路（via）・接続元（IP/UA）は監査ログに残す（G4 の証跡）。
 */
export async function grantDeliveryConsentAsCustomer(
  db: Pick<SupabaseClient, "from">,
  p: {
    tenantId: string;
    customerId: string;
    via: "portal" | "link";
    /** 承諾依頼リンク経由のとき: 依頼 ID・発行日時・渡し方。発行後に撤回されていたら記録しない。 */
    request?: { id: string; createdAt: string; sentVia: string };
    req?: Request;
  },
): Promise<
  { ok: true; alreadyGranted: boolean } | { ok: false; error: unknown } | { ok: false; revokedAfterRequest: true }
> {
  const { data: current, error: readErr } = await db
    .from("delivery_consents")
    .select("status, granted_by, revoked_at, revoked_via")
    .eq("tenant_id", p.tenantId)
    .eq("customer_id", p.customerId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  const prev = current as {
    status: string;
    granted_by?: string | null;
    revoked_at: string | null;
    revoked_via: string | null;
  } | null;
  // 本人の承諾が既にあれば何もしない。店舗が記録した承諾（granted_by あり）は本人の承諾で置き換える
  // （本人の操作の方が証跡として強い。店舗の記録が押し間違いでも、本人の承諾が消えないように。誰が記録していたかは監査ログに残す）。
  if (prev?.status === "granted" && !prev.granted_by) return { ok: true, alreadyGranted: true };
  // リンクを渡した後に撤回された（お客様が断った）なら、その古いリンクで承諾に戻さない（規制(4)）。
  if (p.request && revokedSinceRequest(prev, p.request.createdAt)) return { ok: false, revokedAfterRequest: true };

  const now = new Date().toISOString();
  const row = {
    tenant_id: p.tenantId,
    customer_id: p.customerId,
    status: "granted",
    method: null,
    note: null,
    consent_version: DELIVERY_CONSENT_VERSION,
    consent_text_hash: computeDeliveryConsentTextHash(),
    granted_at: now,
    granted_by: null,
    revoked_at: null,
    revoked_by: null,
    revoked_via: null,
    updated_at: now,
  };
  // 「本人の承諾は上書きしない」を書き込み側の条件にも持たせる（読んでから書くまでに二重送信が割り込んでも、
  // 監査ログを2回書かない）。
  // ponytail: 読んでから書くまでの間の「撤回」は拾わない（同じ顧客で撤回と承諾がミリ秒単位で重なる場合だけ）。
  if (prev) {
    const { data: updated, error } = await db
      .from("delivery_consents")
      .update(row)
      .eq("tenant_id", p.tenantId)
      .eq("customer_id", p.customerId)
      .or("status.neq.granted,granted_by.not.is.null")
      .select("customer_id");
    if (error) return { ok: false, error };
    if (!Array.isArray(updated) || updated.length === 0) return { ok: true, alreadyGranted: true };
  } else {
    const { error } = await db.from("delivery_consents").insert(row);
    if ((error as { code?: string } | null)?.code === "23505") return { ok: true, alreadyGranted: true };
    if (error) return { ok: false, error };
  }
  void logTenantAuditEvent(db, {
    tenantId: p.tenantId,
    actorType: "system",
    action: "delivery_consent_granted_by_customer",
    table: "delivery_consents",
    recordId: p.customerId,
    extra: {
      via: p.via,
      // 渡し方が link（リンク・QR を店舗が手元に持っている）のときは、店舗の端末から押された可能性を排除できない。
      ...(p.request ? { request_id: p.request.id, sent_via: p.request.sentVia } : {}),
      consent_version: DELIVERY_CONSENT_VERSION,
      previous_status: prev?.status ?? "none",
      previous_granted_by: prev?.granted_by ?? null,
      previous_revoked_at: prev?.revoked_at ?? null,
      previous_revoked_via: prev?.revoked_via ?? null,
    },
    req: p.req,
  });
  return { ok: true, alreadyGranted: false };
}
