/**
 * 予約ステータスの表示構成を一元管理する (IMP-022)。
 *
 * 既存の reservations.status 5 値に対する UI ラベル・配色・Badge variant を
 * 単一定義源として提供する。ReservationsClient / CalendarView / JobStatusPanel
 * の各 STATUS_CONFIG を置き換える。
 *
 * ponytail: 正準 JobState 12 値への DB 移行は行わない (ADR-0002)。
 * ここでは実在する 5 値の表示だけを統一する。
 */

import type { BadgeVariant } from "@/lib/statusMaps";

/** DB に実在する reservations.status の 5 値。 */
export type ReservationStatus = "confirmed" | "arrived" | "in_progress" | "completed" | "cancelled";

export interface ReservationStatusDisplay {
  label: string;
  /** ステータスの説明テキスト (Job Hub のヒント行など)。 */
  hint: string;
  bg: string;
  text: string;
  dot: string;
  variant: BadgeVariant;
}

/**
 * 予約ステータス → 表示構成。全消費者がこれを参照する。
 * 配色は CalendarView / ReservationsClient の既存定義を統一したもの。
 */
export const RESERVATION_STATUS_DISPLAY: Record<ReservationStatus, ReservationStatusDisplay> = {
  confirmed: {
    label: "予約確定",
    hint: "予約を受け付けました。来店確認を待ちます。",
    bg: "bg-accent-dim",
    text: "text-accent-text",
    dot: "bg-accent",
    variant: "info",
  },
  arrived: {
    label: "来店・受付",
    hint: "お客様が来店しました。作業を開始してください。",
    bg: "bg-warning-dim",
    text: "text-warning-text",
    dot: "bg-warning",
    variant: "warning",
  },
  in_progress: {
    label: "作業中",
    hint: "作業中です。完了したら証明書発行 → 納車に進みます。",
    bg: "bg-violet-dim",
    text: "text-violet-text",
    dot: "bg-violet",
    variant: "violet",
  },
  completed: {
    label: "完了・納車",
    hint: "作業が完了しました。請求書発行 → 入金確認を行います。",
    bg: "bg-success-dim",
    text: "text-success-text",
    dot: "bg-success",
    variant: "success",
  },
  cancelled: {
    label: "キャンセル",
    hint: "この予約はキャンセルされています。",
    bg: "bg-inset",
    text: "text-secondary",
    dot: "bg-muted",
    variant: "danger",
  },
};

/** レガシーフロー (テンプレートなし) のステータス進行順。 */
export const RESERVATION_STATUS_FLOW = ["confirmed", "arrived", "in_progress", "completed"] as const;

/**
 * 安全な lookup。未知のステータス文字列にもフォールバックを返す。
 */
export function reservationStatusDisplay(status: string): ReservationStatusDisplay {
  return (
    RESERVATION_STATUS_DISPLAY[status as ReservationStatus] ?? {
      label: status,
      hint: "",
      bg: "bg-inset",
      text: "text-secondary",
      dot: "bg-muted",
      variant: "default" as BadgeVariant,
    }
  );
}
