import type { ReactNode } from "react";

interface PageHeaderProps {
  tag: string;
  title: string;
  /**
   * タイトル右に密着させる補助情報（StatusBadge・件数・所属・納期など）。任意。
   * title + meta は `inline-flex { gap: 10px }` のクラスタにまとめる（負マージン禁止）。
   */
  meta?: ReactNode;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({ tag, title, meta, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div className="space-y-1">
        <span className="text-[11px] font-medium tracking-[0.12em] text-secondary uppercase">{tag}</span>
        <div className="inline-flex flex-wrap items-center gap-2.5">
          <h1 className="text-[28px] font-semibold tracking-tight text-primary leading-tight">{title}</h1>
          {meta != null && <div className="inline-flex items-center gap-2">{meta}</div>}
        </div>
        {description && <p className="text-[14px] text-secondary leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
