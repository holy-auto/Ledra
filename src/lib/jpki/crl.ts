/**
 * CRL / OCSP による失効確認 — Phase 1 で実装するスタブ.
 *
 * 設計方針 (Phase 1 着手時にここを更新する):
 *
 * - **CRL を 24h キャッシュ** (Upstash Redis に gzip 圧縮で保存).
 *   J-LIS の CRL は数 MB 規模になることがあり、毎リクエスト fetch すると
 *   レイテンシ・帯域ともに悪化するため.
 * - **OCSP をプライマリ**, CRL をフォールバックにする選択肢もあり.
 *   J-LIS が OCSP responder を提供しているか Phase 0 で要確認.
 * - 失効確認失敗時は **`state: "unknown"`** を返し、route 層で
 *   「失効確認不能」をユーザーに明示する. fail-open はしない.
 *
 * 詳細ロードマップ: docs/jpki-self-operated-roadmap.md §3.2
 */
import type { RevocationStatus } from "./types";

/**
 * 指定シリアル番号の証明書が失効していないか確認する.
 *
 * Phase 1 実装メモ:
 * - CRL URL は証明書の `CRL Distribution Points` 拡張から取得.
 * - 失敗時 (ネットワーク / 署名検証失敗) は state: "unknown" を返し、
 *   呼び出し側で「再試行 or 手動確認」へ縮退させる.
 */
export async function checkRevocation(_serialNumber: string): Promise<RevocationStatus> {
  throw new Error("JPKI Phase 0: checkRevocation is not implemented yet.");
}
