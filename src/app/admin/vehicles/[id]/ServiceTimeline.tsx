"use client";

import Link from "next/link";
import { formatDateTime } from "@/lib/format";

/**
 * ServiceTimeline
 * ------------------------------------------------------------
 * 車両詳細画面の統合サービス履歴タイムライン。
 *
 * - vehicle_histories (証明書発行・削除、顧客公開イベント)
 * - reservations (予約・来店・作業開始・完了)
 * を同じ時系列に並べ、「この車両にいつ何が起きたか」を
 * 1 本のタイムラインで俯瞰できるようにする。
 *
 * クライアントコンポーネントにしているのは、将来
 * タイプフィルタ (予約のみ / 証明書のみ) を実装しやすくするため。
 */

export type TimelineEvent = {
  /** 表示用 ID (重複しないよう kind+id の合成で生成) */
  key: string;
  /** イベント種別ラベル (UI バッジ) */
  kindLabel: string;
  /** バッジ色調 */
  kindVariant: "certificate" | "reservation" | "void" | "nfc" | "thickness" | "other";
  /** タイトル (一行要約) */
  title: string;
  /** 補足説明 */
  description?: string | null;
  /** 発生時刻 (ISO) */
  occurredAt: string;
  /** クリック遷移先 (任意) */
  href?: string;
};

const kindClass: Record<TimelineEvent["kindVariant"], string> = {
  certificate: "bg-success-dim text-success-text border-success/20",
  reservation: "bg-accent-dim text-accent-text border-accent/20",
  void: "bg-danger-dim text-danger-text border-danger/20",
  nfc: "bg-warning-dim text-warning-text border-warning/20",
  thickness: "bg-violet-dim text-violet-text border-violet/20",
  other: "bg-inset text-secondary border-border-default",
};

export default function ServiceTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-base p-8 text-center text-sm text-muted">
        履歴はまだありません。
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 pl-6 before:absolute before:left-2 before:top-1 before:bottom-1 before:w-px before:bg-border-default">
      {events.map((ev) => {
        const node = (
          <div
            className={`rounded-xl border bg-base p-4 transition-colors ${
              ev.href ? "hover:bg-surface-hover cursor-pointer" : ""
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${kindClass[ev.kindVariant]}`}
              >
                {ev.kindLabel}
              </span>
              <span className="text-xs text-muted">{formatDateTime(ev.occurredAt)}</span>
            </div>
            <div className="mt-2 text-sm font-medium text-primary">{ev.title}</div>
            {ev.description && <div className="mt-1 text-sm text-secondary whitespace-pre-wrap">{ev.description}</div>}
          </div>
        );

        return (
          <li key={ev.key} className="relative">
            <span className="absolute -left-[18px] top-4 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-base" />
            {ev.href ? (
              <Link href={ev.href} className="block no-underline">
                {node}
              </Link>
            ) : (
              node
            )}
          </li>
        );
      })}
    </ol>
  );
}
