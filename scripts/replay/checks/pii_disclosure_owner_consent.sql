-- 保険会社への氏名開示が「保険会社の申請 AND オーナー本人の同意」だけで決まるかを、行を入れて確かめる。
--
-- なぜ要るか: is_pii_disclosed() の条件を1行落としても構文も型も通る。プライバシーポリシーは
-- 「ご本人の同意がある場合に限り開示」と書いているので、**同意なしで真になったら約束違反**になる。
-- 逆に、外したはずの施工店の承認が条件に残ると、承認画面が無いので開示が永久に通らない。
-- 20260927120342（同意を追加）→ 20260927142855（施工店の承認を外す）。代表判断 2026-09-27。
--
-- 最後に ROLLBACK するので DB には何も残らない。
-- 走らせ方: npm run check:migrations（再生の最後に自動で走る）

BEGIN;

INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-4000-8000-0000000003a1', 'owner-consent tenant', 'owner-consent-tenant');

INSERT INTO public.insurers (id, name, slug, is_active, status)
VALUES ('00000000-0000-4000-8000-0000000003b1', 'owner-consent insurer', 'owner-consent-insurer', true, 'active');

INSERT INTO public.certificates (id, tenant_id, public_id)
VALUES ('00000000-0000-4000-8000-0000000003c1', '00000000-0000-4000-8000-0000000003a1', 'owner-consent-cert');

-- 保険会社の申請だけがある（施工店の承認もオーナーの同意も無い）。
INSERT INTO public.pii_disclosure_consents
  (id, certificate_id, insurer_id, is_active, insurer_requested_at)
VALUES ('00000000-0000-4000-8000-0000000003d1', '00000000-0000-4000-8000-0000000003c1',
        '00000000-0000-4000-8000-0000000003b1', true, now());

DO $$
DECLARE
  k_cert    CONSTANT uuid := '00000000-0000-4000-8000-0000000003c1';
  k_insurer CONSTANT uuid := '00000000-0000-4000-8000-0000000003b1';
  k_row     CONSTANT uuid := '00000000-0000-4000-8000-0000000003d1';
BEGIN
  -- ── 陰性対照1: オーナーの同意が無ければ開示しない（施工店が承認していても）──
  UPDATE public.pii_disclosure_consents SET tenant_consented_at = now() WHERE id = k_row;
  IF public.is_pii_disclosed(k_cert, k_insurer) THEN
    RAISE EXCEPTION 'オーナー本人の同意なしで開示が真になった。is_pii_disclosed() から owner_consented_at の条件が落ちている';
  END IF;

  -- ── 陽性対照: 申請とオーナーの同意だけで開示する（施工店の承認は不要）──
  UPDATE public.pii_disclosure_consents SET tenant_consented_at = NULL, owner_consented_at = now() WHERE id = k_row;
  IF NOT public.is_pii_disclosed(k_cert, k_insurer) THEN
    RAISE EXCEPTION '申請とオーナーの同意が揃っても開示が偽。施工店の承認の条件が残っている（承認画面が無いので永久に開示されない）';
  END IF;

  -- ── 陰性対照2: 保険会社の申請が無ければ開示しない ──
  UPDATE public.pii_disclosure_consents SET insurer_requested_at = NULL WHERE id = k_row;
  IF public.is_pii_disclosed(k_cert, k_insurer) THEN
    RAISE EXCEPTION '保険会社の申請なしで開示が真になった';
  END IF;

  -- ── 陰性対照3: 取り消した行は開示しない ──
  UPDATE public.pii_disclosure_consents SET insurer_requested_at = now(), revoked_at = now() WHERE id = k_row;
  IF public.is_pii_disclosed(k_cert, k_insurer) THEN
    RAISE EXCEPTION '取り消し済みの行で開示が真になった';
  END IF;

  RAISE NOTICE 'オーナー同意ゲート: 陽性対照1件・陰性対照3件すべて期待どおり';
END $$;

ROLLBACK;
