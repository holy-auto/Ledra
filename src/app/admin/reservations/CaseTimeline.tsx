"use client";

import Link from "next/link";
import type { CaseStep, CaseStepState } from "@/lib/admin/caseTimeline";

const STATE_STYLE: Record<CaseStepState, { dot: string; label: string }> = {
  done: { dot: "bg-success text-white", label: "text-primary" },
  current: { dot: "bg-accent text-white", label: "text-primary font-semibold" },
  pending: { dot: "bg-border-subtle text-muted", label: "text-muted" },
  skipped: { dot: "bg-border-subtle text-muted", label: "text-muted line-through" },
};

/** 案件の連鎖タイムライン（予約→施工→証明書→請求→フォロー）を横型ステッパーで表示。 */
export default function CaseTimeline({ steps }: { steps: CaseStep[] }) {
  if (!steps?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const st = STATE_STYLE[s.state];
        const tile = (
          <div className="flex min-w-[88px] flex-col items-center rounded-lg border border-border-subtle px-2 py-2 text-center">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${st.dot}`}>
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className={`mt-1 text-xs ${st.label}`}>{s.label}</span>
            <span className="text-[10px] text-muted">{s.detail}</span>
          </div>
        );
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            {s.href ? (
              <Link href={s.href} className="transition hover:opacity-80">
                {tile}
              </Link>
            ) : (
              tile
            )}
            {i < steps.length - 1 && <span className="text-muted">→</span>}
          </div>
        );
      })}
    </div>
  );
}
