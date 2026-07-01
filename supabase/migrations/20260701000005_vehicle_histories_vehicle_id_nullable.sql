-- =============================================================
-- vehicle_histories.vehicle_id を nullable にする
--
-- AI 関連の監査 (設定変更 / 提案 / 自動アクション実行) は特定の車両に紐付かず、
-- logAiAuditEvent は vehicle_id=null・certificate_id=null で「テナント単位の1行」を
-- 記録する設計。しかし元の NOT NULL 制約 (20260313000000 core_tables) により INSERT が
-- 拒否され、logAiAuditEvent はエラーを握りつぶすため監査痕跡が残らない (silent fail) 状態だった。
-- 制約を外し、テナント単位の監査行を挿入できるようにする。
--
-- DROP NOT NULL はカタログのみの変更でテーブル書き換えを伴わない (zero-downtime)。
-- 既存行はすべて vehicle_id を持つため影響なし。FK (references vehicles) は null を許容する。
-- =============================================================

alter table vehicle_histories alter column vehicle_id drop not null;
