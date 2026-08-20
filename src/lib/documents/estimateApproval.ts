/**
 * IMP-043: 見積承認スナップショットと版管理。
 *
 * 現状: 見積書(estimate)は status=accepted で「受理」だが、
 * 承認時点の金額・明細を凍結する仕組みがない。承認後に見積を編集すると
 * 顧客が承認した金額と実際の金額が乖離する。
 *
 * 本モジュールは見積承認のスナップショット型と差分検出の純関数を提供する。
 * DB 列追加（documents.approval_snapshot jsonb）は消費タスクで実施。
 *
 * ponytail: 型と純関数のみ。IO なし。IMP-042 の WorkflowSnapshot と同パターン。
 */

import type { DocumentItem, DocType } from "@/types/document";

// ── 型 ──

/**
 * 顧客が見積を承認した時点のスナップショット。
 *
 * documents.approval_snapshot (jsonb) に格納する想定。
 * 承認後の見積編集は「改定」扱いとなり、顧客への再承認が必要になる。
 */
export interface EstimateApprovalSnapshot {
  /** 承認時の明細。 */
  items: DocumentItem[];
  /** 承認時の小計（税抜）。 */
  subtotal: number;
  /** 承認時の税額。 */
  tax: number;
  /** 承認時の合計（税込）。 */
  total: number;
  /** 承認時の税率。 */
  taxRate: number;
  /** 承認時刻（ISO 8601）。 */
  approvedAt: string;
  /** 承認者の識別子（顧客メール、顧客ID、署名URL トークン等）。 */
  approvedBy: string;
  /** 承認方法。 */
  approvalMethod: EstimateApprovalMethod;
  /** 版番号（1 = 初回承認、2 = 再承認...）。 */
  version: number;
}

/** 見積承認方法。 */
export type EstimateApprovalMethod =
  /** 署名 URL 経由の顧客自身の承認。 */
  | "customer_web"
  /** 口頭・電話等の確認（管理者による代理承認記録）。 */
  | "verbal_confirmation"
  /** メール・LINE 返信での承認。 */
  | "message_reply";

/**
 * 見積改定の差分。
 *
 * 承認後に見積を編集した場合の差分を表す。
 * 管理画面で「承認済み金額と現在の金額が異なります」等の警告表示に使用。
 */
export interface EstimateRevisionDiff {
  /** 改定前（承認済み）の合計。 */
  approvedTotal: number;
  /** 現在の合計。 */
  currentTotal: number;
  /** 差額（current - approved。正=増額、負=減額）。 */
  difference: number;
  /** 差額率（%）。 */
  differenceRate: number;
  /** 追加された明細。 */
  addedItems: DocumentItem[];
  /** 削除された明細。 */
  removedItems: DocumentItem[];
  /** 金額が変更された明細。 */
  modifiedItems: EstimateItemDiff[];
  /** 変更があるか。 */
  hasChanges: boolean;
  /** 再承認が必要か（金額変更 or 明細追加/削除）。 */
  requiresReapproval: boolean;
}

/** 明細の変更差分。 */
export interface EstimateItemDiff {
  description: string;
  oldAmount: number;
  newAmount: number;
  oldQuantity: number;
  newQuantity: number;
  oldUnitPrice: number;
  newUnitPrice: number;
}

// ── 純関数 ──

/**
 * 見積の現在の状態からスナップショットを作成する。
 *
 * 顧客が estimate を accept した時点で呼び、
 * documents.approval_snapshot に保存する想定。
 */
export function createApprovalSnapshot(
  doc: {
    items_json: DocumentItem[];
    subtotal: number;
    tax: number;
    total: number;
    tax_rate: number;
  },
  approvedBy: string,
  method: EstimateApprovalMethod,
  version: number = 1,
): EstimateApprovalSnapshot {
  return {
    // deep copy — 後の編集がスナップショットに影響しないように
    items: doc.items_json.map((item) => ({ ...item })),
    subtotal: doc.subtotal,
    tax: doc.tax,
    total: doc.total,
    taxRate: doc.tax_rate,
    approvedAt: new Date().toISOString(),
    approvedBy,
    approvalMethod: method,
    version,
  };
}

