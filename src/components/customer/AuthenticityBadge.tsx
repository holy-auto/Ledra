import type { AuthenticityGrade } from "@/lib/anchoring/authenticityGrade";
import type { PolygonNetwork } from "@/lib/anchoring/providers/types";
import { buildExplorerUrl } from "@/lib/anchoring/providers/polygon";

/**
 * Badge shown on the public certificate page to communicate that
 * the photos attached to the certificate have been hashed / signed
 * / verified on the server side.
 *
 * When `polygonTxHash` + `polygonNetwork` are present, the badge
 * becomes a link to Polygonscan so customers and insurers can
 * independently verify the anchor on-chain.
 *
 * `unverified` (legacy data without a server-side SHA-256) renders
 * nothing so we don't downgrade existing certificates visually.
 */
export default function AuthenticityBadge({
  grade,
  polygonTxHash,
  polygonNetwork,
}: {
  grade: AuthenticityGrade;
  polygonTxHash?: string | null;
  polygonNetwork?: PolygonNetwork | null;
}) {
  if (grade === "unverified") return null;

  const copy = BADGE_COPY[grade];
  const explorerUrl = buildExplorerUrl(polygonTxHash, polygonNetwork);

  const content = (
    <>
      <span aria-hidden>✓</span>
      {copy.label}
      {explorerUrl ? (
        <span aria-hidden className="ml-1 opacity-70">
          ↗
        </span>
      ) : null}
    </>
  );

  const baseClasses = `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${copy.className}`;

  if (explorerUrl) {
    return (
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} transition-opacity hover:opacity-80`}
        title={`${copy.tooltip}\nPolygonscan で取引を確認できます。`}
      >
        {content}
      </a>
    );
  }

  return (
    <span className={baseClasses} title={copy.tooltip}>
      {content}
    </span>
  );
}

const BADGE_COPY: Record<
  Exclude<AuthenticityGrade, "unverified">,
  { label: string; className: string; tooltip: string }
> = {
  basic: {
    label: "記録ハッシュ検証済み",
    className: "border-sky-500/30 bg-[rgba(56,189,248,0.1)] text-sky-300",
    tooltip: "写真がサーバ側で SHA-256 ハッシュ化され、改ざん検知が有効になっています。",
  },
  verified: {
    label: "ブロックチェーン検証済み",
    className: "border-blue-500/30 bg-[rgba(59,130,246,0.12)] text-blue-300",
    tooltip: "C2PA 署名とデバイス証明で、撮影から保存までの来歴が記録されています。",
  },
  premium: {
    label: "完全検証済み",
    className: "border-emerald-500/30 bg-[rgba(16,185,129,0.12)] text-emerald-300",
    tooltip: "C2PA 署名・デバイス証明・deepfake 検出のすべてを通過しています。",
  },
};
