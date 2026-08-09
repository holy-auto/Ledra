/**
 * 帳票の完全性封印（documentSeal.ts が meta_json.integrity_seal に保存）の
 * 「表示用」整形。クライアントコンポーネントから使うため、node:crypto 等の
 * サーバ専用依存を持つ documentSeal.ts とは分離した純関数にする。
 */

export interface IntegritySealView {
  /** タイムスタンプ（第三者時刻証明）付きか。false ならハッシュのみ封印。 */
  hasTimestamp: boolean;
  /** バッジ文言。 */
  label: string;
  /** 補足（TS局・時刻）。ハッシュのみなら null。 */
  detail: string | null;
}

/** ISO8601(UTC) を JST の "YYYY/MM/DD HH:mm" に整形。パース不能なら原文を返す。 */
function formatJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Asia/Tokyo 固定（施工店は国内運用）。en-CA で YYYY-MM-DD 並びにし区切りを整える。
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${parts} JST`;
}

/**
 * meta_json から封印の表示情報を作る。封印が無ければ null（バッジ非表示）。
 */
export function describeIntegritySeal(metaJson: Record<string, unknown> | null | undefined): IntegritySealView | null {
  const seal = metaJson?.integrity_seal as Record<string, unknown> | undefined;
  if (!seal || typeof seal !== "object" || !seal.hash_sha256) return null;

  const hasTimestamp = !!seal.timestamp_token_b64;
  if (!hasTimestamp) {
    // ハッシュのみ: 改ざん検知はできるが第三者時刻証明は無い（正直に区別して見せる）。
    return { hasTimestamp: false, label: "改ざん防止封印済み（ハッシュ）", detail: null };
  }

  const authority = typeof seal.timestamp_authority === "string" ? seal.timestamp_authority : null;
  const at = typeof seal.timestamp_at === "string" ? formatJst(seal.timestamp_at) : null;
  const detail = [authority, at].filter(Boolean).join(" / ") || null;
  return { hasTimestamp: true, label: "改ざん防止封印済み（タイムスタンプ）", detail };
}
