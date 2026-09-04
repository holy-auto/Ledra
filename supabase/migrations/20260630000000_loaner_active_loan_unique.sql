-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- =============================================================
-- 代車「貸出中」の一意制約 (二重貸出の防止)
--
-- 1 台の代車に対して未返却 (returned_at IS NULL) の貸出は同時に 1 件まで。
-- POST /api/admin/loaner-cars/loans は「貸出中なら 409」をアプリ層でガード
-- しているが、貸出中チェックと INSERT の間に隙間がある (check-then-act の
-- TOCTOU)。同一代車への同時貸出リクエストが両方ともアクティブ無しと判定して
-- 二重に貸出記録を作り得るため、DB 側の部分ユニーク索引で最終防壁を張る。
-- アプリ側は一意制約違反 (23505) を 409 に変換する。
--
-- 元は CREATE UNIQUE INDEX CONCURRENTLY のため（このファイルは 2026-09-04 に CONCURRENTLY を外した。冒頭の注を参照）、
-- 独立した migration ファイルに置く (既存 uq_brj_track_token と同方針)。
--
-- 再実行耐性 (Codex review #630):
--   重複した「貸出中」行が既に存在する / ビルド中に発生すると、索引
--   ビルドは失敗して INVALID な索引を残す。`CREATE ... IF NOT EXISTS` のままだと
--   次回再実行がその無効索引を温存したまま migration を成功扱いにし、一意性を
--   一切強制できない。そこで:
--     (1) 事前に重複を検出したら無効索引を作らず明示的に失敗させる。
--     (2) ビルド失敗が残し得る既存(無効含む)索引を、貼り直す前に必ず DROP する。
-- =============================================================

-- (1) 既存の重複「貸出中」を検出したら、無効索引を作る前に明示的に失敗させる。
--     (アプリ層ガードにより通常は発生しないが、移行データ等で残っている可能性に備える)
do $$
begin
  if exists (
    select 1
    from loaner_car_loans
    where returned_at is null
    group by loaner_car_id
    having count(*) > 1
  ) then
    raise exception
      '重複する「貸出中」の代車貸出が存在します。先に重複を解消してから本 migration を再実行してください。';
  end if;
end $$;

-- (2) 失敗ビルドが残した無効索引を温存しないよう、貼り直す前に必ず落とす
--     (索引未作成なら no-op。lint: DROP INDEX IF EXISTS は許容)。
drop index if exists uq_loaner_active_loan;

create unique index uq_loaner_active_loan
  on loaner_car_loans (loaner_car_id) where returned_at is null;
