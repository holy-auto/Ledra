/**
 * certificate_versions（②version-forward Phase 1）の内容スナップショット構築 + ハッシュ。
 *
 * 証明書の「内容(substantive content)」フィールドだけを安定した形で取り出し、その canonical
 * JSON を SHA-256 して content_hash にする。ハッシュ器は anchoring の certificateHashing を
 * 再利用し、正規化ロジックを二重実装しない。
 *
 * PII(customer_name / vehicle_info_json 等)を含むのは意図的 —— これは証明書内容そのものの
 * 完全スナップショットであり、消去権(crypto-shredding)は行の物理削除で対応する（DB 側は
 * certificate_versions を ON DELETE CASCADE + DELETE 許可で設計）。
 */

import { canonicalize, sha256Hex } from "@/lib/anchoring/certificateHashing";

/**
 * スナップショット対象の内容フィールド（実体のある内容のみ。footer/logo/design 等の
 * 表示専用フィールドは含めない）。certificates の列名と一致させる。
 */
export const CERT_VERSION_CONTENT_FIELDS = [
  "customer_name",
  "vehicle_info_json",
  "content_free_text",
  "content_preset_json",
  "service_type",
  "expiry_type",
  "expiry_value",
  "expiry_date",
  "warranty_period_end",
  "maintenance_date",
  "warranty_exclusions",
  "remarks",
  "coating_products_json",
  "ppf_coverage_json",
  "maintenance_json",
  "body_repair_json",
  "accessory_json",
  "certificate_no",
] as const;

/**
 * certificate 行(またはそれ相当)から内容スナップショットを構築する。
 * null / undefined のフィールドは省略する（「値なし」を安定表現にし、後日フィールドが
 * 増えても既存ハッシュが動かないようにする）。
 */
export function buildVersionContent(cert: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const field of CERT_VERSION_CONTENT_FIELDS) {
    const value = cert[field];
    if (value !== undefined && value !== null) {
      content[field] = value;
    }
  }
  return content;
}

/** content の canonical JSON(RFC8785 サブセット)を SHA-256 した 64hex。 */
export function computeVersionContentHash(content: Record<string, unknown>): string {
  return sha256Hex(canonicalize(content));
}

export interface CertificateVersionRow {
  certificate_id: string;
  tenant_id: string;
  version: number;
  content: Record<string, unknown>;
  content_hash: string;
  change_reason: string | null;
  created_by: string | null;
}

/**
 * certificate 行 + 版番号から、certificate_versions への INSERT 行を組み立てる。
 * content_hash も同時に計算するので、呼び出し側はそのまま insert すればよい。
 */
export function buildCertificateVersionRow(args: {
  cert: Record<string, unknown>;
  certificateId: string;
  tenantId: string;
  version: number;
  createdBy: string | null;
  changeReason: string | null;
}): CertificateVersionRow {
  const content = buildVersionContent(args.cert);
  return {
    certificate_id: args.certificateId,
    tenant_id: args.tenantId,
    version: args.version,
    content,
    content_hash: computeVersionContentHash(content),
    change_reason: args.changeReason,
    created_by: args.createdBy,
  };
}
