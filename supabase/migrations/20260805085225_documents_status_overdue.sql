-- documents.status の CHECK に 'overdue'（期限超過）を追加する。
--
-- 事象:
--   アプリ側 (src/types/document.ts) は DocumentStatus に 'overdue' を含み、
--   請求書のステータス遷移 (sent→overdue, overdue→paid) や一覧の「入金」ボタン表示、
--   StorefrontBilling の期限超過表示で 'overdue' を実際に使用している。
--   ところが本番 documents_status_check は
--     ('draft','sent','accepted','paid','rejected','cancelled')
--   のみで 'overdue' を欠いていた（初期 documents マイグレーション以降、
--   'overdue' 概念を追加した際に制約の更新が漏れていた）。
--   このため詳細画面の「期限超過に変更」ボタン等で status='overdue' を送ると
--   /api/admin/documents PUT が CHECK 違反 (23514) で 500 になり、
--   ステータス変更が適用されなかった。
--
-- 対応:
--   既存行がある本番テーブルの CHECK 差し替えのため、lint-migrations の
--   add-check-without-not-valid 規約に従い NOT VALID → VALIDATE CONSTRAINT に分割する。
--   既存 status は全て新集合の部分集合なので VALIDATE は即座に通過する。
--   'overdue' を「許可値に追加するだけ」なので、正しく適用済みの環境では実質 no-op。

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN (
    'draft', 'sent', 'accepted', 'paid', 'overdue', 'rejected', 'cancelled'
  ))
  NOT VALID;

ALTER TABLE documents
  VALIDATE CONSTRAINT documents_status_check;
