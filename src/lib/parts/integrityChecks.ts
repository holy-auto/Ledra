/**
 * 部品装着エビデンスの自動インテグリティ検査（L7 の AI オートメーション）。
 *
 * 設計: docs/parts-installation-integrity-design.md §4 L7 / §6.1 part_integrity_findings
 *
 * 方針:
 *  - 現場工数ゼロ。装着写真を「撮るだけ」で、サーバが自動で矛盾・改ざんを検知して
 *    part_integrity_findings に記録する。
 *  - 既存の AI 写真改ざん検出 (src/lib/ai/photoTamperingCheck.ts) を再利用し、
 *    その判定を装着インテグリティの finding ルールにマッピングする。
 *  - 決定的チェック（シリアル使い回し・完全重複写真）はルールベースで即時。
 *  - DB 書き込みは呼び出し側（API ルート）に委ね、本モジュールは純粋に
 *    「検知結果 → finding 行」を生成する（テスト容易性のため）。
 */

import { auditPhotoTampering, type TamperingAuditResult, type TamperingFlag } from "@/lib/ai/photoTamperingCheck";

export type FindingRule =
  | "serial_reused"
  | "photo_duplicate"
  | "qty_mismatch"
  | "three_way_mismatch"
  | "context_mismatch"
  | "deepfake"
  | "photo_edited"
  | "timestamp_anomaly";

export type FindingSeverity = "info" | "warning" | "critical";

/** part_integrity_findings への 1 行（INSERT 用のプレーン形）。 */
export interface IntegrityFinding {
  installation_id: string;
  rule: FindingRule;
  severity: FindingSeverity;
  detail: Record<string, unknown>;
}

/** AI 写真フラグ → 装着インテグリティ・ルール/重大度のマッピング。 */
export function mapTamperingFlag(flag: TamperingFlag): { rule: FindingRule; severity: FindingSeverity } {
  switch (flag) {
    case "software_edited":
      return { rule: "photo_edited", severity: "critical" };
    case "duplicate_hash":
      return { rule: "photo_duplicate", severity: "critical" };
    case "vision_suspicious":
      return { rule: "photo_edited", severity: "critical" };
    case "exif_stripped":
      return { rule: "photo_edited", severity: "warning" };
    case "timestamp_future":
    case "timestamp_mismatch":
      return { rule: "timestamp_anomaly", severity: "warning" };
    case "gps_extreme":
      return { rule: "context_mismatch", severity: "warning" };
    default: {
      // 網羅性チェック（新フラグ追加時に型エラーで気づける）。判定は fail-open。
      flag satisfies never;
      return { rule: "context_mismatch", severity: "info" };
    }
  }
}

/**
 * AI 写真改ざん監査の結果を finding 行へ変換する（純関数）。
 * 同一 (rule) は重複排除し、最も重い severity を採用する。
 */
export function buildFindingsFromAudit(installationId: string, audit: TamperingAuditResult): IntegrityFinding[] {
  const severityRank: Record<FindingSeverity, number> = { info: 0, warning: 1, critical: 2 };
  const byRule = new Map<FindingRule, IntegrityFinding>();

  for (const photo of audit.results) {
    for (const flag of photo.flags) {
      const { rule, severity } = mapTamperingFlag(flag);
      const existing = byRule.get(rule);
      const detailEntry = {
        photo_index: photo.photoIndex,
        sha256: photo.sha256,
        flag,
        verdict: photo.verdict,
        vision_reason: photo.visionReason,
      };
      if (!existing) {
        byRule.set(rule, {
          installation_id: installationId,
          rule,
          severity,
          detail: { hits: [detailEntry] },
        });
      } else {
        (existing.detail.hits as unknown[]).push(detailEntry);
        if (severityRank[severity] > severityRank[existing.severity]) {
          existing.severity = severity;
        }
      }
    }
  }

  return [...byRule.values()];
}

/** シリアル使い回し（part_register_serial が 'reused' を返した）→ critical finding。 */
export function serialReusedFinding(installationId: string, serialFingerprint: string): IntegrityFinding {
  return {
    installation_id: installationId,
    rule: "serial_reused",
    severity: "critical",
    detail: { serial_fingerprint: serialFingerprint, note: "同一シリアルが既に他装着で消費済み" },
  };
}

/**
 * 装着写真のオーケストレーション。
 * 既存 AI 監査を呼び、finding 行を返す（DB 書き込みは呼び出し側）。
 */
export async function runEvidenceIntegrityChecks(
  installationId: string,
  photoBuffers: Array<{ buffer: ArrayBuffer; contentType: string }>,
  opts: { useVision?: boolean } = {},
): Promise<IntegrityFinding[]> {
  const audit = await auditPhotoTampering(photoBuffers, new Date(), opts);
  return buildFindingsFromAudit(installationId, audit);
}
