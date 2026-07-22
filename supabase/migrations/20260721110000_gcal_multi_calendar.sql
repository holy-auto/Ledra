-- 複数カレンダー同期（衝突チェック用の追加カレンダー ＋ 個人予定の非表示モード）
--
-- 背景: これまで gcal 連携は 1 カレンダーだけ（gcal_calendar_id が読み取り＝ブロック確認も
-- 書き込み＝予約作成も兼ねる）。「個人カレンダーも時間を押さえたいが、私用の予定名は Ledra に
-- 出したくない」という要望に応えるため、追加の読み取り専用カレンダーとモードを持たせる。
--
--   gcal_calendar_id      … 従来どおり「書き込み先＋full 読み取り」のメインカレンダー（変更なし）
--   gcal_read_calendars   … 追加で衝突チェックに使うカレンダー配列 [{ "id": "...", "mode": "full"|"busy" }]
--       mode='full' … 予定名・詳細も予約として取り込む（メインと同じ挙動）
--       mode='busy' … その時間を「予定あり」ブロックとして押さえるだけ。予定名・内容は保存しない
--                     （＝個人予定は時間だけブロックし、中身は非表示）
alter table tenants
  add column if not exists gcal_read_calendars jsonb not null default '[]'::jsonb;

-- pull で取り込んだ予約が「どのカレンダー由来か」を記録。カレンダーを外した時に、その由来の
-- 未来ブロックだけを綺麗に削除できるようにする（他カレンダー・手動予約は消さない）。
alter table reservations
  add column if not exists gcal_calendar_id text;

create index if not exists reservations_gcal_calendar_idx
  on reservations (tenant_id, gcal_calendar_id)
  where gcal_calendar_id is not null;
