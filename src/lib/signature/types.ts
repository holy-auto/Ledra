/**
 * Ledra 電子署名 型定義
 * 電子署名法（平成12年法律第102号）第2条・第3条 準拠
 */

// ============================================================
// ステータス・イベント型
// ============================================================

/** 署名セッションのステータス */
export type SignatureStatus = 'pending' | 'signed' | 'expired' | 'cancelled';

/** 監査ログのイベント種別 */
export type SignatureAuditEvent =
  | 'session_created'    // 署名セッション作成
  | 'notification_sent'  // 通知（LINE/メール）送信完了
  | 'page_opened'        // 顧客が署名ページを開いた
  | 'signed'             // 署名完了
  | 'verified'           // 第三者が検証ページにアクセス
  | 'expired'            // 有効期限切れ
  | 'cancelled';         // キャンセル

/** 通知方法 */
export type NotificationMethod = 'line' | 'email' | 'sms';

// ============================================================
// DB レコード型
// ============================================================

/** signature_sessions テーブルの行 */
export interface SignatureSession {
  id: string;
  certificate_id: string;
  tenant_id: string;
  token: string;
  expires_at: string;
  status: SignatureStatus;
  // 文書ハッシュ（電子署名法第2条第2号：非改ざん性）
  document_hash: string;
  document_hash_alg: string;
  // 署名依頼情報
  signer_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  notification_method: NotificationMethod;
  notification_sent_at: string | null;
  // 署名完了情報（電子署名法第2条第1号：本人性の証跡）
  signed_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signer_confirmed_email: string | null;
  // 暗号署名データ（電子署名法第2条第2号：非改ざん性の技術実装）
  signature: string | null;
  signing_payload: string | null;
  public_key_fingerprint: string | null;
  key_version: string | null;
  // 管理
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

/** signature_audit_logs テーブルの行 */
export interface SignatureAuditLog {
  id: string;
  session_id: string;
  event: SignatureAuditEvent;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** signature_public_keys テーブルの行 */
export interface SignaturePublicKey {
  id: string;
  key_version: string;
  public_key: string;
  fingerprint: string;
  description: string | null;
  is_active: boolean;
  activated_at: string;
  deactivated_at: string | null;
  created_at: string;
}

// ============================================================
// ユースケース入出力型
// ============================================================

/** 署名セッション作成の入力 */
export interface CreateSignatureSessionInput {
  certificate_id: string;
  tenant_id: string;
  created_by: string;
  signer_name?: string;
  signer_email?: string;
  signer_phone?: string;
  notification_method?: NotificationMethod;
  /** 署名前のPDFバイト列（SHA-256ハッシュ計算用） */
  pdf_bytes: Uint8Array;
}

/** 署名実行の入力 */
export interface ExecuteSignatureInput {
  token: string;
  signer_email: string;
  agreed: boolean;
  ip: string;
  user_agent: string;
}

/** 署名実行の結果 */
export interface SignatureResult {
  session_id: string;
  signed_at: string;
  verify_url: string;
  signature_preview: string;  // 表示用省略形
}

/** 署名検証の結果 */
export interface VerificationResult {
  is_valid: boolean;
  status: SignatureStatus;
  session: {
    id: string;
    signed_at: string | null;
    signer_email_masked: string;
    document_hash: string;
    document_hash_alg: string;
    public_key_fingerprint: string | null;
    key_version: string | null;
  };
  certificate: {
    public_id: string;
  } | null;
  verified_at: string;
  error?: string;
}

/** 署名依頼作成APIのリクエスト */
export interface SignatureRequestBody {
  certificate_id: string;
  signer_name?: string;
  signer_email?: string;
  signer_phone?: string;
  notification_method?: NotificationMethod;
}

/** 署名実行APIのリクエスト */
export interface SignatureSignBody {
  signer_email: string;
  agreed: boolean;
}

/** 署名ページに表示するセッション情報 */
export interface SignaturePageData {
  status: SignatureStatus;
  session_id: string;
  signer_name: string | null;
  expires_at: string;
  pdf_url: string;
  certificate: {
    id: string;
    public_id: string;
    created_at: string;
    cert_type: string | null;
    vehicles: { car_number: string | null; car_name: string | null } | null;
    stores: { name: string } | null;
  } | null;
}

/** 鍵情報 */
export interface ActiveKeyInfo {
  version: string;
  fingerprint: string;
}
