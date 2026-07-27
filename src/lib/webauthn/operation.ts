/**
 * WebAuthn 操作署名のペイロード構築 + ハッシュ(DB 非依存・単体テスト対象)。
 *
 * チャレンジ = この業務イベントの payload_hash とすることで、パスキー署名を
 * 「その操作(finalize/void/訂正/署名)」に暗号的にコミットさせる。payload には
 * サーバー生成のランダム nonce を含め、同一 op/cert/actor でもチャレンジが毎回一意
 * =リプレイ不可にする。ハッシュ器は anchoring の canonicalize/sha256Hex を再利用する。
 */

import crypto from "crypto";
import { canonicalize, sha256Hex } from "@/lib/anchoring/certificateHashing";

export type OperationType = "finalize" | "void" | "correction" | "signature";

export const OPERATION_TYPES: readonly OperationType[] = ["finalize", "void", "correction", "signature"];

export const OPERATION_PAYLOAD_VERSION = "ledra-op-v1";

export interface OperationPayloadInput {
  operationType: OperationType;
  tenantId: string;
  certificateId: string;
  actorId: string;
  /** サーバー生成の一度限りランダム値(freshness)。 */
  challengeNonce: string;
}

/** 署名対象の canonical ペイロードを構築する。 */
export function buildOperationPayload(input: OperationPayloadInput): Record<string, unknown> {
  return {
    version: OPERATION_PAYLOAD_VERSION,
    operation_type: input.operationType,
    tenant_id: input.tenantId,
    certificate_id: input.certificateId,
    actor_id: input.actorId,
    challenge_nonce: input.challengeNonce,
  };
}

/** payload の canonical JSON を SHA-256 した 64hex。これをチャレンジに使う。 */
export function computeOperationPayloadHash(payload: Record<string, unknown>): string {
  return sha256Hex(canonicalize(payload));
}

/** チャレンジ用の一度限りランダム nonce(base64url)。 */
export function newChallengeNonce(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** payload_hash(64hex) を WebAuthn チャレンジのバイト列へ(ArrayBuffer 裏付け)。 */
export function payloadHashToChallengeBytes(payloadHash: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(payloadHash, "hex");
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}
