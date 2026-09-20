-- ============================================================
-- audit_logs: mobile_support 版の旧8列を落とす
-- ============================================================
-- これは **2026-08-23 に予告した後始末** である。
-- `20260823000000_audit_logs_reconcile.sql` は audit_logs を本番の形
-- （actor_type / actor_user_id / target_public_id / query_json / ip …）へ寄せたが、
-- 旧列については「列そのものは次のマイグレーションで落とす
-- （データがある環境で先に落とすと戻せない）」と書いたまま、その次が来ていなかった。
--
-- 代表判断（2026-09-20）: **8列はマイグレーションからも落とす**。
-- `20260920120500` で本番との差を寄せたとき、この8列だけは判断を保留して残していた。
--
-- 落とす8列（`20260325000001_mobile_support.sql` の CREATE TABLE 由来）:
--   table_name / record_id / old_values / new_values / reason /
--   performed_by / device_id / ip_address
--
-- 安全性の根拠（2026-09-20 実測）:
--   - **本番にこの8列は無い**（`information_schema.columns` で audit_logs は12列）。
--     `20260918142610 remote_schema` が本番だけで DROP COLUMN 済み。よって本番では no-op。
--   - **書き込むコードが無い。** audit_logs への insert は `src/lib/audit/tenantLog.ts`
--     の1箇所だけで、12列の形に書いている（`query_json` へまとめる）。
--     `src/types/db.generated.ts` の audit_logs も12列で、この8列を持たない。
--   - よって空 DB から再生した環境でも、この8列に値が入ることはない。
--
-- 副作用: `idx_audit_logs_record (table_name, record_id)` と
-- `performed_by` の auth.users への外部キーは、列と一緒に自動で落ちる
-- （本番にはどちらも無い）。RLS ポリシー2本は `tenant_id` しか見ていないので無傷。
-- ============================================================

ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS table_name;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS record_id;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS old_values;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS new_values;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS reason;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS performed_by;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS device_id;
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS ip_address;
