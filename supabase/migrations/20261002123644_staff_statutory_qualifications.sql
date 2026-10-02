-- G1: 整備業の法定資格・職責の軸を作業者レジストリに追加する。
--
-- 背景（docs/e-maintenance-record-compliance.md G1 / 第２ ３（１）①）:
--   点検整備記録簿の電子的方法の基準は、利用者を**権限別に**管理することを求め、その例として
--   「自動車検査員」「整備主任者」「起票・入力担当」を挙げる。Ledra の汎用 SaaS ロールや
--   staff_members.skills（自由タグ）はこの法定資格の軸を持たなかった。
--
-- 設計（追加のみ・既存を壊さない）:
--   - staff_members.qualifications text[]: 法定資格の統制語彙キー配列。skills（自由タグ）とは
--     別軸。正準キーの定義とアプリ層の検証は src/lib/staff/qualifications.ts。
--   - DB は generic text[]（既存 skills と同じ扱い）。値の統制はアプリ層（catalog）で行う
--     —— reservations.status 等の既存語彙と同じ方針（CLAUDE.md ドメイン状態語彙ルール）。
--   - 既定 '{}' の定数デフォルトなので ADD COLUMN はメタデータのみ（全行書き換え無し）。
alter table staff_members
  add column if not exists qualifications text[] not null default '{}';

comment on column staff_members.qualifications is
  '法定資格・職責（自動車検査員/整備主任者/起票入力担当）の統制語彙キー配列。skills(自由タグ)とは別軸。定義源: src/lib/staff/qualifications.ts（G1）。';
