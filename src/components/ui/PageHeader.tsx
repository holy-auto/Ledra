import type { ReactNode } from "react";

interface PageHeaderProps {
  tag: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({ tag, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div className="space-y-1">
        <span className="text-[11px] font-medium tracking-[0.12em] text-secondary uppercase">
          {tag}
        </span>
        <h1 className="text-[28px] font-semibold tracking-tight text-primary leading-tight">{title}</h1>
        {description && <p className="text-[14px] text-secondary leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
