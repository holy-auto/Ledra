-- ============================================================
-- 一意制約を本番とマイグレーションで一致させる —— 制約として持つ5件
-- ============================================================
-- 背景: 2026-09-20 に**列**のドリフトを両方向 0 にしたあと、**索引を名前で**突き合わせたら
-- 一意制約が両方向にずれていた。一意制約は性能の話ではなく**正しさの保証**で、
-- 片側に無ければその環境は、もう片側が拒否するデータを受け入れる。
--
-- 測り方（2026-09-21 実測）: `replay-migrations.mjs --keep` の再生 DB と本番の
-- `pg_index where indisunique and not indisprimary` を突き合わせた（本番 141 / 再生 135）。
-- 表ごとの**索引名の md5** で 273 表を比べ、食い違う 23 表を特定した。
-- 最初は表ごとの**件数**で比べたが、1本消えて1本増えた表は件数が一致して隠れる。
-- 実際 3 表を取りこぼした（MISTAKE_LEDGER `M-20260921-compared-counts-where-names-differed`）。
--
-- このファイルは**本番にあって、マイグレーションが作らなかった5件**を足す。
-- 本番では既に在るので no-op。形が変わるのは再生 DB と、これから作られる環境
-- （プレビュー分岐・新しい本番）だけ。
--
-- なぜ重要か: 空 DB から作った環境には、この5つの一意性が無い。
-- 例えば `insurer_users_user_id_key` が無い環境では、**1人のユーザが複数の保険会社に
-- 所属できてしまう**。2026-09-20 の PR #1101 で「複数所属ユーザは現在0人」と書いたが、
-- それは本番にこの制約があるからで、マイグレーションから作った環境では成立しない。
--
-- 残りの3件（`customer_sessions_session_hash_uniq` / `tenants_custom_domain_uniq` /
-- `vehicles_public_id_uidx`）は制約ではなく一意索引なので、`CREATE INDEX CONCURRENTLY` が
-- トランザクション内で動かない制約から、1ファイル1文で別に置いてある（20260921093301〜03）。
--
-- **既知の重複を2組そのまま配ることになる**（/code-review の指摘）:
--   - `job_orders_public_id_key (public_id)` は既存の `idx_job_orders_public_id (public_id)` と同じ
--   - `vehicles_public_id_uidx (public_id)` は既存の `idx_vehicles_public_id (public_id)
--     WHERE public_id IS NOT NULL` と実質同じ（NULL は元々互いに重複扱いされない）
-- `20260603010001` は job_orders を対象から外すとき「`job_orders_public_id_key` は本番のみの
-- ドリフト」と書いており、**重複の解消は専用のマイグレーションに送る**という判断だった。
-- ここでそれを覆さない —— このファイルの目的は「全環境を本番と同じ形にする」ことで、
-- 本番に両方ある以上、片方だけ作ると新しいドリフトになる。
-- **重複を消すなら本番とマイグレーションの両方から1回で落とす**専用の版が要る。
-- 代表判断待ちとして `OPEN_QUESTIONS.md` に残してある（消しても一意性は残る側が担保する）。
--
-- ponytail: 上限。`ALTER TABLE ADD CONSTRAINT ... UNIQUE` は索引を作る間 ACCESS EXCLUSIVE
-- ロックを取り、CONCURRENTLY にはできない（`CREATE UNIQUE INDEX CONCURRENTLY` →
-- `ADD CONSTRAINT ... USING INDEX` の2段が要る）。ここではロックが問題にならない ——
-- **本番では5件とも既に在るので、どの文も実行されない**。新しい環境では空の表に対して走る。
-- 将来この形で**本番に無い**一意制約を足すときは、2段に分けること。
-- ============================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('certificate_images', 'certificate_images_storage_path_key', '(storage_path)'),
      ('insurer_cases',      'insurer_cases_case_number_key',       '(case_number)'),
      ('insurer_users',      'insurer_users_user_id_key',           '(user_id)'),
      ('job_orders',         'job_orders_public_id_key',            '(public_id)'),
      ('nfc_tags',           'nfc_tags_tenant_tag_code_key',        '(tenant_id, tag_code)')
    ) AS v(tbl, con, cols)
  LOOP
    -- conname だけで見ると、他の表に同名の制約があったときに黙って飛ばす。
    -- conrelid まで指定して、その表の制約かどうかを見る。
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.con
        AND conrelid = format('public.%I', r.tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE %s', r.tbl, r.con, r.cols);
    END IF;
  END LOOP;
END $$;
