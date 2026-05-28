/**
 * JPKI (公的個人認証) — 共通型定義スタブ.
 *
 * Phase 1 (J-LIS 認定取得後) の実装で本ファイルを段階的に埋める.
 * Phase 0 (現在) は型と TODO コメントのみ.
 *
 * 詳細ロードマップ: docs/jpki-self-operated-roadmap.md
 *
 * ★ マイナンバー (個人番号 12 桁) は絶対にこれらの型に乗せない. ★
 * 取得するのは基本4情報 + 電子証明書のメタ情報のみ.
 */

/**
 * 公的個人認証で利用する電子証明書の種類.
 * - signing: 署名用電子証明書 (4 情報含む, 5 年有効, 署名 PIN 必要)
 * - user_auth: 利用者証明用電子証明書 (本人確認のみ, 4 情報なし, 数字 4 桁 PIN)
 */
export type JpkiCertificateKind = "signing" | "user_auth";

/**
 * 署名用電子証明書から抽出される基本4情報.
 * 個人番号は含まない (技術仕様上も入っていない).
 */
export interface JpkiAttributes {
  /** 漢字氏名 (全角) */
  name: string;
  /** 住所 (全角, 都道府県〜番地まで) */
  address: string;
  /** 生年月日 (ISO YYYY-MM-DD) */
  birthDate: string;
  /** 性別 ("male" | "female" | "other") */
  gender: "male" | "female" | "other";
}

/** 検証済み証明書のメタ情報. */
export interface JpkiCertificateMeta {
  /** 証明書シリアル番号 (16 進). */
  serialNumber: string;
  /** 発行者 DN. J-LIS の特定 CA のはず. */
  issuerDn: string;
  /** 有効期間 (開始) */
  notBefore: string;
  /** 有効期間 (終了) */
  notAfter: string;
  /** 証明書種別 */
  kind: JpkiCertificateKind;
}

/** 失効確認の結果. */
export type RevocationStatus =
  | { state: "good"; checkedAt: string; method: "crl" | "ocsp" }
  | { state: "revoked"; reason: string; revokedAt: string }
  | { state: "unknown"; reason: string };

/** 検証全体の結果. */
export interface JpkiVerificationResult {
  /** 全体としての判定 */
  ok: boolean;
  /** 取得できた基本4情報 (kind === "signing" のときのみ) */
  attributes?: JpkiAttributes;
  /** 証明書メタ */
  certificate: JpkiCertificateMeta;
  /** 失効確認結果 */
  revocation: RevocationStatus;
  /** 失敗理由 (ok=false 時) */
  failure?: string;
  /** タイムスタンプトークン (RFC 3161, ある場合) */
  timestamp?: {
    tsaUrl: string;
    signedAt: string;
  };
}

/** 署名検証の入力. */
export interface JpkiSignatureVerifyInput {
  /** PKCS#7 / CAdES 形式の署名値 (DER) */
  signature: Uint8Array;
  /** 署名対象データのハッシュ (SHA-256). */
  payloadHash: string;
  /** 期待する署名対象 (デタッチ署名の場合) */
  expectedPayload?: Uint8Array;
}
