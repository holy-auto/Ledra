-- 確定→自動送付 (invoice.auto_send_on_confirm / quote.auto_send_on_confirm) の
-- 二重送付をアトミックに防ぐための部分 UNIQUE インデックス。
--
-- documentAuto.maybeAutoSendDocumentOnConfirm は送付前に
-- idempotency_key = 'auto-confirm:<document_id>' で 'pending' 行を予約する。
-- この UNIQUE により、draft→sent がレース (ダブルクリック / クライアント再送) しても
-- 最初の 1 worker しか claim できず、同じ帳票を二重送付できない。
--
-- 対象は 'auto-confirm:' 接頭辞のキーのみ (部分 index)。手動共有
-- (/api/admin/documents/share) のクライアント生成 UUID キーには影響しない。
-- 送付失敗時は documentAuto 側が予約行を DELETE して claim を解放するため、
-- 再確定でのリトライは可能。
--
-- CONCURRENTLY: document_share_log は送付のたびに書き込まれるため、index 作成中の
-- ACCESS EXCLUSIVE ロックを避ける。CONCURRENTLY はトランザクション内で実行できないので
-- このマイグレーションは index 作成 1 文のみで構成する (他の DDL を混在させない)。
-- 作成時点で 'auto-confirm:' 接頭辞の行は 0 件 (新機能) のため、partial index の
-- ビルド走査対象は実質ゼロで即時完了する。
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_doc_share_log_auto_confirm
  ON document_share_log (idempotency_key)
  WHERE idempotency_key LIKE 'auto-confirm:%';
