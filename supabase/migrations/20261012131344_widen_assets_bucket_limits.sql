-- `assets` バケットの制限（画像 5 種・10MB）を、アプリが受け付けて保存するものに合わせて広げる。
--
-- これまでの制限はアプリより狭く、次の保存が Storage に弾かれていた（OPEN_QUESTIONS 2026-10-10）:
--   - iPhone の HEIC 写真: 証明書写真は HEIC を受け付けて `image/heic` のまま保存する
--     （src/lib/certificateImages/uploadHandler.ts・processUploadedPhoto.ts）
--   - 10MB を超える写真: 証明書写真・部品の証跡・納品書は 20MB、点検写真は 15MB まで受け付ける
--   - 証明書の動画: mp4 / mov、100MB まで（src/lib/certificateMedia/index.ts の MAX_VIDEO_BYTES）
--   - 署名済み証明書 PDF: `application/pdf`（src/lib/signature/pdfUtils.ts）
--
-- `assets` への書き込み口（2026-10-12 に全 15 箇所を確認）が付ける形式はすべて下の一覧に入る。
-- 上限はアプリの上限のうち最大の 100MB（動画）。プロジェクト全体の上限（ダッシュボードの Global file size limit）が
-- これより小さいと、そちらが優先される【要確認】。
--
-- 戻すとき: update storage.buckets set file_size_limit = 10485760,
--   allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif'] where id = 'assets';

update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'video/mp4',
    'video/quicktime',
    'application/pdf'
  ]
where id = 'assets';
