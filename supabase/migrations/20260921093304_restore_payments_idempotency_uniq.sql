-- ============================================================
-- 決済の冪等キーの一意性を本番へ戻す
-- ============================================================
-- **これは本番で実際に実行される文である**（このシリーズで唯一、no-op でないもののひとつ）。
--
-- `idx_payments_idempotency` はマイグレーションが作る一意索引だが、**本番には無い**。
-- 消えた経路は事故: `20260918142610 remote_schema`（`supabase db pull` の生成物）が
-- 2026-09-18 14:26 UTC に本番だけで **38 本の DROP INDEX** を実行しており、その中に在る
-- （本番台帳の `statements` を `drop index%` で引いて確認・2026-09-21）。
--
-- つまり **2026-09-18 以降、本番は同じ `idempotency_key` を持つ payments 行を
-- 2つ受け入れる状態だった。** 冪等キーは「同じ決済を二重に記録しない」ための鍵なので、
-- これは性能ではなく正しさの欠落である。
--
-- 事前確認（2026-09-21 実測）: payments は 11 行、`idempotency_key` が非 NULL の行は **0 件**、
-- 重複キーは **0 件**。よって作成は失敗しない。
-- CONCURRENTLY を使うのは作法どおり（本番の書き込みを止めないため）。1ファイル1文。
-- ============================================================
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_idempotency
  ON public.payments USING btree (idempotency_key)
  WHERE (idempotency_key IS NOT NULL);
