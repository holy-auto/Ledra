-- Performance indexes — round 3
--
-- 背景:
--   最近のコード追加で notification_logs / inventory_movements に
--   既存インデックスでカバーできていない高頻度クエリパターンが
--   発生している。EXPLAIN を取った想定では下記が seq scan / heap
--   filter にフォールバックするため、CONCURRENTLY で追加する。
--
--   CONCURRENTLY なので transaction で囲わない (Supabase migration
--   ランナーは個別ステートメントを auto-commit するので問題なし)。
--   IF NOT EXISTS を付けて再実行安全にしている。

-- ─── 1. notification_logs (target_id, type) ──────────────────────────
-- followUp.ts の idempotency 確認:
--   .in("target_id", certIds).eq("type", notifType)
-- 既存の (target_type, target_id, type) は target_type が先頭にあるため
-- target_type を WHERE に含まないこのクエリでは効かない。
create index concurrently if not exists idx_notification_logs_target_type
  on public.notification_logs (target_id, type);

-- ─── 2. notification_logs (tenant_id, type, sent_at DESC) ─────────
-- 日次 cron (low_stock_alert / maintenance_reminder) の冪等チェック:
--   .eq("tenant_id", t).eq("type", x).gte("sent_at", todayStart)
-- 既存の (tenant_id, type) でも引けるが、sent_at を含めると
-- range filter まで index で完結し HOT 行のみ heap fetch になる。
-- 注: notification_logs の時刻列は sent_at (created_at は存在しない)。
create index concurrently if not exists idx_notification_logs_tenant_type_created
  on public.notification_logs (tenant_id, type, sent_at desc);

-- ─── 3. inventory_movements (tenant_id, created_at DESC) ─────────────
-- 新しい入出庫履歴一覧 API は item_id 無しでも使えるようにページング化:
--   .eq("tenant_id", t).order("created_at", desc).range(from, to)
-- 既存の (item_id, created_at DESC) は item_id 必須。
-- (tenant_id) 単独 index では sort 段階で別途 work_mem を消費する。
create index concurrently if not exists idx_inventory_movements_tenant_created
  on public.inventory_movements (tenant_id, created_at desc);
