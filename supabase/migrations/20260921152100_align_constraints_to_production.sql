-- ============================================================
-- 本番にあって、マイグレーションが作らない制約を足す（CHECK 9 + 外部キー3）
-- ============================================================
-- **本番では no-op。** 形が変わるのは再生 DB と、これから作られる環境だけ。
--
-- 2026-09-21 の実測（`--keep` の再生 DB ⇄ 本番、表ごとの制約名 md5 で比較）:
--   - CHECK: 本番 329 / 再生 328。食い違う表 12、本番にだけ 9 本・再生にだけ 8 本
--   - 外部キー: 本番 597 / 再生 600。食い違う表 8、本番にだけ 3 本・再生にだけ 6 本
-- 「再生にだけ」の側（＝本番から消えたもの）は `20260921152000` で戻す。
-- こちらは逆向き —— **本番が弾く値を、空 DB から作った環境だけが受け入れてしまう**側。
--
-- 定義は本番の `pg_get_constraintdef` からそのまま写した（名前から推測しない）。
--
-- 既知の重複2組（本番にそのまま在るので、片方だけ作ると新しいドリフトになる）:
--   - `certificate_images_tenant_id_fkey` (CASCADE) は既存の `fk_certimg_tenant`
--     (RESTRICT) と同じ列。**当初このヘッダには「厳しい側（RESTRICT）が効く」と書いたが、
--     それは誤りだった**（/code-review の指摘）。同じイベントに付いた RI トリガは
--     **名前順**に発火し、その名前は制約の OID を含む。どちらが先に走るかは
--     **制約を作った順**で決まる。
--
--     実測（2026-09-22）:
--       本番    CASCADE  oid=26232  <  RESTRICT oid=39885  → **CASCADE が先**
--       再生 DB RESTRICT oid=18244  <  CASCADE  oid=25739  → **RESTRICT が先**
--     再生 DB では実際にテナントを消してみて、`fk_certimg_tenant` に止められることを確認した。
--     本番では逆順なので、**テナント削除は `certificate_images` を黙って道連れにする**
--     見込み（推定。本番で削除を試すわけにいかないので未検証。
--     `certificate_images` に行があるテナントを1件消せば確定する）。
--
--     **このファイルは本番の振る舞いを変えない**（本番には両方あるので no-op）。
--     変わるのは再生 DB とこれから作る環境で、そこでは RESTRICT が先になる ——
--     つまり**名前は揃うが、振る舞いは揃わない**。名前しか見ない検出器には映らない差である。
--     根治は2本のうち1本を消すこと（どちらを残すかは product 判断）。`OPEN_QUESTIONS` へ。
--   - `insurer_access_logs_insurer_user_fk` は既存の `fk_ial_insurer_user` と同じ列。
--     本番では NOT VALID のまま。ここでも NOT VALID で足して本番と同じにする。
--   どちらを残すかは `OPEN_QUESTIONS.md`（公開IDの重複索引と同じ扱い）。
--
-- ponytail: 上限。`lint-migrations` は `EXECUTE format(...)` の中を読めないので、
-- 外部キーの `add-foreign-key-without-not-valid` はこの DO ブロックに効かない。
-- 3本とも NOT VALID で足している（本番では既に在るので実際には実行されない）。
-- ============================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- ── CHECK 9本 ────────────────────────────────────────────
      ('certificate_images', 'certificate_images_file_size_check',
       'CHECK ((file_size > 0))'),
      ('customers', 'customers_line_link_status_check',
       'CHECK ((line_link_status = ANY (ARRAY[''unlinked''::text, ''pending''::text, ''linked''::text])))'),
      ('documents', 'documents_job_status_check',
       'CHECK ((job_status = ANY (ARRAY[''draft''::text, ''booked''::text, ''in_progress''::text, ''qc''::text, ''ready''::text, ''delivered''::text])))'),
      ('insurer_access_logs', 'insurer_access_logs_action_check',
       'CHECK ((action = ANY (ARRAY[''view''::text, ''search''::text, ''download_pdf''::text, ''export_csv''::text])))'),
      ('job_orders', 'job_orders_budget_max_check',
       'CHECK ((budget_max >= 0))'),
      ('job_orders', 'job_orders_budget_min_check',
       'CHECK ((budget_min >= 0))'),
      ('job_orders', 'job_orders_service_category_check',
       'CHECK ((service_category = ANY (ARRAY[''window_film''::text, ''body_glass_coat''::text, ''ppf''::text, ''wrap''::text, ''other''::text])))'),
      ('tenants', 'tenants_custom_domain_format',
       'CHECK (((custom_domain IS NULL) OR ((custom_domain !~* ''^\s*$''::text) AND (custom_domain !~* ''https?://''::text) AND (custom_domain !~ ''/''::text) AND (custom_domain ~* ''^[a-z0-9.-]+\.[a-z]{2,}$''::text))))'),
      ('vehicles', 'vehicles_public_id_format_chk',
       'CHECK ((public_id ~ ''^v_[0-9a-f]{24}$''::text))'),
      -- ── 外部キー3本 ──────────────────────────────────────────
      ('agent_signing_requests', 'agent_signing_requests_ledra_session_id_fkey',
       'FOREIGN KEY (ledra_session_id) REFERENCES public.signature_sessions(id) ON DELETE SET NULL'),
      ('certificate_images', 'certificate_images_tenant_id_fkey',
       'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('insurer_access_logs', 'insurer_access_logs_insurer_user_fk',
       'FOREIGN KEY (insurer_user_id) REFERENCES public.insurer_users(id)')
    ) AS v(tbl, con, def)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.con AND conrelid = format('public.%I', r.tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s NOT VALID', r.tbl, r.con, r.def);
    END IF;
  END LOOP;
END $$;
