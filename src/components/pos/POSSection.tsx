"use client";

import type { ReactNode } from "react";

/**
 * POSSection
 * ------------------------------------------------------------
 * 店頭モード画面で使うセクション見出しユーティリティ。
 *   - 見出しサイズ・余白・アクション領域を統一し、POS 画面全体の
 *     UI を一貫させる。
 *   - children が実コンテンツ (巨大ボタン群、カンバン、リスト等)。
 */

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** 余白を詰めたい場合 true */
  compact?: boolean;
};

export default function POSSection({ title, description, action, children, compact = false }: Props) {
  return (
    <section className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight text-primary">{title}</h2>
          {description && <p className="mt-0.5 text-[12px] text-secondary">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
