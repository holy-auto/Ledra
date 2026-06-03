/**
 * 三方照合（納品 ↔ 請求 ↔ 装着）と数量突合の純粋ロジック（L3）。
 *
 * 設計: docs/parts-installation-integrity-design.md §4 L3 / §6.1 part_integrity_findings
 *
 * ここは DB I/O を持たない純関数。呼び出し側（service）が
 *  - 納品書OCR結果（evidence.ocr_extracted）
 *  - 請求/発注（purchase_orders・documents）
 *  - 装着（part_installations）/ 在庫消費（inventory_movements）
 * を集めてこの関数に渡し、返ってきた不一致を part_integrity_findings に記録する。
 */

import type { FindingRule, FindingSeverity } from "@/lib/parts/integrityChecks";

/** 照合に使う最小限の明細表現（出所をまたいで正規化したもの）。 */
export interface LineItem {
  /** GTIN または品番。突合キー。 */
  key: string;
  /** 数量。 */
  quantity: number;
  /** 税込金額（任意）。 */
  amountJpy?: number | null;
  /** 表示用ラベル（任意）。 */
  label?: string | null;
}

export interface ReconciliationFinding {
  rule: FindingRule;
  severity: FindingSeverity;
  detail: Record<string, unknown>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 数量突合: 「納品(in) ≥ 装着(out)」かつ「装着 = 請求」を検査する。
 * - 装着数 > 納品数 → 仕入れていない物を装着＝critical（qty_mismatch）
 * - 請求数 ≠ 装着数 → 過大/過少請求＝warning（qty_mismatch）
 */
export function reconcileQuantity(args: {
  key: string;
  deliveredQty: number | null;
  installedQty: number;
  billedQty?: number | null;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const { key, deliveredQty, installedQty, billedQty } = args;

  if (deliveredQty != null && round2(installedQty) > round2(deliveredQty)) {
    findings.push({
      rule: "qty_mismatch",
      severity: "critical",
      detail: {
        key,
        kind: "installed_exceeds_delivered",
        installed: installedQty,
        delivered: deliveredQty,
        note: "納品数を超える装着（仕入れていない部品の装着疑い）",
      },
    });
  }

  if (billedQty != null && round2(billedQty) !== round2(installedQty)) {
    findings.push({
      rule: "qty_mismatch",
      severity: "warning",
      detail: {
        key,
        kind: "billed_ne_installed",
        billed: billedQty,
        installed: installedQty,
        note: "請求数と装着数の不一致",
      },
    });
  }

  return findings;
}

/**
 * 三方照合: 装着した部品（key）が、納品書・請求のいずれにも整合して存在するか。
 * - 納品書に無い → 仕入れ記録なしに装着＝critical
 * - 請求に無い → 装着したが請求されていない＝info（粗利/記録漏れの可能性）
 * - 金額が請求と乖離（しきい値超）→ warning
 */
export function threeWayMatch(args: {
  installed: LineItem;
  deliveryLines: LineItem[];
  billedLines: LineItem[];
  /** 金額乖離の許容率（既定 5%）。 */
  amountTolerance?: number;
}): ReconciliationFinding[] {
  const { installed, deliveryLines, billedLines, amountTolerance = 0.05 } = args;
  const findings: ReconciliationFinding[] = [];

  const delivered = deliveryLines.find((l) => l.key === installed.key);
  const billed = billedLines.find((l) => l.key === installed.key);

  if (!delivered) {
    findings.push({
      rule: "three_way_mismatch",
      severity: "critical",
      detail: {
        key: installed.key,
        kind: "missing_in_delivery",
        note: "装着部品が納品書に存在しない（仕入れ記録なし）",
      },
    });
  }

  if (!billed) {
    findings.push({
      rule: "three_way_mismatch",
      severity: "info",
      detail: {
        key: installed.key,
        kind: "missing_in_billing",
        note: "装着部品が請求に存在しない",
      },
    });
  }

  if (
    billed &&
    typeof billed.amountJpy === "number" &&
    typeof installed.amountJpy === "number" &&
    billed.amountJpy > 0
  ) {
    const diffRate = Math.abs(installed.amountJpy - billed.amountJpy) / billed.amountJpy;
    if (diffRate > amountTolerance) {
      findings.push({
        rule: "three_way_mismatch",
        severity: "warning",
        detail: {
          key: installed.key,
          kind: "amount_divergence",
          installed_amount: installed.amountJpy,
          billed_amount: billed.amountJpy,
          diff_rate: round2(diffRate),
          note: "装着金額と請求金額の乖離",
        },
      });
    }
  }

  return findings;
}
