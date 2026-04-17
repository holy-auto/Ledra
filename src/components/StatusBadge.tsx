import type { CertificateStatus } from "@/types/certificate";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active:  { bg: "bg-success-dim border-success/30", text: "text-success-text", label: "有効" },
  void:    { bg: "bg-danger-dim border-danger/30",   text: "text-danger-text",  label: "無効" },
  expired: { bg: "bg-warning-dim border-warning/30", text: "text-warning-text", label: "期限切れ" },
  draft:   { bg: "bg-inset border-border-default",   text: "text-muted",        label: "下書き" },
};

export function CertificateStatusBadge({ status }: { status?: string | null }) {
  const key = String(status ?? "").toLowerCase() as CertificateStatus;
  const s = STATUS_STYLES[key] ?? STATUS_STYLES.active;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export function GenericStatusBadge({
  status,
  labelMap,
}: {
  status?: string | null;
  labelMap?: Record<string, { bg: string; text: string; label: string }>;
}) {
  const key = String(status ?? "").toLowerCase();
  const map = labelMap ?? STATUS_STYLES;
  const s = map[key] ?? { bg: "bg-inset border-border-default", text: "text-muted", label: status ?? "-" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
