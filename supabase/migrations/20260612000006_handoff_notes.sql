-- =============================================================
-- Staff handoff notes (申し送りメモ) Migration
-- 担当者間の引き継ぎ・申し送り事項を reservations に構造化して記録する。
--
-- RLS: reservations 既存のテナント分離ポリシーがそのまま列レベルにも適用
--      されるため、本マイグレーションでは新規ポリシー不要（カラム追加のみ）。
-- =============================================================

alter table reservations
  add column if not exists handoff_notes jsonb not null default '[]';

comment on column reservations.handoff_notes is
  'Staff handoff notes array. Each: {id, author_id, author_name, content, created_at, priority}.';
