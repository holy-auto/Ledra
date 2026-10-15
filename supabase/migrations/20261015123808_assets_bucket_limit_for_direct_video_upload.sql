-- `assets` バケットの大きさの上限を 20MB → 100MB にする（証明書の動画を Storage へ直接アップロードできるようにする）。
--
-- 証明書の動画は上限 100MB（src/lib/certificateMedia/index.ts の MAX_VIDEO_BYTES）を約束していたが、Vercel の関数に multipart で
-- 送っていたため、本文が約 4.5MB を超える動画は関数に届く前に弾かれていた（OPEN_QUESTIONS 2026-10-12）。
-- 同じ PR で、動画はブラウザから署名付きアップロード URL で Storage へ直接送る形にした（/api/certificates/[id]/media/upload-url）。
-- その経路ではバケットの上限がそのまま効くので、20MB（20261012131344）のままだと 20MB を超える動画が弾かれる。
--
-- 2026-10-12 の判断（DECISION_LOG）では「届かないのに 100MB にしても歯止めが緩むだけ」として 20MB にした。直接アップロードで
-- 届くようになったので、動画の約束に合わせる。画像の大きさは各書き込み口の検査（20MB 以下）が担う。
--
-- 注意: プロジェクト全体の上限（ダッシュボードの Storage Settings → Global file size limit）が 100MB 未満だと、そちらが優先される【要確認】。
--
-- 戻すとき: update storage.buckets set file_size_limit = 20971520 where id = 'assets';

update storage.buckets set file_size_limit = 104857600 where id = 'assets';
