-- ============================================================
-- remote_schema が本番だけで落とした制約を戻す（外部キー6 + CHECK 5）
-- ============================================================
-- **このファイルは本番で実際に実行される。**
--
-- `20260918142610 remote_schema`（`supabase db pull` の生成物）は索引 38 本だけでなく
-- **制約も 19 本**落としていた（本番台帳の `statements` を `%drop constraint%` で引いて確認・
-- 2026-09-21）。うち以下は**今も本番に無い**。マイグレーション側には在るので、
-- 空 DB から作った環境とだけ形が違う ——「本番だけが壊れた行を受け入れる」状態である。
--
-- 実害は既に出ている: `tenant_memberships` に **user_id が auth.users に無い行が1件**ある
-- （role=owner・2026-07-26 作成）。この外部キーは `ON DELETE CASCADE` なので、
-- 制約が生きていれば利用者の削除と一緒に消えていた。**この行は消さない** ——
-- 本番データの削除は別の判断なので `OPEN_QUESTIONS.md` に出す。
--
-- **すべて NOT VALID で足す。** 既存行は検査せず、これから入る行だけを縛る。
--   - 上の孤児行があるため、`tenant_memberships` は NOT VALID でないと足せない
--   - 他の5本の外部キーは孤児0件を実測済みだが、揃えて NOT VALID にする
--     （全表走査の ACCESS EXCLUSIVE ロックを避ける。後で `VALIDATE CONSTRAINT` できる）
--
-- CHECK 5本は本番の列が `text` のままで、**代替の enum も無い**ことを確認して選んだ。
-- 本番の既存行がこの5本を満たすことも実測済み（違反 0 件。`insurers.plan_tier` は
-- NULL が1件あるが、CHECK は NULL に対して真でも偽でもないので通る）。
-- 同じ事故で落ちた `certificates_status_check` / `tenants_plan_tier_check` /
-- `tenant_memberships_role_check` は対象外 —— 本番の列がそれぞれ
-- `certificate_status_enum` / `plan_tier_enum` / `membership_role_enum` になっており、
-- enum が同じ役目を果たしている（型そのものの差は OPEN_QUESTIONS へ）。
--
-- ponytail: 上限。`lint-migrations` は `EXECUTE format(...)` の中を読めないので、
-- この DO ブロックの中身に `add-foreign-key-without-not-valid` は効かない。
-- **NOT VALID は人の目で担保している**。素で書くと冪等にできない
-- （`ADD CONSTRAINT` に `IF NOT EXISTS` が無く、DROP してから足し直すと
--  本番で検証済みの制約を未検証に落としてしまう）。
-- ============================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- 外部キー6本（本番から消えている）。定義は**再生 DB の pg_get_constraintdef から
      -- そのまま写した**。最初は名前から推測して書き、CHECK 5本のうち4本を外していた
      -- （MISTAKE_LEDGER `M-20260922-wrote-constraint-bodies-from-their-names`）。
      ('audit_logs',         'audit_logs_tenant_id_fkey',
       'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('certificates',       'certificates_created_by_fkey',
       'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('insurer_users',      'insurer_users_user_id_fkey',
       'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('job_orders',         'job_orders_from_tenant_id_fkey',
       'FOREIGN KEY (from_tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('job_orders',         'job_orders_to_tenant_id_fkey',
       'FOREIGN KEY (to_tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE'),
      ('tenant_memberships', 'tenant_memberships_user_id_fkey',
       'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      -- CHECK 5本（本番から消えていて、enum の代替も無い）
      ('insurers',                'insurers_plan_tier_check',
       'CHECK ((plan_tier = ANY (ARRAY[''basic''::text, ''pro''::text, ''enterprise''::text])))'),
      ('market_inquiries',        'market_inquiries_buyer_email_format',
       'CHECK ((buyer_email ~* ''^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$''::text))'),
      ('market_inquiries',        'market_inquiries_buyer_name_length',
       'CHECK (((char_length(buyer_name) >= 1) AND (char_length(buyer_name) <= 200)))'),
      ('market_inquiries',        'market_inquiries_message_length',
       'CHECK ((char_length(message) <= 2000))'),
      ('market_inquiry_messages', 'market_inquiry_messages_length',
       'CHECK ((char_length(message) <= 2000))')
    ) AS v(tbl, con, def)
  LOOP
    -- conname だけで見ると他の表の同名制約で黙って飛ばすので、conrelid まで見る。
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.con AND conrelid = format('public.%I', r.tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s NOT VALID', r.tbl, r.con, r.def);
    END IF;
  END LOOP;
END $$;
