import type { AuthenticityGrade } from "@/lib/anchoring/authenticityGrade";
import type { PolygonNetwork } from "@/lib/anchoring/providers/types";
import AuthenticityBadge from "./AuthenticityBadge";

export interface HeroCardProps {
  /** Vehicle maker (e.g. "Toyota"). Optional — falls back to a neutral label. */
  maker?: string | null;
  /** Vehicle model (e.g. "Land Cruiser"). */
  model?: string | null;
  /** Number of service records attached to this vehicle/certificate. */
  recordCount: number;
  /** Best grade across all attached images. */
  grade: AuthenticityGrade;
  /** Polygon tx hash for the representative image (optional). */
  polygonTxHash?: string | null;
  /** Polygon network for the representative image (optional). */
  polygonNetwork?: PolygonNetwork | null;
}

/**
 * Phase 2 MVP hero card. Server Component, no animation libs, no
 * extra dependencies. Framer Motion and the full `/for-owners`
 * storytelling come later (plan §13.12).
 */
export default function HeroCard({ maker, model, recordCount, grade, polygonTxHash, polygonNetwork }: HeroCardProps) {
  const vehicleLabel = [maker, model].filter(Boolean).join(" ").trim();

  return (
    <section className="glass-card mb-4 overflow-hidden p-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-[22px] font-extrabold leading-snug tracking-tight text-primary sm:text-[26px]">
          あなたの車には、
          <br className="sm:hidden" />
          確かな経歴があります。
        </h1>
        <p className="text-sm text-secondary">
          {vehicleLabel ? `${vehicleLabel} ・ ` : ""}
          {recordCount}件の施工記録
        </p>
        <div className="pt-1">
          <AuthenticityBadge grade={grade} polygonTxHash={polygonTxHash} polygonNetwork={polygonNetwork} />
        </div>
      </div>
    </section>
  );
}
