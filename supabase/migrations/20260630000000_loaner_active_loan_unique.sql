-- =============================================================
-- 代車「貸出中」の一意制約 (二重貸出の防止)
--
-- 1 台の代車に対して未返却 (returned_at IS NULL) の貸出は同時に 1 件まで。
-- POST /api/admin/loaner-cars/loans は「貸出中なら 409」を返すよう
-- アプリ層でガードしているが、チェックと INSERT の間に隙間がある
-- (check-then-act の TOCTOU)。同一代車への同時貸出リクエストが両方とも
-- アクティブ無しと判定して二重に貸出記録を作り得るため、DB 側の部分
-- ユニーク索引で最終防壁を張る。アプリ側は一意制約違反 (23505) を 409 に
-- 変換する。
--
-- CREATE UNIQUE INDEX CONCURRENTLY はトランザクション内で実行できないため
-- 独立した migration ファイルに置く (既存 uq_brj_track_token と同方針)。
-- 既存データに二重「貸出中」が無いことを前提とする (アプリ層ガードにより
-- 通常は発生しない)。万一存在する場合は本索引が INVALID になるため、
-- 重複返却の補正後に再作成すること。
-- =============================================================

create unique index concurrently if not exists uq_loaner_active_loan
  on loaner_car_loans (loaner_car_id) where returned_at is null;