/**
 * 承認済みスナップショットと現在の見積を比較し、差分を返す。
 *
 * description をキーとして明細を照合する。
 * 管理画面で「承認済み金額から ¥X 変更されています」等の警告に使用。
 *
 * ponytail: description が重複する明細（同一品目名で数量・単価違い等）は
 * 後勝ちで上書きされ差分が欠落する。DocumentItem に id が追加されたら
 * id ベースの照合に切り替える。現状の見積 UI は同一 description の重複を
 * 許容していないため実害は低い。
 */
export function diffEstimateRevision(
  snapshot: EstimateApprovalSnapshot,
  current: {
    items_json: DocumentItem[];
    subtotal: number;
    tax: number;
    total: number;
  },
): EstimateRevisionDiff {
  const approvedMap = new Map<string, DocumentItem>();
  for (const item of snapshot.items) {
    if (item.item_type === "heading" || item.item_type === "subtotal") continue;
    approvedMap.set(item.description, item);
  }

  const currentMap = new Map<string, DocumentItem>();
  for (const item of current.items_json) {
    if (item.item_type === "heading" || item.item_type === "subtotal") continue;
    currentMap.set(item.description, item);
  }

  const addedItems: DocumentItem[] = [];
  const removedItems: DocumentItem[] = [];
  const modifiedItems: EstimateItemDiff[] = [];

  // removed: approved にあって current にないもの
  for (const [desc, item] of approvedMap) {
    if (!currentMap.has(desc)) {
      removedItems.push(item);
    }
  }

  // added / modified: current にあるもの
  for (const [desc, curr] of currentMap) {
    const prev = approvedMap.get(desc);
    if (!prev) {
      addedItems.push(curr);
      continue;
    }

    // 金額・数量・単価のいずれかが変わったら modified
    if (prev.amount !== curr.amount || prev.quantity !== curr.quantity || prev.unit_price !== curr.unit_price) {
      modifiedItems.push({
        description: desc,
        oldAmount: prev.amount,
        newAmount: curr.amount,
        oldQuantity: prev.quantity,
        newQuantity: curr.quantity,
        oldUnitPrice: prev.unit_price,
        newUnitPrice: curr.unit_price,
      });
    }
  }

  const difference = current.total - snapshot.total;
  const differenceRate = snapshot.total !== 0 ? Math.round((difference / snapshot.total) * 100) : 0;

  const hasChanges = addedItems.length > 0 || removedItems.length > 0 || modifiedItems.length > 0;

  // 再承認が必要: 金額変更 or 明細構成変更
  const requiresReapproval = hasChanges || current.total !== snapshot.total;

  return {
    approvedTotal: snapshot.total,
    currentTotal: current.total,
    difference,
    differenceRate,
    addedItems,
    removedItems,
    modifiedItems,
    hasChanges,
    requiresReapproval,
  };
}

/**
 * 帳票が見積承認スナップショットを持てる帳票種別か判定する。
 *
 * ponytail: 現時点では estimate のみ。発注書等に拡張する場合はここに追加。
 */
export function isApprovalTrackable(docType: DocType | string): boolean {
  return docType === "estimate";
}

/**
 * 見積変換時（estimate → invoice 等）に承認済み金額を引き継ぐべきか判定する。
 *
 * 合計額の一致のみで判定する軽量ゲート。明細構成の精密な差分チェックには
 * diffEstimateRevision() を使用する。合計が一致していれば変換フローを
 * ブロックしない設計（明細入替は diffEstimateRevision で警告表示）。
 */
export function shouldCarryApproval(
  snapshot: EstimateApprovalSnapshot | null | undefined,
  currentTotal: number,
): boolean {
  if (!snapshot) return false;
  return snapshot.total === currentTotal;
}
