-- 本番に無いバケットを非公開で作り、マーケットの画像の保存先を非公開にする。（OPEN_QUESTIONS 2026-10-12）
--
-- 1. 本番に無いバケットへ保存していて、保存がすべて失敗していた（本番の storage.buckets は 9 本で、この 2 本は無い）:
--    - `certificates`: 証明書 PDF の一括生成（src/app/api/qstash/batch-pdf/route.ts）。service-role で保存し、署名 URL で渡す。
--    - `case-attachments`: 保険会社の案件の添付（src/app/api/insurer/cases/[id]/attachments/route.ts）。service-role で保存する。
--    どちらも保険会社・テナントの書類なので非公開。読み書きは service-role だけで、ユーザーロール向けのポリシーは足さない。
--    形式・大きさは各 route が検査している（添付は 10MB・画像/PDF/テキスト/Word）。ft-evidence と同じく、バケット側では絞らない。
--
-- 2. `market`（マーケットの車両画像）を非公開にする。マーケットの画面はログイン必須なのに、画像は公開 URL で誰でも開けた。
--    表示は service-role の署名 URL に切り替え済み（#1322）で、公開 URL を作るコードは無い（noPublicAssetUrls.test.ts）。
--    アップロード・削除はログイン中の利用者の権限で行い、そのポリシー（market_storage_insert / market_storage_delete）は
--    公開・非公開に関係しない。2026-10-15 時点で本番の market の画像は 0 件。
--
-- 戻すとき: update storage.buckets set public = true where id = 'market';
--   （作ったバケットは中身が入る前なら delete from storage.buckets where id in ('certificates', 'case-attachments');）

insert into storage.buckets (id, name, public)
values
  ('certificates', 'certificates', false),
  ('case-attachments', 'case-attachments', false)
on conflict (id) do nothing;

update storage.buckets set public = false where id = 'market';
