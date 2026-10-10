-- `assets` バケット（施工写真・動画・ロゴ・印影・点検写真・部品の証跡）を非公開にする。 [写真の非公開化 ③]
--
-- 公開のままだと、保存パスを知っている人は誰でも `/storage/v1/object/public/assets/...` で原本を開ける
-- （公開ページで写真を隠しても、URL を控えた人・推測した人には見える）。
-- 表示はすべて署名 URL（src/lib/signedUrl.ts）か service-role の download に切り替え済み:
--   - Web: 公開証明書・管理画面・PDF・作業写真（RELEASE_LOG 2026-10-09）
--   - モバイル: /api/mobile/certificates/[id]/images（#1285）
--   - 点検写真: 保存パスで持つ（#1294）
--   - 公開 URL を作る書き方は src/lib/__tests__/noPublicAssetUrls.test.ts が止める
-- 2026-10-10 に本番で、`assets` を参照する storage.objects のポリシーが 0 本であること、
-- 公開 URL を保存している列（ブログ・アカデミーの画像/動画 URL）が 0 件であることを確認。
--
-- 本番の `assets` は手作業で作られていてマイグレーションに無かった。プレビュー・replay でも同じバケットができるよう、
-- 無ければ本番と同じ設定（10MB・画像のみ）で作る。既にあれば public だけを変える（容量・MIME の設定は触らない）。
-- 画像のみの制限は、同じバケットに保存する動画（certificateMedia）・署名済み PDF（signature/pdfUtils.ts）を弾いている
-- （本番の assets は画像 438 件のみ）。これを広げるかは別判断（OPEN_QUESTIONS 2026-10-10）。
--
-- 戻すとき: update storage.buckets set public = true where id = 'assets';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assets',
  'assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update set public = false;
