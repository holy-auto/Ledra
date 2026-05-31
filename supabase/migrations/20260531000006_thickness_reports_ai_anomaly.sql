-- thickness_reports に AI 異常検知結果のスナップショット列を追加。
-- thickness.auto_detect (NexPTG 受信時の自動検知) と手動 ai-anomaly の両方で使う。
-- 注釈用途 (stats/severity/comment)。金額・本人確認・法的確定に関与しないため壁3 とは無関係。
alter table if exists public.thickness_reports
  add column if not exists ai_anomaly_result jsonb;

comment on column public.thickness_reports.ai_anomaly_result is
  'AI 塗膜厚異常検知結果 (auto/手動)。{ stats, severity, comment, ai, auto, generated_at }';
