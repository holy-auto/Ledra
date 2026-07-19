-- reservations に AI 勘定科目「提案」の保存列を追加。
--
-- 背景: auto-action `accounting.auto_categorize_on_intake` が opt-in されている
-- テナントでは、案件 (予約) 登録時にメニュー明細から freee / マネーフォワード の
-- 勘定科目を自動推定し、ここに「提案」として保存する。請求書作成画面はこの提案を
-- プリフィルに使える。
--
-- スキーマ (jsonb):
--   {
--     "lines": [
--       { "description", "amount", "suggested_code", "suggested_label",
--         "confidence", "method": "rule|ai|fallback" }, ...
--     ],
--     "auto": true,
--     "generated_at": "YYYY-MM-DDTHH:mm:ssZ"
--   }
--
-- - nullable (NULL = 未推定 / auto OFF / 明細なし / 勘定マスタ未設定)
-- - accounting.category は NEVER_AUTO_FIELD。これは「提案」であり、帳簿への計上
--   (確定) には一切関与しない。金額・科目の確定は必ず人が行う (壁3)。

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS ai_accounting_suggestion jsonb;

COMMENT ON COLUMN reservations.ai_accounting_suggestion IS
  'accounting.auto_categorize_on_intake が生成した勘定科目の提案 (lines + generated_at)。NULL = 未推定。確定は必ず人が行う (壁3)。';
