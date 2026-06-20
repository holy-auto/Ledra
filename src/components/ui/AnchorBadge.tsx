import type { PolygonNetwork } from "@/lib/anchoring/providers/types";
import { buildExplorerUrl } from "@/lib/anchoring/providers/polygon";
import { formatDateTime, truncateHash } from "@/lib/format";

/**
 * AnchorBadge
 * ------------------------------------------------------------
 * ブロックチェーン・アンカー成功メタ（TX hash・Polygonscan リンク・記録日時）を
 * 表す Gold アクセントのバッジ。WORKSTREAM D の P0、かつ **Gold 差し色の主用途**
 * （「信頼と格式」の特別な瞬間 — アンカー成功表示）。
 *
 * - `txHash` + `network` が揃ったときだけ描画し、Polygonscan へのリンクになる。
 * - 未アンカー時は `null`（呼び出し側で「未記録」等を出し分ける）。
 * - 色は accent-gold トークン経由（hex 直書きなし）。TX は `font-mono` + 中央省略。
 */
export default function AnchorBadge({
  txHash,
  network,
  anchoredAt,
  className = "",
}: {
  txHash?: string | null;
  network?: PolygonNetwork | null;
  /** 記録日時 (ISO)。あれば tooltip に表示。任意。 */
  anchoredAt?: string | null;
  className?: string;
}) {
  const explorerUrl = buildExplorerUrl(txHash, network);
  if (!explorerUrl || !txHash) return null;

  const networkLabel = network === "amoy" ? "Amoy testnet" : "Polygon mainnet";
  const title =
    `${networkLabel} で取引を確認できます。` + (anchoredAt ? `\n記録日時: ${formatDateTime(anchoredAt)}` : "");

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-accent-gold/40 bg-accent-gold-dim px-2.5 py-1 text-xs font-semibold text-accent-gold-text transition-opacity hover:opacity-80 ${className}`}
    >
      {/* 子 span にも accent-gold クラスを付与: globals.css のダーク時 span 白文字化
          セーフティネット（span:not([class*="accent-gold"])）から除外して金文字を保つ。 */}
      <span aria-hidden className="text-accent-gold-text">
        ⛓
      </span>
      <span className="text-accent-gold-text">ブロックチェーン記録済み</span>
      <span className="min-w-0 break-all font-mono text-[10px] text-accent-gold-text opacity-80">
        {truncateHash(txHash)}
      </span>
      <span aria-hidden className="text-accent-gold-text opacity-70">
        ↗
      </span>
    </a>
  );
}
