import { isReiwaPromoActive, REIWA_PROMO_HREF } from "@/lib/marketing/promo";
import { PromoBannerClient } from "./PromoBannerClient";

/**
 * 令和の虎 出演告知の期間限定バナー（全マーケページ最上部）。
 * 表示期間の判定はサーバ側（`isReiwaPromoActive`）。期間外は何も描画しない。
 * 期間内のみクライアント（閉じる操作）を載せる。
 * 露出（放送はモバイル多）を SEO/UX を損なわず全訪問者に届けるため、割り込みモーダルや
 * 全体リダイレクトではなく最上部バーにしている。
 */
export function PromoBanner() {
  if (!isReiwaPromoActive(new Date())) return null;
  return <PromoBannerClient href={REIWA_PROMO_HREF} />;
}
