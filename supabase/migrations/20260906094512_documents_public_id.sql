-- POS レシートを顧客へ送れるようにするための公開トークン。
--
-- 背景:
--   モバイルのレシート共有は `https://app.ledra.co.jp/c/${id}` を送っていたが、
--   この id は payments.id / reservations.id で、/c/[public_id] は **証明書**の
--   公開ページ（certificates.public_id を引いて notFound() する）。つまり
--   顧客に送ったリンクは必ず 404 だった。Apple Tap to Pay 要件 5.10
--   「決済後にレシートを SMS / Email で送れること」が実質未達だった。
--
-- なぜ documents に付けるか:
--   pos_checkout は支払と同時に documents 行（doc_type='receipt'、doc_number、
--   小計・税・合計・明細）を作り、payments.document_id がそれを指している。
--   **飛び込み会計でも作られる**。レシートの実体はもう存在しているので、
--   公開の入口だけを与えればよい。
--   証明書に紐付ける案は飛び込みに使えない（予約も顧客も車両も無く、
--   certificates.customer_name は NOT NULL、証明書は必ず draft で作られる）。
--
-- 生成場所:
--   新規分は **アプリ側**（src/lib/pos/recordSale.ts が makePublicId() で作る）。
--   pos_checkout は決済の中枢なので触らない。署名を変えると CREATE OR REPLACE が
--   置換ではなくオーバーロードになり、関数を DROP する必要が出るため。
--   ここでのバックフィルは通常のマイグレーション文脈（search_path は既定）なので
--   gen_random_uuid() をそのまま使える。

ALTER TABLE documents ADD COLUMN IF NOT EXISTS public_id text;

COMMENT ON COLUMN documents.public_id IS
  'レシート公開URL /receipt/[public_id] のトークン。doc_type=''receipt'' にのみ付与する。推測不能な不透明値。';

-- NOT NULL にはしない。見積・請求書など他の doc_type に付ける必要が無く、
-- NOT NULL 化は既存全行のバックフィルとロックを伴うため。
-- 一意は付いている行だけ保証する（部分ユニーク索引）。
--
-- NOTE: その索引は兄弟マイグレーション
-- 20260906094735_documents_public_id_index.sql で CREATE UNIQUE INDEX
-- CONCURRENTLY として作る（lint rule: トランザクション内では実行できない）。
-- **バックフィルより後**に作る必要があるので、順序を入れ替えないこと。

-- 既に発行済みの領収書からも送れるようにバックフィルする。
-- 32桁hex（UUIDv4 由来 = 122bit）。新規分の makePublicId()（22文字 base64url）とは
-- 見た目が違うが、どちらも推測不能な不透明トークンで用途上の差は無い。
UPDATE documents
   SET public_id = replace(gen_random_uuid()::text, '-', '')
 WHERE doc_type = 'receipt'
   AND public_id IS NULL;
