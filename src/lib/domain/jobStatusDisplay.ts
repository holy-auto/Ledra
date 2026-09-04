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

/**
 * DB に実在する reservations.status の値。
 * 既存 5 値 + IMP-031 で追加予定の 3 値（DB マイグレーション前に表示定義を先行）。
 */
export type ReservationStatus =
  "confirmed" | "arrived" | "in_progress" | "completed" | "cancelled" | "paused" | "no_show" | "partially_completed";

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
  // ── IMP-031: 例外状態 ──
  paused: {
    label: "中断中",
    hint: "作業を中断しています。再開すると作業中に戻ります。",
    bg: "bg-warning-dim",
    text: "text-warning-text",
    dot: "bg-warning",
    variant: "warning",
  },
  no_show: {
    label: "来店なし",
    hint: "お客様が来店しませんでした。再予約またはキャンセルしてください。",
    bg: "bg-inset",
    text: "text-secondary",
    dot: "bg-muted",
    variant: "danger",
  },
  partially_completed: {
    label: "部分終了",
    hint: "一部工程が完了しました。残りの工程は後日対応します。",
    bg: "bg-accent-dim",
    text: "text-accent-text",
    dot: "bg-accent",
    variant: "info",
  },
};

/** レガシーフロー (テンプレートなし) のステータス進行順。 */
export const RESERVATION_STATUS_FLOW = ["confirmed", "arrived", "in_progress", "completed"] as const;

/**
 * `reservations.status` の DB CHECK 制約が現在許可している値（IMP-031 時点）。
 *
 * ponytail: paused/no_show/partially_completed は表示定義のみ先行実装済みだが、
 * DB マイグレーション未実施のため実データには存在しない。フィルタの選択肢等、
 * 実際の DB 値と突き合わせる UI はこの定数を使うこと（`RESERVATION_STATUS_DISPLAY`
 * を素で列挙すると、DB が絶対に一致しない選択肢を選べてしまう）。
 * 3値のマイグレーション実施時にこの配列も更新する。
 */
export const LIVE_RESERVATION_STATUSES = ["confirmed", "arrived", "in_progress", "completed", "cancelled"] as const;

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
