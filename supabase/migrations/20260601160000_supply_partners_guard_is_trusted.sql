-- supply_partners.is_trusted を保護対象に追加する (auto-send 信頼ゲートのタンパー対策)。
--
-- 背景: is_trusted は「運営が承認した信頼パートナーのみ auto-send 対象」を表す
-- プラットフォーム運営専用フラグ。だが当初のガード (supply_partners_guard_protected_cols)
-- は status / agent_id しか差し戻しておらず、RLS の update 権限を持つパートナーが
-- アプリ API を介さず直接 PostgREST で is_trusted=true を自己付与できる隙があった
-- (運営承認ゲートの迂回)。実害は店舗側 opt-in という独立ゲートで限定されるが、
-- 設計意図 (信頼の付与は運営のみ) を守るため is_trusted も非 service-role からの
-- 変更は差し戻す。
--
-- 注:
--   - integration_status は意図的に保護しない。プロフィール更新 API
--     (/api/agent/supply/profile PUT) がパートナー自身のセッションで
--     connected/unconfigured を正規に更新するため。
--   - service-role (auth.uid() IS NULL = 運営/サーバ) は従来どおり is_trusted を設定できる
--     (= 運営が信頼を付与する正規経路)。
--   - 既存トリガ trg_supply_partners_guard はこの関数を参照しているため、
--     CREATE OR REPLACE で定義を差し替えるだけで反映される (トリガ再作成不要)。

CREATE OR REPLACE FUNCTION supply_partners_guard_protected_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status := OLD.status;
    END IF;
    IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
      NEW.agent_id := OLD.agent_id;
    END IF;
    IF NEW.is_trusted IS DISTINCT FROM OLD.is_trusted THEN
      NEW.is_trusted := OLD.is_trusted;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
