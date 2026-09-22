-- ============================================================
-- certificate_images.file_size を本番と同じ「既定なし・NOT NULL」へ揃える
-- ============================================================
-- **20260922123100 が持ち込んだ2件目の同種の破壊。**（1件目は vehicles.public_id）
--
-- 20260922123100 は本番の `certificate_images_file_size_check`
-- （`CHECK (file_size > 0)`）をマイグレーション側へ取り込んだ。
-- ところが列の定義そのものが本番と違っていた:
--
--   本番            file_size bigint NOT NULL（既定なし）  → 省略すると 23502 で落ちる
--   マイグレーション file_size bigint DEFAULT 0（NULL 可） → 省略すると 0 が入り 23514 で落ちる
--                   （20260313020000_core_tables.sql:112）
--
-- どちらも「省略した insert は失敗する」が、失敗の仕方が違ううえ、
-- **マイグレーション側は「既定値が自分の CHECK に弾かれる」という自己矛盾**を抱える。
-- 本番に合わせて既定を外し、NOT NULL にする。**本番では両方とも no-op。**
--
-- 実害の有無: 唯一の insert 経路 `src/lib/certificateImages/processUploadedPhoto.ts:222` は
-- `file_size: finalBuffer.length` を必ず渡すので、現時点で落ちている経路は無い。
-- 直すのは、列の定義が本番と食い違ったまま残ると次に触る人が踏むから。
--
-- なぜ見落としたか: vehicles.public_id と同じ型。列の「名前」しか突き合わせていないので、
-- 既定値・NULL 可否・型の食い違いはどの検査にも映らない。本番から CHECK を写すときは
-- **その CHECK が見る列の定義も一緒に写す**。
-- MISTAKE_LEDGER `M-20260922-copied-a-check-without-checking-the-default`。
--
-- SET NOT NULL は NULL 行があると失敗する。本番は 0 件（88 行・2026-09-22 実測）。
-- 空 DB から作った環境でも、唯一の insert 経路が必ず値を渡すので NULL 行は生まれない。
-- 万一残っていれば、ここで**大きな音を立てて止まるのが正しい**（本番のスキーマが
-- 禁じている行を持っている、という意味なので）。
-- ============================================================

ALTER TABLE public.certificate_images
  ALTER COLUMN file_size DROP DEFAULT;

ALTER TABLE public.certificate_images
  ALTER COLUMN file_size SET NOT NULL;
