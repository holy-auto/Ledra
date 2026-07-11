-- =============================================================
-- tenant_daily_digests: 店長向け「今日のまとめ」(AIマネージャー) の保存
--
-- deriveTodayTasks が決定論で確定したタイル (件数) を、日次 cron
-- (/api/cron/daily-digest) が AI で自然文ブリーフィングに整形して 1 日 1 行
-- 保存する。ダッシュボードはこの当日行を読み、無ければ描画時に決定論版へ
-- フォールバックする (描画のたびに AI を呼ばない = コスト安全)。
--
-- 生成は AI マスタースイッチ ON かつコストキャップ未超過のテナントのみ
-- (loadAiAutomationSettings.enabled)。数値はすべてタイル(SQL)由来で、AI は
-- 言い換えるだけ (CLAUDE.md「AI は事実を作ってはいけない」)。
--
-- 書き込みは cron の service role のみ (RLS を bypass)。一般ユーザには
-- SELECT だけ許可する。
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant_daily_digests (
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  -- 対象日 (店舗のローカル日付相当。cron 実行日で 1 日 1 行)
  digest_date date NOT NULL,
  -- 店長に見せる本文
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  -- true=AI 整形版、false=決定論フォールバックを保存した
  ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, digest_date)
);

COMMENT ON TABLE tenant_daily_digests IS
  '日次 cron が保存する店長向け「今日のまとめ」。当日 1 行。書込は service role のみ。';

-- updated_at は共有トリガで自動更新 (core_tables の set_updated_at())
DROP TRIGGER IF EXISTS trg_tenant_daily_digests_updated_at ON tenant_daily_digests;
CREATE TRIGGER trg_tenant_daily_digests_updated_at
  BEFORE UPDATE ON tenant_daily_digests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: 参照はテナントメンバーのみ。書き込みポリシーは作らない
-- (cron の service role は RLS を bypass するため不要。一般ユーザには書かせない)。
ALTER TABLE tenant_daily_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_daily_digests_select ON tenant_daily_digests;
CREATE POLICY tenant_daily_digests_select ON tenant_daily_digests
  FOR SELECT USING (tenant_id IN (SELECT my_tenant_ids()));
