-- =============================================================
-- manufacturer_notifications: メーカー向け in-app 通知
--
-- tenant 版 notifications（20260324160000）の姉妹表。tenant_id ではなく
-- manufacturer_id で束ね、RLS は my_manufacturer_ids() で見る。
--
-- なぜ別表か: notifications は tenant_id NOT NULL REFERENCES tenants(id) で、
-- メーカーは tenant ではない（別エンティティ・my_manufacturer_ids()）。1つの表・
-- 1つのカラムに2つの宛先軸を混ぜない（CLAUDE.md ドメイン語彙ルール）。姉妹表
-- insurer_notifications と同じ方針。
--
-- 用途: 施工店の証拠提出（ft_evidence_submitted）など、メーカーが次に動くべき
-- イベントをメーカーポータルのベルへ届ける。作成は notifyFtManufacturer
-- （サービスロール INSERT）経由のみ。
-- =============================================================

CREATE TABLE IF NOT EXISTS manufacturer_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id   uuid NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- null = メーカー全員
  notification_type text NOT NULL,
  priority          text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','normal')),
  title             text NOT NULL,
  body              text,
  link_path         text,             -- /manufacturer/field-test/{projectId} 等
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE manufacturer_notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: 自メーカー宛 & (全員向け or 自分向け)
DROP POLICY IF EXISTS "manufacturer_notifications_select" ON manufacturer_notifications;
CREATE POLICY "manufacturer_notifications_select" ON manufacturer_notifications FOR SELECT
  USING (
    manufacturer_id IN (SELECT my_manufacturer_ids())
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- UPDATE: 既読マーク用
DROP POLICY IF EXISTS "manufacturer_notifications_update" ON manufacturer_notifications;
CREATE POLICY "manufacturer_notifications_update" ON manufacturer_notifications FOR UPDATE
  USING (
    manufacturer_id IN (SELECT my_manufacturer_ids())
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- INSERT ポリシーは意図的に無し。作成はサービスロール（notifyFtManufacturer）のみ。
-- authenticated ユーザーが直接 INSERT することはない。

CREATE INDEX IF NOT EXISTS idx_mfr_notifications_unread
  ON manufacturer_notifications(manufacturer_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mfr_notifications_user
  ON manufacturer_notifications(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ponytail: realtime publish は付けない。メーカーベルは tenant 版と同じくポーリング
-- （60s）で、realtime 購読者がいないため。将来リアルタイム配信するなら
-- `ALTER PUBLICATION supabase_realtime ADD TABLE manufacturer_notifications;` を別途。
