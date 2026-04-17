"use client";

import { formatDateTime } from "@/lib/format";

type Change = {
  field: string;
  label: string;
  old: unknown;
  new: unknown;
};

type HistoryEntry = {
  id: string;
  version: number;
  changes: Change[];
  edited_by: string | null;
  editor_email: string | null;
  created_at: string;
};

type Props = {
  entries: HistoryEntry[];
};

function formatValue(val: unknown): string {
  if (val == null || val === "") return "(空)";
  if (typeof val === "object") {
    // For JSON objects like vehicle_info_json, show key fields
    const obj = val as Record<string, unknown>;
    const parts = Object.entries(obj)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${v}`);
    return parts.length > 0 ? parts.join(", ") : "(空)";
  }
  return String(val);
}

export default function CertEditHistory({ entries }: Props) {
  if (entries.length === 0) {
    return <div className="rounded-xl bg-base p-4 text-sm text-muted">編集履歴はありません。</div>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-xl border border-border-default bg-base p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                v{entry.version}
              </span>
              {entry.editor_email && <span className="text-xs text-muted">{entry.editor_email}</span>}
            </div>
            <span className="text-xs text-muted">{formatDateTime(entry.created_at)}</span>
          </div>

          <div className="space-y-2">
            {(entry.changes as Change[]).map((change, i) => (
              <div key={i} className="rounded-lg bg-surface p-3 text-sm">
                <div className="font-medium text-secondary text-xs mb-1.5">{change.label}</div>
                <div className="grid gap-1.5 md:grid-cols-2">
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold bg-red-100 text-red-600">
                      -
                    </span>
                    <span className="text-xs text-muted break-all whitespace-pre-wrap">{formatValue(change.old)}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold bg-success-dim text-success-text">
                      +
                    </span>
                    <span className="text-xs text-primary break-all whitespace-pre-wrap">
                      {formatValue(change.new)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
