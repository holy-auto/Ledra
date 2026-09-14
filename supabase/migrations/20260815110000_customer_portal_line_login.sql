-- =============================================================================
-- 顧客ポータル: LINE 連携による email 不要ログイン
--
-- 背景:
--   マイページのログインは email + 電話下4桁の OTP のみ。email を持たない顧客
--   (受信箱からスタッフが作った顧客・登録フォームで email を空にした顧客) は
--   URL を開いても入れなかった。
--
--   LINE 連携済みの顧客は既に本人性が確認できている (customers.line_user_id) ため、
--   連携時に単回使用・期限付きのログイントークンを発行し、LINE のトーク経由でのみ
--   届く URL から customer_id 紐付きのポータルセッションを張れるようにする。
--
-- 変更点:
--   1. customer_sessions … email / phone_last4_hash を NULL 許容にし、
--      「customer_id があるか、email+phone_last4_hash が揃っているか」を CHECK で強制。
--      スコープの無いセッションが生まれないことを DB 側で担保する。
--   2. customer_portal_login_tokens … 単回使用のログイントークン (ハッシュのみ保存)。
--   3. customer_inquiries … customer_id を追加し phone_last4_hash を NULL 許容に。
--      LINE セッションには下4桁ハッシュが無いため。
--   4. customer_deletion_requests … email を NULL 許容に (同上)。
-- =============================================================================

-- ─── 1. customer_sessions ────────────────────────────────────────────────────
ALTER TABLE customer_sessions ALTER COLUMN email DROP NOT NULL;
ALTER TABLE customer_sessions ALTER COLUMN phone_last4_hash DROP NOT NULL;

-- スコープを持たないセッション (email も phone も customer_id も無い) を禁止する。
-- これが無いと、どの顧客のデータも引けない/引けてしまうセッションが作れてしまう。
-- NOT VALID で追加 → 別途 VALIDATE。既存行の全走査を ACCESS EXCLUSIVE で行わないため
-- (VALIDATE は SHARE UPDATE EXCLUSIVE で読み書きを止めない)。
-- 追加前は email / phone_last4_hash とも NOT NULL だったので、既存行はすべて条件を満たす。
ALTER TABLE customer_sessions DROP CONSTRAINT IF EXISTS customer_sessions_identity_present;
ALTER TABLE customer_sessions ADD CONSTRAINT customer_sessions_identity_present
  CHECK (
    customer_id IS NOT NULL
    OR (email IS NOT NULL AND phone_last4_hash IS NOT NULL)
  ) NOT VALID;
ALTER TABLE customer_sessions VALIDATE CONSTRAINT customer_sessions_identity_present;

-- customer_id の外部キーを SET NULL → CASCADE に変える。
-- SET NULL のままだと、顧客削除時に LINE セッション (email も下4桁も NULL) の
-- customer_id だけが NULL になり、上の CHECK に違反して**削除そのものが失敗する**
-- （個人情報の削除請求の実行経路が壊れる）。削除された顧客のセッションは残しても
-- 何も引けないので、一緒に消すのが正しい。
-- NOT VALID で追加 → 別途 VALIDATE（既存行の全走査で ACCESS EXCLUSIVE を取らない）。
-- 参照先は張り替え前と同じ customers(id) なので、既存行はすべて条件を満たす。
ALTER TABLE customer_sessions DROP CONSTRAINT IF EXISTS customer_sessions_customer_id_fkey;
ALTER TABLE customer_sessions
  ADD CONSTRAINT customer_sessions_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE customer_sessions VALIDATE CONSTRAINT customer_sessions_customer_id_fkey;

COMMENT ON COLUMN customer_sessions.email IS
  'OTP ログイン時の email。LINE ログインで作られたセッションは NULL で、customer_id が識別子になる。';

-- ─── 2. customer_portal_login_tokens ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_portal_login_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  -- 生トークンは保存しない (sha256 + pepper のみ)。漏洩時に DB から復元できないように。
  token_hash    text NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_portal_login_tokens ENABLE ROW LEVEL SECURITY;

-- service role のみ (顧客・店舗ユーザーからの直接アクセスは無し)
CREATE POLICY "customer_portal_login_tokens_service_only" ON customer_portal_login_tokens
  FOR ALL
  USING (false);

-- 引き当ては token_hash 一本。単回使用のクレームは used_at IS NULL 条件付き UPDATE で行う。
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_portal_login_tokens_hash
  ON customer_portal_login_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_customer_portal_login_tokens_expires
  ON customer_portal_login_tokens (expires_at)
  WHERE used_at IS NULL;

-- ─── 3. customer_inquiries ──────────────────────────────────────────────────
ALTER TABLE customer_inquiries
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers (id) ON DELETE SET NULL;

ALTER TABLE customer_inquiries ALTER COLUMN phone_last4_hash DROP NOT NULL;

-- ここには「customer_id か phone_last4_hash のどちらかは必ずある」CHECK を**付けない**。
-- customer_id は顧客削除時に SET NULL になるため、LINE 経由の問い合わせ (下4桁ハッシュ
-- 無し) があると顧客削除が CHECK 違反で失敗してしまう。問い合わせ記録は顧客が消えても
-- 残す方が既存挙動に沿う (どちらも NULL の孤児行になるだけで害は無い)。
-- 書き込み側 (`/api/customer/inquiry`) はセッションから必ずどちらかを入れる。
ALTER TABLE customer_inquiries DROP CONSTRAINT IF EXISTS customer_inquiries_identity_present;

-- customer_id 索引は CONCURRENTLY が要るため別ファイル
-- (20260815110001_customer_inquiries_customer_index.sql)。

-- ─── 4. customer_deletion_requests ──────────────────────────────────────────
ALTER TABLE customer_deletion_requests ALTER COLUMN email DROP NOT NULL;

-- こちらも CHECK は**付けない**。customer_id は顧客削除時に SET NULL になるため、
-- LINE 経由の削除請求 (email 無し) があると、その請求が実行される瞬間に CHECK 違反で
-- 削除が失敗する — 削除請求そのものを実行不能にする自己矛盾になる。
-- 請求記録は「いつ誰の依頼で消したか」の証跡なので、顧客が消えても残す。
ALTER TABLE customer_deletion_requests DROP CONSTRAINT IF EXISTS customer_deletion_requests_identity_present;
