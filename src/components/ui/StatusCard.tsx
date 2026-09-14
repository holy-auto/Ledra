import type { ReactNode } from "react";
import { VARIANT_TINT_CLASSES } from "@/components/ui/Badge";
import { SEVERITY_VARIANT_MAP, type BadgeVariant } from "@/lib/statusMaps";
import { severityLabel } from "@/lib/domain/labels";
import type { Severity } from "@/lib/domain/states";

interface StatusCardProps {
  label: string;
  value: ReactNode;
  /** 正準 Severity(v2.0 §19.3)。variant より優先される。 */
  severity?: Severity;
  /** Severity を使わない場合の直接指定。 */
  variant?: BadgeVariant;
  /** 18x18 規約のインライン SVG(任意)。色のみに依存しないための形状シグナル。 */
  icon?: ReactNode;
  caption?: string;
  className?: string;
}

/**
 * 状態サマリーカード(淡色ティント面)。v2.0 §3.2: 高彩度で面を塗りつぶさず、
 * Badge と同じ「bg-〈色〉-dim / text-〈色〉-text / border-〈色〉/20」の淡色のみを使う。
 * parts-integrity の重大度サマリー等の生パレット直書き(bg-red-100)の置き換え先。
 */
export default function StatusCard({
  label,
  value,
  severity,
  variant = "default",
  icon,
  caption,
  className = "",
}: StatusCardProps) {
  const tone: BadgeVariant = severity ? SEVERITY_VARIANT_MAP[severity] : variant;
  return (
    <div className={`rounded-[var(--radius-lg)] border p-4 ${VARIANT_TINT_CLASSES[tone]} ${className}`}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1.5">
          {icon && <span aria-hidden="true">{icon}</span>}
          <span className="text-micro">{label}</span>
        </span>
        {/* severity は色だけでなくラベルでも伝える(v2.0 §3.2/§3.5) */}
        {severity && <span className="text-small font-semibold">{severityLabel(severity)}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {caption && <p className="mt-0.5 text-small opacity-80">{caption}</p>}
    </div>
  );
}
