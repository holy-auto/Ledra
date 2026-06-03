/**
 * 車両単位 部品メタアンカーのハッシュ計算（純関数）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.5
 *
 * 既存パスポート meta-anchor と同じ「VIN/キー＋ソート済みハッシュ群の sha256」方式で、
 * 1車両の確定済み装着 content_hash 群を1つの meta_hash に束ねる。
 * ソート・重複排除により、装着順に依存しない決定的なダイジェストになる。
 */

import crypto from "crypto";

export interface PartsMetaResult {
  /** sha256(hex, lowercase, 0x なし)。 */
  metaHash: string;
  /** 寄与した content_hash（ソート・重複排除済み）。 */
  contributing: string[];
}

export function computePartsMetaHash(vehicleId: string, contentHashes: string[]): PartsMetaResult {
  const key = (vehicleId ?? "").trim().toLowerCase();
  if (!key) throw new Error("computePartsMetaHash: empty vehicleId");

  const cleaned = Array.from(
    new Set(contentHashes.map((h) => h?.trim().toLowerCase()).filter((h): h is string => !!h && h.length > 0)),
  ).sort();

  const payload = [key, ...cleaned].join("\n");
  const metaHash = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  return { metaHash, contributing: cleaned };
}
