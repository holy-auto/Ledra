-- `assets` バケットの制限（画像 5 種・10MB）を、アプリが受け付けて保存するものに合わせて広げる。
--
-- 形式: これまでの一覧に無い次の保存が Storage に弾かれていた（OPEN_QUESTIONS 2026-10-10）:
--   - iPhone の HEIC 写真: 証明書写真は HEIC を受け付けて `image/heic` のまま保存する
--     （Web は 3.5MB 以下なら変換せずに送る〈compressToJpeg の TARGET_BYTES〉・モバイルも .heic は image/heic で送る。processUploadedPhoto.ts）
--   - 証明書の動画: mp4 / mov（src/lib/certificateMedia/index.ts）
--   - 署名済み証明書 PDF: `application/pdf`（src/lib/signature/pdfUtils.ts）
--   `assets` への書き込み口（2026-10-12 に src の全 15 箇所を確認）が付ける形式は、すべて下の一覧に入る。
--   既存の一覧は手作業で設定されたものなので、置き換えずに足す（ダッシュボードで足された形式があっても消さない）。
--
-- 大きさ: 20MB（アプリが受け付ける画像の上限の最大。証明書写真・部品の証跡・納品書）。
--   アプリからのアップロードは Vercel の関数を通るので、本文 4.5MB を超えるものはそもそも届かない
--   （src/lib/media/compressToJpeg.ts ほか、コード内の記載）。サーバー側で作る PDF だけがそれより大きくなりうる。
--   動画の上限 100MB（MAX_VIDEO_BYTES）は、この経路では届かないので別課題（OPEN_QUESTIONS 2026-10-12）。
--   上限を必要以上に上げず、書き込み口ごとの大きさの検査が抜けたときの歯止めとして残す。
--
-- 戻すとき: update storage.buckets set file_size_limit = 10485760,
--   allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif'] where id = 'assets';

update storage.buckets
set
  file_size_limit = 20971520,
  -- null は「制限なし」なので、そのまま残す（足すと逆に制限が生まれる）
  allowed_mime_types = case
    when allowed_mime_types is null then null
    else array(
      select distinct m
      from unnest(allowed_mime_types || array['image/heic', 'video/mp4', 'video/quicktime', 'application/pdf']) as m
      order by m
    )
  end
where id = 'assets';
