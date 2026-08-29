import Link from "next/link";
import { tilesFromSignals, type TodaySignals } from "@/lib/admin/fetchTodaySignals";
import NextActionCard from "@/components/ui/NextActionCard";
import type { Severity } from "@/lib/domain/states";
import type { TaskTile } from "@/lib/admin/todayTasks";

/**
 * ダッシュボード NEXT ACTION セクション（IMP-021 / v2.0 §5.3）。
 *
 * 今日のタスクタイル（決定論ベース）から最優先の 1 件を抽出し、
 * NextActionCard プリミティブに流し込む。
 *
 * ponytail: 新しい DB クエリは作らず、既存の fetchTodaySignals → tilesFromSignals を再利用。
 * タイルの priority ソートは todayTasks.ts で確定済み。最上位タイルがそのまま NEXT ACTION。
 */

export const TONE_TO_SEVERITY: Record<TaskTile["tone"], Severity> = {
  urgent: "CRITICAL",
  warn: "HIGH",
  normal: "ACTION",
};

// タイル ID → CTA ラベル。必要最小限のアクション動詞だけ。
const CTA_LABELS: Partial<Record<TaskTile["id"], string>> = {
  in_progress_jobs: "作業一覧を確認",
  today_visits: "予約を確認",
  overdue_invoices: "請求一覧を確認",
  unpaid_invoices: "請求一覧を確認",
  expiring_certificates: "証明書を確認",
  churn_risk_customers: "顧客一覧を確認",
};

export function NextActionSectionSkeleton() {
  return (
    <div className="animate-pulse rounded-[var(--radius-lg)] border p-4">
      <div className="h-3 w-20 rounded bg-surface-hover" />
      <div className="mt-3 h-6 w-48 rounded bg-surface-hover" />
      <div className="mt-2 h-4 w-64 rounded bg-surface-hover" />
    </div>
  );
}

export default function NextActionSection({ signals }: { signals: TodaySignals }) {
  const tiles = tilesFromSignals(signals);

  // タイルなし → 全部完了。カードは出さない。
  if (tiles.length === 0) return null;

  const top = tiles[0];

  return (
    <NextActionCard
      title={top.label}
      reason={top.hint}
      severity={TONE_TO_SEVERITY[top.tone]}
      cta={
        <Link
          href={top.href}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
        >
          {CTA_LABELS[top.id] ?? "確認する"}
          <span aria-hidden="true">→</span>
        </Link>
      }
      secondary={
        tiles.length > 1 ? (
          <p className="text-small text-muted">他に {tiles.length - 1} 件のタスクがあります</p>
        ) : undefined
      }
    />
  );
}
