import type { ReactNode } from "react";
import { VARIANT_TINT_CLASSES } from "@/components/ui/Badge";
import { SEVERITY_VARIANT_MAP } from "@/lib/statusMaps";
import { severityLabel } from "@/lib/domain/labels";
import type { Severity } from "@/lib/domain/states";

interface NextActionCardProps {
  /** 実行すべきアクション(1件を大きく提示。v2.0 §5.3)。 */
  title: string;
  /** 説明可能な理由(「納期まで2h」「部品到着済み」等)。スコアは見せない。 */
  reason?: string;
  severity?: Severity;
  /** 主 CTA(例: <Button size="xl">作業を開始</Button>)。 */
  cta?: ReactNode;
  /** 次候補など補助要素(任意)。 */
  secondary?: ReactNode;
  className?: string;
}

/**
 * NEXT ACTION カード(v2.0 §5.3)。最優先の実行可能アクション1件を、
 * 理由つき・淡色ティントで提示する表示専用プリミティブ。
 * 優先度の計算は呼び出し側(将来の priority エンジン、IMP-044)の責務。
 */
export default function NextActionCard({
  title,
  reason,
  severity = "ACTION",
  cta,
  secondary,
  className = "",
}: NextActionCardProps) {
  const tone = SEVERITY_VARIANT_MAP[severity];
  return (
    <section
      aria-label={`次のアクション: ${title}`}
      className={`rounded-[var(--radius-lg)] border p-4 ${VARIANT_TINT_CLASSES[tone]} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-micro">NEXT ACTION</span>
        {/* severity ラベルは業務情報のため 12px 超で表示(v2.0 §3.3) */}
        <span className="text-small font-semibold opacity-90">{severityLabel(severity)}</span>
      </div>
      <h3 className="mt-1.5 text-h3">{title}</h3>
      {reason && <p className="mt-1 text-small opacity-90">{reason}</p>}
      {cta && <div className="mt-3">{cta}</div>}
      {secondary && <div className="mt-2 border-t border-border-subtle pt-2">{secondary}</div>}
    </section>
  );
}
