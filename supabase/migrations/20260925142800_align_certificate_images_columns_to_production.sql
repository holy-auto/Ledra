-- `certificate_images` の列定義を本番に揃える（残っていた3件）。
--
-- 何が食い違っていたか
-- --------------------
-- 2026-09-25 に、本番と「マイグレーションだけから作った DB」の同じ表を
-- **同じクエリで引いて突き合わせた**（information_schema.columns の
-- 列名・型・精度・NULL 可否・既定値）。45 列のうち差は次の3件だけで、他は完全一致。
--
--   | 列             | 本番        | 再生 DB    |
--   |----------------|-------------|------------|
--   | `file_name`    | NOT NULL    | NULL 可    |
--   | `content_type` | NOT NULL    | NULL 可    |
--   | `sort_order`   | 既定 1      | 既定 0     |
--
-- `file_size` だけは 20260922141100（#1124）で先に揃えていた。
-- 残りがこの3件である。
--
-- なぜ気づけていなかったか
-- ------------------------
-- ドリフト検出器（`scripts/check-schema-drift.mjs`）と `check:schema` は
-- **列の「名前」しか突き合わせていない**（検出器の「ponytail: 上限その2」に
-- 明記されている既知の限界）。名前は両側にあるので、NULL 可否・既定値・型の
-- 食い違いはどちらの検査にも映らない。再生も「流せるか」だけを見ている。
--
-- 本番に合わせる向きにした理由
-- ----------------------------
-- 本番のほうが厳しく（NOT NULL）、かつ実データと整合している。2026-09-25 実測で
-- 本番 88 行・`file_name` / `content_type` / `sort_order` の NULL はいずれも0件。
-- したがって**本番では3文とも no-op**で、直るのは新しく作る環境（プレビュー DB・
-- 手元の再生）の側。
--
-- 書き手は2箇所。どちらも3列とも常に明示で渡すので、NOT NULL にしても落ちない。
--   - `src/lib/certificateImages/processUploadedPhoto.ts`（本番の経路。`file_name` は
--     `photo_N.ext` のフォールバック付き、`content_type` は `validateMagicBytes()` の
--     4値のいずれかで、空文字にはならない）
--   - `scripts/setup-demo-tenant.ts` のデモ投入（汎用 `upsert()` ヘルパ経由なので
--     `from("certificate_images").insert` を grep しても出ない。最初これを取りこぼした
--     —— MISTAKE_LEDGER `M-20260925-grep-missed-the-generic-upsert-helper`）
-- SQL 関数からの insert は本番に無いことを `pg_proc` で確認した。`sort_order` の既定も実際には使われないが、
-- 揃えておかないと「同じマイグレーションから作った DB が本番と違う」状態が残る。

ALTER TABLE public.certificate_images
  ALTER COLUMN file_name SET NOT NULL;

ALTER TABLE public.certificate_images
  ALTER COLUMN content_type SET NOT NULL;

ALTER TABLE public.certificate_images
  ALTER COLUMN sort_order SET DEFAULT 1;
