import { businessDateString, type TodaySignals } from "@/lib/admin/fetchTodaySignals";
import ProgressCard from "@/components/ui/ProgressCard";

/**
 * 今日の進捗カード（IMP-021 / v2.0 §5.2）。
 *
 * 今日の予約（来店 + 作業中）のうち完了済みの割合を ProgressCard で表示する。
 * fetchTodaySignals の reservations から導出。新クエリなし。
 *
 * ponytail: scope="mine" は担当案件のみ。予約ゼロなら非表示。
 */

export function TodayProgressCardSkeleton() {
  return (
    <div className="glass-card animate-pulse flex items-center justify-between gap-4 p-5">
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-surface-hover" />
        <div className="h-8 w-20 rounded bg-surface-hover" />
      </div>
      <div className="h-[72px] w-[72px] rounded-full bg-surface-hover" />
    </div>
  );
}

export default function TodayProgressCard({
  signals,
  scope = "tenant",
}: {
  signals: TodaySignals;
  scope?: "tenant" | "mine";
}) {
  const today = businessDateString(signals.now);

  // 今日の予約（キャンセル除外）
  const todayReservations = signals.reservations.filter((r) => r.scheduled_date === today && r.status !== "cancelled");

  // 作業中（日付問わず）も含めて「今日のタスク」とする
  const inProgress = signals.reservations.filter((r) => r.status === "in_progress" && r.scheduled_date !== today);
  const total = todayReservations.length + inProgress.length;

  if (total === 0) return null;

  const completed = todayReservations.filter((r) => r.status === "completed").length;

  return (
    <ProgressCard
      label="今日の進捗"
      completed={completed}
      total={total}
      caption={scope === "mine" ? "あなた担当の案件" : undefined}
    />
  );
}
