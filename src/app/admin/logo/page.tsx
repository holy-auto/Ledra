import { redirect } from "next/navigation";

// ロゴ・角印のアップロードは「店舗設定」ページ (/admin/settings) に統合された。
// 既存の深いリンク（オンボーディングメール・操作ガイド・チェックリスト等）を
// 壊さないため、このルートは設定ページへリダイレクトする。
export default function LogoRedirectPage() {
  redirect("/admin/settings");
}
