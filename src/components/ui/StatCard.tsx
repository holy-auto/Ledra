import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  caption?: string;
  className?: string;
}

export default function StatCard({ label, value, caption, className = "" }: StatCardProps) {
  return (
    <div className={`glass-card p-5 ${className}`}>
      <span className="section-tag">{label}</span>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-primary">{value}</div>
      {caption && <p className="mt-1 text-xs text-muted">{caption}</p>}
    </div>
  );
}
