import type { CSSProperties } from "react";

/**
 * CustomerRankBadge
 * ------------------------------------------------------------
 * 顧客ランクを小さな色付きチップで表示する再利用コンポーネント。
 * customer_rank_rules.badge_color (gray/yellow/blue/purple) を
 * テーマ対応の CSS 変数にマッピングする。
 *
 * - rank が null の場合は何も描画しない。
 */

interface RankLike {
  rank_name: string;
  badge_color: string | null;
}

interface Props {
  rank: RankLike | null;
  className?: string;
}

/** badge_color → { 背景, 文字色 } の CSS 変数マッピング */
const COLOR_STYLES: Record<string, CSSProperties> = {
  gray: { backgroundColor: "var(--bg-inset)", color: "var(--text-secondary)" },
  yellow: { backgroundColor: "var(--accent-amber-dim)", color: "var(--accent-amber-text)" },
  blue: { backgroundColor: "var(--accent-blue-dim)", color: "var(--accent-blue-text)" },
  purple: { backgroundColor: "var(--accent-violet-dim)", color: "var(--accent-violet-text)" },
};

export default function CustomerRankBadge({ rank, className = "" }: Props) {
  if (!rank) return null;
  const style = COLOR_STYLES[rank.badge_color ?? "gray"] ?? COLOR_STYLES.gray;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={style}
    >
      {rank.rank_name}
    </span>
  );
}
