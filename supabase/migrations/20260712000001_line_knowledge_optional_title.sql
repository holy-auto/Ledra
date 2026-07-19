-- =============================================================
-- LINE ナレッジ (店舗 / 共有) の「質問 / トピック」タイトルを任意化する。
--
-- これまで title は 1〜200 字必須で、登録が Q&A 形式に縛られていた。
-- 営業案内・注意事項・こだわりなど「質問やトピック」でない自由文も
-- 学習させたいという要望に応え、title を空欄可 (0〜200 字, 既定 '') にする。
-- content (回答 / 知識本文) は引き続き必須。
--
-- 既存の CHECK は無名インライン制約なので Postgres 既定名
-- <table>_title_check で置き換える。新制約は旧制約 (BETWEEN 1 AND 200) より
-- 緩いので既存行は必ず満たすが、フルスキャン ACCESS EXCLUSIVE を避けるため
-- NOT VALID で追加してから VALIDATE CONSTRAINT (SHARE UPDATE EXCLUSIVE) する。
-- =============================================================

ALTER TABLE tenant_line_knowledge
  ALTER COLUMN title SET DEFAULT '',
  DROP CONSTRAINT IF EXISTS tenant_line_knowledge_title_check,
  ADD CONSTRAINT tenant_line_knowledge_title_check CHECK (char_length(title) <= 200) NOT VALID;
ALTER TABLE tenant_line_knowledge VALIDATE CONSTRAINT tenant_line_knowledge_title_check;

ALTER TABLE global_line_knowledge
  ALTER COLUMN title SET DEFAULT '',
  DROP CONSTRAINT IF EXISTS global_line_knowledge_title_check,
  ADD CONSTRAINT global_line_knowledge_title_check CHECK (char_length(title) <= 200) NOT VALID;
ALTER TABLE global_line_knowledge VALIDATE CONSTRAINT global_line_knowledge_title_check;

COMMENT ON COLUMN tenant_line_knowledge.title IS
  '質問 / トピック (任意, 例: "営業時間を教えて")。空欄なら content だけを AI に学習させる。';
COMMENT ON COLUMN global_line_knowledge.title IS
  '質問 / トピック (任意)。空欄なら content だけを AI に学習させる。';
