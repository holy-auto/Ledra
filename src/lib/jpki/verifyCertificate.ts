import "reflect-metadata"; // tsyringe(@peculiar/x509 経由・@simplewebauthn 等)が要求する Reflect polyfill。x509/simplewebauthn より前に読む。
/**
 * JPKI 証明書検証 — Phase 1 で実装する純関数のスタブ.
 *
 * 現状 (Phase 0): 型と未実装 throw のみ.
 * Phase 1: X.509 検証 (証明書チェーン → J-LIS ルート CA).
 *
 * 詳細ロードマップ: docs/jpki-self-operated-roadmap.md §3.2
 */
import type { JpkiCertificateMeta } from "./types";

/**
 * DER エンコードされた X.509 証明書をパースして基本情報を返す.
 *
 * Phase 1 実装メモ:
 * - `node-forge` または `@peculiar/x509` を使う.
 * - 期待する issuer DN は J-LIS の中間 CA. 環境変数 (or static map) で
 *   許容 issuer DN リストを定義し、それ以外は reject する.
 * - notBefore / notAfter で期限切れチェック. 余白なし.
 * - Key usage に "digitalSignature" が含まれることを確認.
 */
export function parseCertificate(_der: Uint8Array): JpkiCertificateMeta {
  throw new Error("JPKI Phase 0: parseCertificate is not implemented yet. See docs/jpki-self-operated-roadmap.md");
}

/**
 * 証明書チェーンを検証する (リーフ → 中間 → ルート).
 *
 * Phase 1 実装メモ:
 * - J-LIS ルート CA は環境変数で fingerprint 固定. 取得元: J-LIS 公式配布物.
 * - Ldap/HTTP で中間 CA を取得する場合は別途キャッシュ.
 * - 完全な path validation (RFC 5280 §6) を実装する必要がある.
 */
export function verifyCertificateChain(_leafDer: Uint8Array): { ok: boolean; reason?: string } {
  throw new Error("JPKI Phase 0: verifyCertificateChain is not implemented yet.");
}
