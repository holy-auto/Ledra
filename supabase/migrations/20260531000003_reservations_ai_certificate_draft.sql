-- reservations に AI 証明書ドラフト (certificate.auto_draft) の保存列を追加。
--
-- 背景: auto-action `certificate.auto_draft` が opt-in されているテナントでは、
-- 予約 (案件) が完了した時点で証明書の下書きを自動生成し、ここに保存する。
-- 証明書の「行」は作らない (発行は必ず人 = 壁3)。発行画面はこの JSON を
-- プリフィルに使い、スタッフは確認・修正して発行する。
--
-- スキーマ (jsonb):
--   {
--     "draft":   { title, description, materials[], warrantyCandidates[],
--                  workAreas[], cautions, confidence, fieldConfidence?, missingInfo[] },
--     "policies": { "certificate.title": "auto|suggest|manual", ... },
--     "auto": true,
--     "generated_at": "YYYY-MM-DDTHH:mm:ssZ"
--   }
--
-- - nullable (NULL = 未生成 / auto OFF / 車両情報なし)
-- - 発行 (法的確定) には関与しない。証明書を自動作成もしない (壁3)。

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS ai_certificate_draft jsonb;

COMMENT ON COLUMN reservations.ai_certificate_draft IS
  'certificate.auto_draft が生成した証明書下書き (draft + policies + generated_at)。NULL = 未生成。発行は必ず人が行う (壁3)。';
