/**
 * Ledra 受領サイン (作業完了後の電子署名) — ドメインロジック
 *
 * 既存の signature_sessions / ECDSA P-256 / Polygon アンカリング基盤を流用し、
 * 受領サイン固有の以下を担当する:
 *   - 同意文言 (バージョン管理)
 *   - 二要素認証 (登録電話番号下4桁) のチェック
 *   - 受領内容スナップショット
 *   - 受領証 PDF の生成情報構築
 *   - 署名ペイロード v2 の構築 (consent / 2FA を含めて binding)
 */

import { createHash } from "crypto";
import { phoneLast4Hash, normalizeLast4 } from "@/lib/customerPortalServer";

// ============================================================
// 同意文言 (バージョン管理)
// ============================================================

/**
 * 受領サインの同意文言バージョン。
 * 文言を変更したら必ず "v2", "v3" にバンプする。
 * バンプしないと過去の署名と新しい署名で同じ version 文字列が
 * 異なる文言にマップされ、検証時に整合性が取れなくなる。
 */
export const CONSENT_VERSION = "delivery-receipt-v1";

/**
 * 顧客が受領サイン時に同意する文言の正規化形式。
 * この文字列の SHA-256 ハッシュが署名ペイロードに含まれる。
 *
 * 改行・空白の表現で hash がブレるのを避けるため、
 * 必ずこの定数を介して取得すること。
 */
export const CONSENT_TEXT_BODY = [
  "私は、本作業の内容および施工結果を確認し、これを受領しました。",
  "本受領サインは電子署名法 (平成12年法律第102号) 第2条に基づく電子署名であり、",
  "本人の意思に基づき行うものです。",
  "署名後、受領した内容について改ざんがないことが暗号技術 (ECDSA P-256) により",
  "保証され、Ledra のサーバーおよび Polygon ブロックチェーンに証跡が保管されます。",
].join("\n");

/**
 * 同意文言の SHA-256 ハッシュ (署名ペイロードに含めて改ざん検知の対象とする)。
 * 同意文言が将来変更された際は CONSENT_VERSION も同時にバンプすること。
 */
export function computeConsentTextHash(text: string = CONSENT_TEXT_BODY): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * バージョン → 文言本体 の凍結マップ。
 *
 * 受領サインの依頼を発行した時点でセッションには `consent_version` と
 * `consent_text_hash` が記録され、署名ペイロードにも binding されている。
 * その後コード上の文言定数を編集して新しいバージョンに上げた場合でも、
 * 在中の (pending) 古いリンクには「依頼時点の文言」を提示する必要がある。
 * そうしないと、ユーザが見る文言と署名対象になっているハッシュが乖離し、
 * 監査・法的整合性を欠く (Codex P2 指摘)。
 *
 * 不変条件:
 *   - 既存エントリの値は **絶対に書き換えない** (既発行リンクが壊れる)。
 *   - 文言を変更したいときは新しいキー ("delivery-receipt-v2") を追加し、
 *     CONSENT_VERSION 定数を新キーに切り替える。
 */
export const CONSENT_TEXTS: Readonly<Record<string, string>> = Object.freeze({
  "delivery-receipt-v1": CONSENT_TEXT_BODY,
});

/**
 * 指定バージョンに紐づく同意文言を返す。未知のバージョンなら null。
 *
 * 呼び出し側は、返ってきた文言をそのままユーザに見せると
 * セッション側の hash と乖離する可能性があるので、
 * 必要なら `computeConsentTextHash(text) === storedHash` で整合性を確認すること。
 */
export function getConsentTextByVersion(version: string | null | undefined): string | null {
  if (!version) return null;
  return CONSENT_TEXTS[version] ?? null;
}

// ============================================================
// 受領サイン用 署名ペイロード (v2)
// ============================================================

