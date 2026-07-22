/**
 * 令和の虎 出演告知バナーの表示期間。
 *
 * この放送は収録済みで、公開は 2026-07-25（土）19:00（JST）。バナーは番組名を明かすため
 * エンバーゴ（当日昼まで伏せる）を守り、放送公開の 19:00 から出す（昼のティザーでは
 * 「令和の虎」を出さない方針）。終了は放送〜2週間の 2026-08-08 23:59（JST）。
 *
 * JST(UTC+9) の壁時計を UTC 絶対時刻（epoch ms）で表現する。期間を変えるときはここだけ直す。
 * ponytail: 期間はハードコード。頻繁に動かすなら env（NEXT_PUBLIC_…）化する。
 */
export const REIWA_PROMO_START = Date.UTC(2026, 6, 25, 10, 0, 0); // 2026-07-25 19:00 JST
export const REIWA_PROMO_END = Date.UTC(2026, 7, 8, 14, 59, 59); // 2026-08-08 23:59 JST

/** now が告知バナーの表示期間内か。 */
export function isReiwaPromoActive(now: Date): boolean {
  const t = now.getTime();
  return t >= REIWA_PROMO_START && t <= REIWA_PROMO_END;
}

/**
 * バナーを出すか。期間内、または `?preview_promo=1`（期間前に文言/デザインを目視確認する
 * ための抜け道）なら true。dismiss 判定はクライアント側で別途行う。
 */
export function shouldShowPromo(now: Date, search: string): boolean {
  try {
    if (new URLSearchParams(search).get("preview_promo") === "1") return true;
  } catch {
    // 不正な search でも期間判定にフォールバック
  }
  return isReiwaPromoActive(now);
}

/** バナー→告知ページの遷移に付ける UTM（新設の first-touch 帰属で「バナー経由」を分離計測）。 */
export const REIWA_PROMO_HREF =
  "/news/2026-07-25-reiwa-no-tora?utm_source=promo-banner&utm_medium=site&utm_campaign=reiwa-tora-2026";
