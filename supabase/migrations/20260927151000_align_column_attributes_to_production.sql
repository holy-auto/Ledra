-- 本番と「マイグレーションだけから作った DB」の列属性の食い違いを揃える（残り全部）。
--
-- どう洗い出したか
-- ----------------
-- 2026-09-27 に、本番と `--keep` で残した再生 DB の `information_schema.columns` を
-- **同じクエリで**引き、列ごとに（型・udt・長さ・精度・位取り・NULL 可否・既定値）の
-- digest を取って突き合わせた。280 表のうち **268 表は完全一致**で、差は 12 表・
-- 310 セル中 25 セル・属性単位で 39 件だった。
--
-- 内訳と本 PR の扱い
-- ------------------
--   (1) 本番のほうが厳しい NOT NULL …… 12 列 → 本 PR で揃える（**本番では no-op**）
--   (2) 再生のほうが厳しい NOT NULL ……  2 列 → 本 PR で緩める（後述。実害あり）
--   (3) 既定値の有無・値の違い     ……  4 列 → 本 PR で揃える
--   (4) enum か text か（型そのもの）…… 5 列 + ビュー2列 → **本 PR では触らない**（後述）
--
-- (2) が一番効く: 新しい環境が、本番が実際に書いている行を拒否していた
-- ---------------------------------------------------------------------
--   - `audit_logs.tenant_id`: 本番は NULL 可で、**349 行のうち 337 行が NULL**（実測）。
--     再生側は NOT NULL だったので、`INSERT INTO audit_logs (action) VALUES (...)` は
--     再生・プレビュー DB で 23502 になる（実測）。本番で通る監査ログの書き込みの
--     大半が、新しい環境では落ちていた。
--   - `insurers.plan_tier`: 本番は NULL 可・既定なしで、2 行のうち 1 行が NULL（実測）。
--     再生側は NOT NULL・既定 `'basic'` で、本番に無い値を勝手に入れていた。
--
-- (4) を触らない理由
-- ------------------
-- `certificates.status` / `certificates.expiry_type` / `tenants.plan_tier` /
-- `templates.scope` / `tenant_memberships.role` は本番が enum・マイグレーションが text。
-- これは稼働中の状態語彙の置き換えなので **IMP-015 の判断待ち**（CLAUDE.md / docs/adr/0002）。
-- ビューの `certificates_public.status` / `.expiry_type` は元の列の型を継ぐだけなので、
-- 元が直れば自動で揃う。**本 PR では NULL 可否と既定値だけを揃え、型は変えない。**
-- 検出器（`check-schema-drift.mjs`）はこの5列を既に「報告のみ」で可視化している（#1157）。

-- ── (1) 本番が NOT NULL、再生が NULL 可だった 12 列 ──────────────────────────
-- 本番はすでに NOT NULL なので、本番では 12 文すべて no-op。
ALTER TABLE public.certificates ALTER COLUMN content_preset_json SET NOT NULL;
ALTER TABLE public.certificates ALTER COLUMN current_version SET NOT NULL;
ALTER TABLE public.certificates ALTER COLUMN expiry_type SET NOT NULL;
ALTER TABLE public.certificates ALTER COLUMN footer_variant SET NOT NULL;
ALTER TABLE public.certificates ALTER COLUMN vehicle_info_json SET NOT NULL;
ALTER TABLE public.insurer_access_logs ALTER COLUMN meta SET NOT NULL;
ALTER TABLE public.insurers ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.reservations ALTER COLUMN source SET NOT NULL;
ALTER TABLE public.tenants ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.vehicles ALTER COLUMN maker SET NOT NULL;
ALTER TABLE public.vehicles ALTER COLUMN model SET NOT NULL;
ALTER TABLE public.vehicles ALTER COLUMN public_id SET NOT NULL;

-- ── (2) 再生のほうが厳しく、本番の実データを拒否していた 2 列 ────────────────
ALTER TABLE public.audit_logs ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.insurers ALTER COLUMN plan_tier DROP NOT NULL;
ALTER TABLE public.insurers ALTER COLUMN plan_tier DROP DEFAULT;

-- ── (3) 既定値 ───────────────────────────────────────────────────────────────
-- 本番にあって再生に無かったもの。`certificates.public_id` は #1124 で直した
-- `vehicles.public_id` と同じ形で、**省いて insert すると再生側は 23502**（実測）。
ALTER TABLE public.certificates ALTER COLUMN public_id SET DEFAULT generate_public_id();
ALTER TABLE public.certificates ALTER COLUMN service_type SET DEFAULT 'coating';
-- 本番に無く再生だけが持っていたもの。省略時に本番と違う値が入るのを止める。
ALTER TABLE public.certificates ALTER COLUMN customer_name DROP DEFAULT;
ALTER TABLE public.templates ALTER COLUMN scope DROP DEFAULT;