/**
 * 受領サインの署名対象ペイロードを構築する。
 *
 * 証明書本体署名 (buildSigningPayload v1) との違い:
 *   - プレフィックスが "ledra-delivery-receipt-v1"
 *   - phone_last4_hash と consent_text_hash が含まれる
 *     → 顧客が「どの文言に」「自分の電話番号で本人確認した上で」
 *        同意したかが暗号的に binding される
 *
 * フォーマット:
 *   "ledra-delivery-receipt-v1:{document_hash}:{signed_at}:{signer_email}:
 *    {phone_last4_hash}:{consent_version}:{consent_text_hash}:
 *    {certificate_id}:{session_id}"
 */
export function buildDeliveryReceiptPayload(args: {
  documentHash: string;
  signedAt: string;
  signerEmail: string;
  phoneLast4Hash: string;
  consentVersion: string;
  consentTextHash: string;
  certificateId: string;
  sessionId: string;
}): string {
  return [
    "ledra-delivery-receipt-v1",
    args.documentHash.toLowerCase(),
    args.signedAt,
    args.signerEmail.toLowerCase().trim(),
    args.phoneLast4Hash.toLowerCase(),
    args.consentVersion,
    args.consentTextHash.toLowerCase(),
    args.certificateId.toLowerCase(),
    args.sessionId.toLowerCase(),
  ].join(":");
}

// ============================================================
// 二要素認証 (登録電話番号下4桁)
// ============================================================

/** 二要素認証の試行回数上限。これを超えるとセッションがロックされる。 */
export const SECONDARY_FACTOR_MAX_ATTEMPTS = 3;

export type SecondaryFactorResult =
  { ok: true } | { ok: false; reason: "invalid_format" | "mismatch" | "locked"; attempts: number };

/**
 * 顧客が入力した電話番号下4桁を、セッションに保存された
 * phone_last4_hash と比較する。
 *
 * - 入力フォーマット (正規化後 4桁数字) が不正な場合は `invalid_format`
 * - 既に試行回数上限に達している場合は `locked`
 * - ハッシュが一致しなければ `mismatch` (試行回数 +1)
 *
 * @param tenantId       テナント UUID (hash の salt)
 * @param storedHash     セッションに保存された期待値 (phone_last4_hash)
 * @param input          顧客が入力した文字列
 * @param attemptsSoFar  これまでの失敗回数
 */
export function verifyPhoneLast4(args: {
  tenantId: string;
  storedHash: string;
  input: string;
  attemptsSoFar: number;
}): SecondaryFactorResult {
  if (args.attemptsSoFar >= SECONDARY_FACTOR_MAX_ATTEMPTS) {
    return { ok: false, reason: "locked", attempts: args.attemptsSoFar };
  }

  let normalized: string;
  try {
    normalized = normalizeLast4(args.input);
  } catch {
    return { ok: false, reason: "invalid_format", attempts: args.attemptsSoFar };
  }

  const computed = phoneLast4Hash(args.tenantId, normalized);
  if (computed !== args.storedHash) {
    return { ok: false, reason: "mismatch", attempts: args.attemptsSoFar + 1 };
  }

  return { ok: true };
}

// ============================================================
// 受領内容スナップショット
// ============================================================

/**
 * 受領サイン PDF / 画面に表示するための受領内容スナップショット。
 * certificate / vehicle / store / customer 等を 1 オブジェクトに固める。
 *
 * 後で証明書本体が編集されても受領サイン時点の内容を保持するため、
 * この JSON は delivery_receipts.receipt_payload_json に保存して固定する。
 */
export interface ReceiptPayloadSnapshot {
  certificate: {
    id: string;
    public_id: string | null;
    cert_type: string | null;
    service_type: string | null;
    created_at: string | null;
  };
  vehicle: {
    car_number: string | null;
    car_name: string | null;
  } | null;
  store: {
    name: string | null;
  } | null;
  customer: {
    name: string | null;
    /** 表示用の下4桁マスク (例: "***1234") */
    phone_last4_masked: string | null;
  };
  consent: {
    version: string;
    text_hash: string;
  };
  signed_at: string;
}
