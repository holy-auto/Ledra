-- documents.public_id の部分ユニーク索引。
--
-- レシート公開URL /receipt/[public_id] の引き当てに使う（`.eq("public_id", ...)`）。
-- 索引が無いと documents 全件の逐次走査になり、公開ページは認証不要なので
-- 外から何度でも叩ける。
--
-- 部分索引にする理由: public_id が付くのは doc_type='receipt' の行だけで、
-- 請求書・見積書・発注書は NULL のまま。NULL 行を索引に入れる意味が無い。
--
-- **CONCURRENTLY は付けていない。** Supabase はマイグレーションをトランザクション/
-- パイプラインで送るため、CONCURRENTLY は 25001 で必ず落ちる
-- （DECISION_LOG 2026-09-04「CONCURRENTLY は『1ファイル1文』に統一し、適用済みファイル
-- からは外す」）。実際に CONCURRENTLY 付きで当てようとして 25001 を確認してから外した。
-- documents は全48行なので ACCESS EXCLUSIVE ロックは一瞬で、実害が無い。
-- 本ファイルは 2026-09-06 に本番へ適用済み（version 20260906094735）。再適用されないので
-- lint の create-index-without-concurrently は migrations.allowlist で免除している。
--
-- 直前の 20260906094512 がバックフィルを済ませているので、この時点で
-- 既存の doc_type='receipt' 行には gen_random_uuid() 由来の重複しない値が
-- 入っている（重複があるとユニーク索引の作成自体が失敗する）。

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_public_id
  ON documents (public_id)
  WHERE public_id IS NOT NULL;
