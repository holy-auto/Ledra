-- 職人の実績を店舗を跨いでまとめる（本人だけが見える束ね）
--
-- 背景:
--   20260903000000 で職人ごとの実績リンク /w/[token] を入れたが、あれは1テナント分しか
--   出せない。同じ職人が複数の元請けに登録されると staff_members は元請けごとに別行に
--   なる（一意制約はテナント内）ため、通算の実績が原理的に出せなかった。複数の元請けの
--   下で動く職人ほど、自分の実績が散らばる構造になっていた。
--
-- 制約（代表判断 2026-09-03）:
--   **他社に自分の稼働先が見えないこと。** A社の元請けが「この職人はB社でも働いている」と
--   分かってはいけない。これが設計を決めている。
--
-- 設計:
--   - 束ねの情報を staff_portfolio_links の行に持たせない。identity_id 列を生やすと、
--     **それが非 NULL であること自体が「他所でも働いている」の漏洩**になる（テナントは
--     自テナントの行を members:manage で読める）。だから別テーブルに出す。
--   - この2テーブルは RLS で **テナントから一切読めない**（USING (false)）。
--     customer_sessions と同じくサービスロール専用。管理画面の API もこれを触らない。
--   - 束ねるのは**本人だけ**。両方のトークンを持っている人しか実行できない
--     （/w/[token] の画面でもう一方のリンクを貼る）。テナント側には操作も表示も無い。
--
-- 結果として各テナントから見えるものは 20260903000000 の時点と変わらない。
-- 増えたのは「本人が自分の画面で複数店舗の実績を並べて見られる」ことだけ。

CREATE TABLE IF NOT EXISTS staff_portfolio_identities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE staff_portfolio_identities IS
  '職人本人が束ねた実績リンクのグループ。テナントからは読めない（本人の画面でのみ使う）。';

CREATE TABLE IF NOT EXISTS staff_portfolio_identity_members (
  identity_id       uuid NOT NULL REFERENCES staff_portfolio_identities(id) ON DELETE CASCADE,
  -- 1本のリンクは高々1つのグループにしか属さない。
  portfolio_link_id uuid NOT NULL UNIQUE REFERENCES staff_portfolio_links(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity_id, portfolio_link_id)
);

COMMENT ON TABLE staff_portfolio_identity_members IS
  'どの実績リンクが同じ職人のものか。テナントからは読めない（ここが見えると他社の稼働先が漏れる）。';

CREATE INDEX IF NOT EXISTS idx_staff_portfolio_identity_members_identity
  ON staff_portfolio_identity_members (identity_id);

ALTER TABLE staff_portfolio_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_portfolio_identity_members ENABLE ROW LEVEL SECURITY;

-- サービスロール専用。**テナントには一切開けない**のがこの機能の要件そのもの。
-- （customer_sessions と同じ形。service_role は RLS を迂回する。）
DROP POLICY IF EXISTS staff_portfolio_identities_service_only ON staff_portfolio_identities;
CREATE POLICY staff_portfolio_identities_service_only ON staff_portfolio_identities
  FOR ALL USING (false);

DROP POLICY IF EXISTS staff_portfolio_identity_members_service_only ON staff_portfolio_identity_members;
CREATE POLICY staff_portfolio_identity_members_service_only ON staff_portfolio_identity_members
  FOR ALL USING (false);
