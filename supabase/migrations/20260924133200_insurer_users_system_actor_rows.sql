-- 3/4: 既存の保険会社ぶんのシステム行を作り、以後は増えるたびに自動で作る。
--
-- role は CHECK (`admin` / `viewer` / `auditor`) が許す中で最も弱い `viewer`。
-- is_active = false にしているのは、この行でログインすることが無く、
-- 「有効な利用者」を数える画面に混ざらないようにするため。

INSERT INTO public.insurer_users (insurer_id, user_id, role, is_active, is_system, display_name, note)
SELECT i.id, NULL, 'viewer', false, true, 'システム (自動処理)',
       'AI 自動処理が insurer_access_logs に監査行を残すための行。人ではない。ログイン不可 (user_id なし)。'
FROM public.insurers i
WHERE NOT EXISTS (
  SELECT 1 FROM public.insurer_users u WHERE u.insurer_id = i.id AND u.is_system
);

-- 保険会社が増えたら自動で作る。アプリ側の作成経路が複数ありうるため、
-- 入口ごとに足すのではなく DB 側で一度に閉じる（MISTAKE_LEDGER 型 C）。
CREATE OR REPLACE FUNCTION public.ensure_insurer_system_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.insurer_users (insurer_id, user_id, role, is_active, is_system, display_name, note)
  VALUES (NEW.id, NULL, 'viewer', false, true, 'システム (自動処理)',
          'AI 自動処理が insurer_access_logs に監査行を残すための行。人ではない。ログイン不可 (user_id なし)。')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insurers_ensure_system_actor ON public.insurers;
CREATE TRIGGER trg_insurers_ensure_system_actor
  AFTER INSERT ON public.insurers
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_insurer_system_actor();
