-- ============================================================
-- マイグレーション（再生 DB）を本番の形へ寄せる —— audit_logs を除く
-- ============================================================
-- 背景: `20260918142610 remote_schema`（`supabase db pull` の生成物）が
-- 2026-09-18 14:26 UTC に**本番だけ**で DROP TABLE / DROP COLUMN / DROP TRIGGER を実行した。
-- repo 側の同じファイルは「破壊的操作を含むので空にした」というコメント4行だけなので、
-- 再生 DB は一度もその DROP を実行していない。結果、同じ版番号のまま両者がずれた。
--
-- 代表判断（2026-09-20）: **マイグレーション側を本番に合わせる**。
-- ただし **`audit_logs` の8列は対象外**にする —— 監査テーブルの構造化列
-- （table_name / record_id / old_values / new_values / performed_by / reason /
-- ip_address / device_id）をスキーマから正式に削る判断は保留し、差分を残したまま
-- `OPEN_QUESTIONS.md` で追う。
--
-- 測り方（2026-09-20 実測）: `node scripts/replay-migrations.mjs --keep` で作った再生 DB と
-- 本番の `information_schema.columns` / `pg_trigger` を突き合わせた。
--   - 再生にだけある列: 12（うち audit_logs 8 は対象外 → ここで落とすのは4）
--   - 本番にだけある列: 15（下の ③）
--   - 再生にだけあるトリガ: 5（下の ①）
--
-- **本番では中身が変わらない**（落とす対象は既に無く、足す対象は既に在る）。
-- ただし ④ のビュー置き直しだけは実際に実行される —— 定義も `security_invoker` も
-- 本番と同一に書いてあるので結果は変わらないが、「1文も実行されない」わけではない。
-- 形が変わるのは再生 DB と、これから作られるプレビュー分岐。
-- ============================================================

-- ── ① 再生にだけあるトリガを落とす ──────────────────────────
-- templates / tenant_memberships / tenants は updated_at 列ごと本番から消えている。
-- 列を先に落とすと set_updated_at が NEW.updated_at を触って実行時に落ちるので、
-- トリガ → 列 の順にする。
DROP TRIGGER IF EXISTS trg_templates_updated_at ON public.templates;
DROP TRIGGER IF EXISTS trg_tm_updated_at ON public.tenant_memberships;
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;

-- nfc_tags / vehicles は updated_at 列が残っているが、本番には新しい名前
-- （trg_nfc_tags_set_updated_at / trg_vehicles_set_updated_at）だけが在る。
-- 再生では**両方**が付いていて同じ関数が二重に発火するので、古い名前を落として揃える。
DROP TRIGGER IF EXISTS trg_nfc_updated_at ON public.nfc_tags;
DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;

-- ── ② 再生にだけある列を落とす（audit_logs は除く）──────────
ALTER TABLE public.insurers DROP COLUMN IF EXISTS max_users;
ALTER TABLE public.templates DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.tenant_memberships DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS updated_at;

-- ── ③ 本番にだけある列を足す ────────────────────────────────
-- 型・NULL 可否・既定値は本番の information_schema.columns から取った。
ALTER TABLE public.agent_signing_requests ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
ALTER TABLE public.certificate_images ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS assigned_user_id UUID;
ALTER TABLE public.insurer_tenant_access ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.insurer_users ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.insurer_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.insurer_users ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS prefecture TEXT;
ALTER TABLE public.signature_sessions ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE public.signature_sessions ADD COLUMN IF NOT EXISTS line_user_id TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS plate_hash TEXT;

-- 本番でこの15列のうち制約が付いているのは documents.assigned_user_id だけ
-- （pg_constraint を conkey で厳密に引いて確認。他の14列は制約なし）。
DO $$
BEGIN
  IF NOT EXISTS (
    -- conname だけで見ると、他の表に同名の制約があったときに黙って飛ばしてしまう。
    -- conrelid まで指定して documents の制約かどうかを見る。
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_assigned_user_id_fkey'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_assigned_user_id_fkey
      FOREIGN KEY (assigned_user_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- ── ④ invoices ビューを本番の定義に揃える ──────────────────
-- `invoices` は表ではなく `documents` のビュー（本番・再生とも）。差の2列
-- （job_status / assigned_user_id）は列の欠落ではなく**ビューの SELECT 一覧の差**なので、
-- ALTER TABLE ADD COLUMN では揃わない（実際 1回目の再生はここで落ちた）。
-- 本番の `pg_get_viewdef` と同じ順序・同じ列で置き直す。前半の列は完全に一致しているので、
-- CREATE OR REPLACE で末尾に2列を足す形になる（③ で documents.assigned_user_id を先に足してある）。
-- **`WITH (security_invoker = on)` を必ず付ける。** PostgreSQL は CREATE OR REPLACE VIEW で
-- reloptions を丸ごと置き換えるので、WITH を省くと本番の `security_invoker=on`（実測で確認）が
-- 剥がれ、ビューが所有者権限で動いて `documents` の RLS を迂回する。定義文が同一でも起きる。
-- 同じ罠がリポジトリ内にも書かれている（20260907010100_repair_unmanaged_objects.sql）。
CREATE OR REPLACE VIEW public.invoices WITH (security_invoker = on) AS
SELECT
  id, tenant_id, customer_id,
  doc_number AS invoice_number,
  issued_at, due_date, status,
  subtotal, tax, total, tax_rate,
  note, items_json,
  is_invoice_compliant, show_seal, show_logo, show_bank_info,
  recipient_name, payment_date,
  vehicle_id, vehicle_info_json,
  created_at, updated_at,
  job_status, assigned_user_id
FROM documents
WHERE doc_type = 'invoice';
