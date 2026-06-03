/**
 * 部品装着の content_hash（確定署名の対象）とシリアル・フィンガープリント。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.2 / §6.4.3
 *
 * content_hash = sha256(canonical_manifest)
 *   canonical_manifest は装着内容＋全 evidence の sha256 一覧＋顧客識別＋確定時刻＋nonce を
 *   RFC 8785(JCS) で正準化したもの。写真や数量を後から差し替えると hash が一致しなくなり、
 *   DB の確定ゲート（§6.4.4）で customer_verified への遷移が拒否される。
 *
 * スキーマ版 `ledra-part-v1` は固定。正準形を変えるときは必ず版を上げること
 * （過去の確定署名が検証不能になるため）。
 */

import crypto from "crypto";
import { canonicalize, sha256Hex } from "@/lib/anchoring/certificateHashing";

export const PART_MANIFEST_SCHEMA_VERSION = "ledra-part-v1";

/** 装着 content_hash の素となる入力。サーバが保持する確定情報のみで構成する。 */
export interface PartManifestInput {
  tenantId: string;
  installationId: string;
  vehicleId?: string | null;
  jobOrderId?: string | null;
  customerId?: string | null;
  /** 顧客の電話フル番号ハッシュ（本人を署名対象に縛る）。null 可。 */
  customerPhoneFullHash?: string | null;

  partName: string;
  gtin?: string | null;
  lotCode?: string | null;
  /** 生シリアルは載せない。フィンガープリント（HMAC）のみを署名対象に含める。 */
  serialFingerprint?: string | null;
  partKind: "serialized" | "lot_only" | "consumable" | "high_value";
  quantity: number;
  unit: string;
  amountJpy?: number | null;

  /** 各 evidence の sha256。順序非依存にするため内部でソートする。 */
  evidenceSha256: string[];

  /** ISO8601。確定時刻（署名時に固定）。 */
  installedAt: string;
  /** リプレイ封じのワンタイム値。 */
  nonce: string;
}

/**
 * 正準マニフェストのプレーンオブジェクトを構築する。
 * キーは canonicalize 側で辞書順ソートされるが、配列(evidence)はここで明示的にソートする。
 */
export function buildPartManifest(input: PartManifestInput): Record<string, unknown> {
  if (!Number.isFinite(input.quantity)) {
    throw new Error("buildPartManifest: quantity must be a finite number");
  }
  return {
    schema: PART_MANIFEST_SCHEMA_VERSION,
    tenant_id: input.tenantId,
    installation_id: input.installationId,
    vehicle_id: input.vehicleId ?? null,
    job_order_id: input.jobOrderId ?? null,
    customer_id: input.customerId ?? null,
    customer_phone_full_hash: input.customerPhoneFullHash ?? null,
    part: {
      name: input.partName,
      gtin: input.gtin ?? null,
      lot_code: input.lotCode ?? null,
      serial_fingerprint: input.serialFingerprint ?? null,
      part_kind: input.partKind,
      quantity: input.quantity,
      unit: input.unit,
      amount_jpy: input.amountJpy ?? null,
    },
    // 順序非依存・重複排除して決定的にする
    evidence_sha256: [...new Set(input.evidenceSha256)].sort(),
    installed_at: input.installedAt,
    nonce: input.nonce,
  };
}

/** content_hash（hex SHA-256）を計算する。 */
export function computePartContentHash(input: PartManifestInput): string {
  return sha256Hex(canonicalize(buildPartManifest(input)));
}

/**
 * シリアル全体横断レジストリ用フィンガープリント。
 *
 * HMAC-SHA256( "v1|" + gtin + "|" + serial , PARTS_SERIAL_PEPPER )。
 * 生シリアルは保存・送信せず、このフィンガープリントのみを part_serial_registry に登録する
 * （テナント横断で「使い回し」を衝突検知しつつ、他テナントへ生値を開示しない）。
 *
 * gtin が無い部品は serial 単独で算出（同一メーカー内の一意性に依存）。
 */
export function serialFingerprint(gtin: string | null | undefined, serial: string): string {
  const pepper = process.env.PARTS_SERIAL_PEPPER;
  if (!pepper) throw new Error("Missing PARTS_SERIAL_PEPPER");
  const normalizedSerial = serial.trim().toUpperCase();
  if (!normalizedSerial) throw new Error("serialFingerprint: empty serial");
  const normalizedGtin = (gtin ?? "").trim();
  return crypto.createHmac("sha256", pepper).update(`v1|${normalizedGtin}|${normalizedSerial}`, "utf8").digest("hex");
}

/**
 * 税込品目金額から part_kind / required_assurance を導出する（§6.4.1）。
 * - serialized は常に customer_otp
 * - 税込金額 > しきい値(既定10万円) は high_value ＝ customer_otp
 * - lot_only は store_contact_otp 以上
 * - consumable は any
 */
export const HIGH_VALUE_THRESHOLD_JPY_DEFAULT = 100_000;

export function deriveRequiredAssurance(
  partKind: PartManifestInput["partKind"],
  amountJpy: number | null | undefined,
  thresholdJpy: number = HIGH_VALUE_THRESHOLD_JPY_DEFAULT,
): "customer_otp" | "store_contact_otp" | "any" {
  if (partKind === "serialized" || partKind === "high_value") return "customer_otp";
  if (typeof amountJpy === "number" && amountJpy > thresholdJpy) return "customer_otp";
  if (partKind === "lot_only") return "store_contact_otp";
  return "any";
}
