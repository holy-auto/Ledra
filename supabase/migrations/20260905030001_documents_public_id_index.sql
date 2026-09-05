-- documents.public_id の部分ユニーク索引。
--
-- レシート公開URL /receipt/[public_id] の引き当てに使う（`.eq("public_id", ...)`）。
-- 索引が無いと documents 全件の逐次走査になり、公開ページは認証不要なので
-- 外から何度でも叩ける。
--
-- 部分索引にする理由: public_id が付くのは doc_type='receipt' の行だけで、
-- 請求書・見積書・発注書は NULL のまま。NULL 行を索引に入れる意味が無い。
--
-- CONCURRENTLY にする理由: documents は稼働中のテーブル（会計のたびに INSERT
-- される）。通常の CREATE INDEX は ACCESS EXCLUSIVE ロックを取るので、
-- 索引を張っている間 POS の会計が止まる。トランザクション外で実行する必要が
-- あるため単独のマイグレーションにしている。
--
-- 直前の 20260905030000 がバックフィルを済ませているので、この時点で
-- 既存の doc_type='receipt' 行には gen_random_uuid() 由来の重複しない値が
-- 入っている（重複があると CONCURRENTLY のユニーク索引は invalid で残る）。

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_public_id
  ON documents (public_id)
  WHERE public_id IS NOT NULL;
