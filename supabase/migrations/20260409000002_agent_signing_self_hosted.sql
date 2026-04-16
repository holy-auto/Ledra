-- =============================================================
-- Agent Signing: 自前電子署名への切り替え
-- CloudSign 依存を除去し、内部 ECDSA 署名フローに統一する。
-- =============================================================
-- 追加カラム:
--   sign_token          : 署名ページ URL トークン（一意・暗号乱数）
--   sign_expires_at     : トークン有効期限（通常 7 日）
--   signer_ip           : 署名実行時 IP（電子署名法 第2条 本人性証跡）
--   signer_user_agent   : 署名実行時 UA（同上）
--   signature           : ECDSA P-256 署名値（Base64）
--   signing_payload     : 署名ペイロード文字列（再現性検証用）
--   public_key_fingerprint : 検証用公開鍵フィンガープリント
--   key_version         : 鍵バージョン識別子
-- =============================================================

alter table agent_signing_requests
  add column if not exists sign_token             text unique,
  add column if not exists sign_expires_at        timestamptz,
  add column if not exists signer_ip              text,
  add column if not exists signer_user_agent      text,
  add column if not exists signature              text,
  add column if not exists signing_payload        text,
  add column if not exists public_key_fingerprint text,
  add column if not exists key_version            text;

-- インデックス: トークンによるルックアップを O(1) に
create index if not exists idx_asr_sign_token on agent_signing_requests (sign_token)
  where sign_token is not null;

-- 公開署名 API はサービスロールクライアント（admin client）でアクセスするため
-- RLS の変更は不要。既存のエージェント向け select ポリシーはそのまま維持。
