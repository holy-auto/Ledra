/**
 * IMP-043: 帳票版管理（ADR-0004 準拠）。
 *
 * ADR-0004: 「訂正は上書きではなく版の追加」。
 * 証明書の版管理パターン（IMP-030 versionTransition.ts）を帳票にも適用。
 *
 * 現状: 帳票の編集は in-place 上書き。integrity_seal（documentSeal.ts）は
 * sent 時点のハッシュを保存するが、版履歴の追跡はない。
 *
 * 本モジュールは帳票の版追跡に必要な型と純関数を提供する。
 * DB テーブル（document_versions / document_corrections）の追加は消費タスク。
 *
 * ponytail: 型と純関数のみ。IO なし。
 */

import type { DocumentItem, DocType, DocumentStatus } from "@/types/document";
import type { DocumentCorrectionState } from "@/lib/domain/states";
import { DOCUMENT_CORRECTION_TRANSITIONS, isValidTransition } from "@/lib/domain/transitions";

// ── 型 ──

/**
 * 帳票の版レコード。
 *
 * 帳票が sent（確定）→ 編集のたびに版が増える。
 * ドラフト段階の編集は版管理の対象外（まだ確定していないため）。
 */
export interface DocumentVersion {
  /** 版番号（1 = 初版）。 */
  version: number;
  /** この版の内容ハッシュ（documentSeal.ts の contentHash と同形式）。 */
  contentHash: string;
  /** この版の合計額。 */
  total: number;
  /** この版の明細件数。 */
  itemCount: number;
  /** この版のステータス。 */
  status: DocumentStatus;
  /** 版作成日時（ISO 8601）。 */
  createdAt: string;
  /** 版を作成したユーザー ID。 */
  createdBy: string | null;
  /** 前版からの変更理由（自由記述）。 */
  changeReason?: string;
  /** この版が現行か。 */
  isCurrent: boolean;
}

/**
 * 帳票訂正リクエスト（ADR-0004 準拠）。
 *
 * 証明書の CorrectionRequest（IMP-030 correction.ts）と同パターン。
 * 確定済み帳票の修正は訂正リクエストを経由する。
 */
export interface DocumentCorrectionRequest {
  /** 訂正対象の帳票 ID。 */
  documentId: string;
  /** 訂正対象の版番号。 */
  targetVersion: number;
  /** 訂正カテゴリ。 */
  category: DocumentCorrectionCategory;
  /** 訂正内容の説明。 */
  description: string;
  /** 訂正後の金額（金額訂正の場合のみ）。 */
  correctedTotal?: number;
  /** 訂正後の明細（明細訂正の場合のみ）。 */
  correctedItems?: DocumentItem[];
  /** 訂正リクエストのステータス。 */
  status: DocumentCorrectionStatus;
  /** リクエスト者 ID。 */
  requestedBy: string;
  /** リクエスト日時。 */
  requestedAt: string;
  /** 承認者 ID。 */
  approvedBy?: string;
  /** 承認日時。 */
  approvedAt?: string;
}

/** 帳票訂正カテゴリ。 */
export type DocumentCorrectionCategory =
  /** 金額の誤り。 */
  | "amount_error"
  /** 明細項目の誤り（品目名、数量、単価）。 */
  | "item_error"
  /** 宛先情報の誤り。 */
  | "recipient_error"
  /** 税率・税額の誤り。 */
  | "tax_error"
  /** その他の誤り。 */
  | "other";

/**
 * 帳票訂正リクエストのステータス。
 *
 * 正準語彙は states.ts の DocumentCorrectionState（大文字）。
 * ここでは DB カラム値（小文字）の型エイリアスを提供する。
 */
export type DocumentCorrectionStatus = "pending" | "approved" | "rejected" | "applied";

// ── 純関数 ──

/**
 * 帳票が版管理の対象か判定する。
 *
 * ドラフト（未確定）は版管理の対象外。
 * sent 以降のステータスから版管理が開始される。
 */
export function isVersionTracked(status: DocumentStatus): boolean {
  return status !== "draft";
}

/**
 * 帳票が訂正可能か判定する。
 *
 * - paid / cancelled は訂正不可（確定済み）
 * - rejected は訂正不可（既に却下済み）
 * - draft は版管理対象外（自由編集可）
 * - sent / accepted / overdue は訂正可能
 */
export function isCorrectable(status: DocumentStatus): boolean {
  return status === "sent" || status === "accepted" || status === "overdue";
}

/**
 * 訂正リクエストの状態遷移が有効か判定する。
 *
 * 正準遷移表 (transitions.ts DOCUMENT_CORRECTION_TRANSITIONS) に委譲。
 * 小文字の DB 値を大文字の正準値に変換して判定する。
 *
 * 名前に注意: src/lib/certificates/correction.ts にも同名の関数が存在するが、
 * 別の状態集合（証明書は5状態・cancelled を含む、帳票は4状態）を扱う別物。
 * このモジュールからは isValidDocumentCorrectionStatusTransition としてのみ公開する。
 */
export function isValidDocumentCorrectionStatusTransition(
  from: DocumentCorrectionStatus,
  to: DocumentCorrectionStatus,
): boolean {
  return isValidTransition(
    DOCUMENT_CORRECTION_TRANSITIONS,
    from.toUpperCase() as DocumentCorrectionState,
    to.toUpperCase() as DocumentCorrectionState,
  );
}

/**
 * 2 つの版の金額差分を計算する。
 *
 * 管理画面で「前版から ¥X 増額」等の表示に使用。
 */
export function computeVersionDiff(
  prev: Pick<DocumentVersion, "total" | "itemCount">,
  curr: Pick<DocumentVersion, "total" | "itemCount">,
): {
  totalDifference: number;
  totalDifferenceRate: number;
  itemCountDifference: number;
} {
  const totalDiff = curr.total - prev.total;
  const rate = prev.total !== 0 ? Math.round((totalDiff / prev.total) * 100) : 0;
  return {
    totalDifference: totalDiff,
    totalDifferenceRate: rate,
    itemCountDifference: curr.itemCount - prev.itemCount,
  };
}

/**
 * 帳票種別が訂正ワークフローを経由すべきか判定する。
 *
 * 請求書系はインボイス制度（適格請求書）の要件で訂正の追跡が法的に必要。
 * 見積書は顧客承認額の保護のため、承認後は訂正ワークフローを経由すべき。
 *
 * ponytail: 領収書は POS 発行で直接 paid になるため現時点ではスキップ。
 */
const CORRECTION_REQUIRED_DOC_TYPES: ReadonlySet<string> = new Set([
  "invoice",
  "consolidated_invoice",
  "staff_invoice",
  "estimate",
]);

export function requiresCorrectionWorkflow(docType: DocType | string, status: DocumentStatus): boolean {
  if (!CORRECTION_REQUIRED_DOC_TYPES.has(docType)) return false;
  return isCorrectable(status);
}
