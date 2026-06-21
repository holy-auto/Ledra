/**
 * 車体整備 作業前/変更同意 (body-repair consent) の署名ドメインロジック。
 *
 * 国土交通省「車体整備の消費者に対する透明性確保に向けたガイドライン」
 * 4.2(5): 作業前 (見積) / 作業中 (変更) の説明と書面同意。
 *
 * 既存の受領サイン基盤 (signature_sessions / 二要素認証 / 同意文ハッシュ /
 * Polygon アンカリング) を流用する。deliveryReceipt.ts の双子。
 */

import { createHash } from "crypto";

/** 同意の種別。body_repair_consents.kind と同期。 */
export type BodyRepairConsentKind = "pre_work" | "change";

/** kind → signature_sessions.purpose のマッピング。 */
export const CONSENT_KIND_PURPOSE: Record<BodyRepairConsentKind, "estimate_consent" | "change_consent"> = {
  pre_work: "estimate_consent",
  change: "change_consent",
};

export const CONSENT_KIND_LABEL: Record<BodyRepairConsentKind, string> = {
  pre_work: "作業前の同意 (見積)",
  change: "作業中の変更同意",
};

/** 同意文言バージョン (内容を変えたら必ず上げる)。 */
export const BODY_REPAIR_CONSENT_VERSION = "body-repair-consent-v1";

/** kind ごとの同意文言本体。署名ペイロードに含めるハッシュ対象。 */
const CONSENT_TEXT_BODY: Record<BodyRepairConsentKind, string> = {
  pre_work:
    "私は、本車体整備について、提示された作業内容・方法・使用部品・使用塗料および" +
    "概算見積料金の説明を受け、その内容に同意の上で作業の開始を依頼します。",
  change: "私は、当初の予定から変更が生じた作業内容・方法・料金について説明を受け、" + "変更後の内容に同意します。",
};

/**
 * バージョン+種別をキーにした凍結マップ。発行済みリンクの同意文言が後から
 * 変わらないよう、署名検証時はこのマップから引く。
 */
const CONSENT_TEXTS: Record<string, string> = {
  [`${BODY_REPAIR_CONSENT_VERSION}:pre_work`]: CONSENT_TEXT_BODY.pre_work,
  [`${BODY_REPAIR_CONSENT_VERSION}:change`]: CONSENT_TEXT_BODY.change,
};

/** kind の同意文言を返す。 */
export function getConsentText(kind: BodyRepairConsentKind): string {
  return CONSENT_TEXT_BODY[kind];
}

/** version+kind の凍結文言を返す (発行済みリンク用)。見つからなければ null。 */
export function getConsentTextByVersion(version: string | null, kind: BodyRepairConsentKind): string | null {
  if (!version) return null;
  return CONSENT_TEXTS[`${version}:${kind}`] ?? null;
}

/** 同意文言の SHA-256 ハッシュ。署名時に保存するハッシュと一致しなければならない。 */
export function computeConsentTextHash(kind: BodyRepairConsentKind): string {
  return createHash("sha256").update(getConsentText(kind), "utf8").digest("hex");
}

/**
 * 署名対象ペイロード文字列を組み立てる。delivery-receipt と同様、`:` 区切りで
 * 連結し小文字化する。consent_text_hash / explanation_hash を含めることで
 * 「何に同意したか」が署名で固定される。
 */
export function buildBodyRepairConsentPayload(args: {
  documentHash: string; // 説明内容スナップショット (explanation_json) の SHA-256
  signedAt: string;
  signerEmail: string;
  phoneLast4Hash: string;
  consentVersion: string;
  consentTextHash: string;
  kind: BodyRepairConsentKind;
  bodyRepairJobId: string;
  sessionId: string;
}): string {
  return [
    "ledra-body-repair-consent-v1",
    args.documentHash,
    args.signedAt,
    args.signerEmail,
    args.phoneLast4Hash,
    args.consentVersion,
    args.consentTextHash,
    args.kind,
    args.bodyRepairJobId,
    args.sessionId,
  ]
    .join(":")
    .toLowerCase();
}

/**
 * 説明内容スナップショット。同意時点で消費者へ提示した内容を固定する
 * (body_repair_consents.explanation_json に保存)。後から案件が編集されても不変。
 */
export interface ConsentExplanationSnapshot {
  kind: BodyRepairConsentKind;
  shop: { name: string | null };
  vehicle: { maker: string | null; model: string | null; plate: string | null } | null;
  work: {
    planned: Record<string, unknown> | null;
    actual: Record<string, unknown> | null;
    deviation_reason: string | null;
  };
  fees: { estimate_amount: number | null; actual_amount: number | null };
  consent: { version: string; text: string; text_hash: string };
}

/** 説明スナップショットの正規化済み JSON 文字列 (document_hash 計算用)。 */
export function canonicalizeExplanation(snapshot: Omit<ConsentExplanationSnapshot, "consent">): string {
  return JSON.stringify(snapshot);
}
