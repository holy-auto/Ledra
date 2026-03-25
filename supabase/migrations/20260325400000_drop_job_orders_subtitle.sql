-- job_orders テーブルに subtitle カラムが存在する場合、削除する
-- コード上では subtitle は使用されておらず、NOT NULL 制約によりレコード作成がエラーになるため
ALTER TABLE job_orders DROP COLUMN IF EXISTS subtitle;
