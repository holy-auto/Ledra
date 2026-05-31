-- ai_usage_logs に「呼び出しごとの実コスト (円)」列を追加。
--
-- 背景: ダッシュボードはこれまで input_tokens/output_tokens からコストを再計算していたが、
-- prompt cache 利用時は cache_creation/cache_read トークンが別計上され、再計算では
-- 取りこぼして過小表示になっていた (一方コストキャップは usageContext で cache 込みの
-- 実コストを積んでいるため、ダッシュ表示とキャップ計上値が乖離する)。
--
-- 呼び出しごとに usageContext が算出した cache 込み・モデル別の実コスト (円) をこの列に
-- 保存し、ダッシュボードはこれを集計する (キャップ計上値と一致)。NULL = 旧データ
-- (その場合はダッシュ側でトークン/代表単価フォールバックする)。

ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS cost_jpy numeric;

COMMENT ON COLUMN ai_usage_logs.cost_jpy IS
  '呼び出しの概算コスト (円, cache 込み・モデル別の実トークンから算出)。NULL = 旧データ。';
