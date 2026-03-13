import type { CertificateStatus } from "@/types/certificate";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active:  { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "有効" },
  void:    { bg: "bg-red-50 border-red-200",         text: "text-red-700",     label: "無効" },
  expired: { bg: "bg-amber-50 border-amber-200",     text: "text-amber-700",   label: "期限切れ" },
  draft:   { bg: "bg-neutral-50 border-neutral-200", text: "text-neutral-500",  label: "下書き" },
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
  const s = map[key] ?? { bg: "bg-neutral-50 border-neutral-200", text: "text-neutral-500", label: status ?? "-" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
