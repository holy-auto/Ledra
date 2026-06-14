/**
 * メーカーのポータル受注回答を構造化する純関数 (壁3 隣接の安全ガード)。
 *
 * メーカーは受信トレイで [受注する] / [一部欠品] / [辞退] を選び、欠品時は行ごとに
 * 受注数量を入力する。この純関数はその入力を検証し、行ごとの受注/欠品数量と
 * 発注全体の回答ステータス (accepted/partial/declined) を確定させる。
 *
 * IO は持たない (DB 反映は API 層)。数量の整合 (受注 ≤ 発注、負数禁止) はここで担保し、
 * バックオーダー (欠品差分) を算出する。差分の再発注は自動化しない (人の承認)。
 */
import type { SupplyDeclineReason, SupplyPartnerResponse } from "@/types/supply";

/** メーカーが選ぶ操作。 */
export type PortalResponseAction = "accept" | "partial" | "decline";

/** 発注 1 行の入力 (受注数量はメーカーが回答)。 */
export interface PortalResponseLineInput {
  itemId: string;
  /** 発注された数量 (発注書の確定値)。 */
  orderedQuantity: number;
  /** メーカーが受ける数量 (partial 時のみ参照。未指定は orderedQuantity 扱い)。 */
  acceptedQuantity?: number | null;
}

export interface PortalResponseInput {
  action: PortalResponseAction;
  lines: PortalResponseLineInput[];
  /** 辞退時に必須。 */
  declineReason?: SupplyDeclineReason | null;
}

/** 確定した 1 行の回答。 */
export interface PortalResponseLine {
  itemId: string;
  acceptedQuantity: number;
  backorderQuantity: number;
}

export type PortalResponseDenyReason =
  | "empty_order"
  | "invalid_ordered_quantity"
  | "negative_accepted_quantity"
  | "accepted_exceeds_ordered"
  | "partial_all_zero" // 全数 0 は辞退で表現する
  | "decline_reason_required";

export type PortalResponseResult =
  | {
      ok: true;
      response: SupplyPartnerResponse;
      declineReason: SupplyDeclineReason | null;
      lines: PortalResponseLine[];
      /** 受注分の数量合計 / 欠品分の数量合計 (UI 表示・集計用)。 */
      totalAccepted: number;
      totalBackorder: number;
    }
  | { ok: false; reason: PortalResponseDenyReason };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * メーカーの回答を検証して構造化する。1 つでも不整合があれば ok=false。
 * accept/decline は数量を機械的に確定し、partial は行ごとの受注数量から
 * 実態に即した response (全量受注なら accepted に格上げ等) を導出する。
 */
export function computePortalResponse(input: PortalResponseInput): PortalResponseResult {
  if (!input.lines || input.lines.length === 0) {
    return { ok: false, reason: "empty_order" };
  }
  for (const l of input.lines) {
    if (!isFiniteNumber(l.orderedQuantity) || l.orderedQuantity <= 0) {
      return { ok: false, reason: "invalid_ordered_quantity" };
    }
  }

  // 辞退: 全行を欠品 (受注 0) として確定。理由は必須。
  if (input.action === "decline") {
    if (!input.declineReason) return { ok: false, reason: "decline_reason_required" };
    const lines = input.lines.map((l) => ({
      itemId: l.itemId,
      acceptedQuantity: 0,
      backorderQuantity: l.orderedQuantity,
    }));
    return {
      ok: true,
      response: "declined",
      declineReason: input.declineReason,
      lines,
      totalAccepted: 0,
      totalBackorder: lines.reduce((s, l) => s + l.backorderQuantity, 0),
    };
  }

  // 全量受注: 受注数量 = 発注数量、欠品なし。
  if (input.action === "accept") {
    const lines = input.lines.map((l) => ({
      itemId: l.itemId,
      acceptedQuantity: l.orderedQuantity,
      backorderQuantity: 0,
    }));
    return {
      ok: true,
      response: "accepted",
      declineReason: null,
      lines,
      totalAccepted: lines.reduce((s, l) => s + l.acceptedQuantity, 0),
      totalBackorder: 0,
    };
  }

  // 一部欠品: 行ごとの受注数量を検証し、欠品差分を算出。
  const lines: PortalResponseLine[] = [];
  for (const l of input.lines) {
    const accepted = isFiniteNumber(l.acceptedQuantity) ? l.acceptedQuantity : l.orderedQuantity;
    if (accepted < 0) return { ok: false, reason: "negative_accepted_quantity" };
    if (accepted > l.orderedQuantity) return { ok: false, reason: "accepted_exceeds_ordered" };
    lines.push({
      itemId: l.itemId,
      acceptedQuantity: accepted,
      backorderQuantity: l.orderedQuantity - accepted,
    });
  }
  const totalAccepted = lines.reduce((s, l) => s + l.acceptedQuantity, 0);
  const totalBackorder = lines.reduce((s, l) => s + l.backorderQuantity, 0);

  // 実態に即して response を格上げ/差し戻し:
  //   全量受注なら accepted、全数 0 は辞退で表現させる (partial_all_zero)。
  if (totalAccepted === 0) return { ok: false, reason: "partial_all_zero" };
  const response: SupplyPartnerResponse = totalBackorder === 0 ? "accepted" : "partial";
  return { ok: true, response, declineReason: null, lines, totalAccepted, totalBackorder };
}
