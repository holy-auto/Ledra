-- ============================================================
-- insurer_access_logs.action の語彙を、アプリが実際に書く 20 種へ広げる
-- ============================================================
-- **これは本番の機能停止の修正である。**
--
-- `insurer_access_logs_action_check` は
-- `view` / `search` / `download_pdf` / `export_csv` の4値しか許さない。
-- ところがアプリは 16 種類をその外に書いており、本番で弾かれていた
-- （2026-09-22 に本番で insert を試して 23514 を実測。ROLLBACK 済み）。
--
-- 被害は書き込み経路で二つに分かれていた:
--
--   (A) SQL 関数の中の insert —— **関数ごと中断する**
--       insurer_search_vehicles           'vehicle_search'  → GET /api/insurer/vehicles
--       insurer_search_stores             'store_search'    → GET /api/insurer/stores
--       insurer_get_vehicle_certificates  'vehicle_view'    → GET /api/insurer/vehicles/[id]
--       3本とも例外ハンドラが無く `RETURN QUERY` の**前**に insert するので、
--       検索結果が1件も返らない。保険会社ポータルのこの3画面は本番で必ず 500。
--
--   (B) TypeScript の直 insert —— 戻り値の error を見ていないので**黙って記録だけ落ちる**。
--       案件操作（case_*）・不正検知（fraud_check*）・PII 開示請求・CSV/PDF 出力の記録が
--       1件も残っていなかった（本番の insurer_access_logs は2行・どちらも `search`）。
--
-- **語彙の出し方**（前回 TypeScript だけを走査して3件取りこぼした反省を踏まえ、
-- 書き込み経路を3つとも当たった。MISTAKE_LEDGER
-- `M-20260922-enumerated-actions-from-typescript-only`）:
--
--   1. `from("insurer_access_logs").insert({...})` の `action`（TypeScript 12 箇所）
--   2. `rpc("insurer_audit_log", { p_action })` の実引数（TypeScript 3 箇所）
--      —— **ドット区切り**なので `[a-z_]+` では拾えない。ここで前回3件落とした
--   3. 本番 `pg_proc` の `prosrc` に `insurer_access_logs` を含む関数 10 本のうち、
--      実際に insert する 6 本のリテラル（うち `insurer_audit_log` は 2 の素通し）
--
-- **広げる方向なので既存行は壊れない**（現行の4値はすべて残す）。
--
-- ドメイン状態語彙ルール（CLAUDE.md / docs/adr/0002）との関係: `action` は
-- 監査の「操作名」であって v2.0 の正準6軸（Job / Step / Severity / Certificate /
-- Payment / Sync）のいずれでもない。かつ本マイグレーションは**新しい値を増やしておらず**、
-- 既にコードが書いている値を DB が受け取れるようにするだけなので、
-- `src/lib/domain/states.ts` は触らない。
-- 語彙の単一定義源をどこに置くかは未決（OPEN_QUESTIONS）。
-- ============================================================

ALTER TABLE public.insurer_access_logs
  DROP CONSTRAINT IF EXISTS insurer_access_logs_action_check;

ALTER TABLE public.insurer_access_logs
  ADD CONSTRAINT insurer_access_logs_action_check
  CHECK (action = ANY (ARRAY[
    -- 既存の4値（証明書の閲覧・検索・PDF/CSV 取得）
    'view'::text,
    'search'::text,
    'download_pdf'::text,
    'export_csv'::text,
    -- SQL 関数が書く（この3つが本番で画面ごと 500 にしていた）
    'vehicle_search'::text,
    'vehicle_view'::text,
    'store_search'::text,
    -- 案件（insurer_cases）の操作
    'case_create'::text,
    'case_update'::text,
    'case_message'::text,
    'case_bulk_update'::text,
    'case_attachment_upload'::text,
    -- AI 自動処理
    'case_summary_auto'::text,
    'case_assign_suggest_auto'::text,
    'fraud_check'::text,
    'fraud_check_auto'::text,
    -- 個人情報の開示請求
    'pii_disclosure_request'::text,
    -- insurer_audit_log RPC 経由（ドット区切り）
    'insurer.export.csv'::text,
    'insurer.export.csv.one'::text,
    'insurer.export.pdf.one'::text
  ]))
  NOT VALID;
