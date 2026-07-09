/**
 * 供給パートナー発注の「全自動送信」可否判定 — 純関数 (壁3 隣接の安全ガード)。
 *
 * 自動送信 (人の承認なしで draft→sent し外部 API へ発注) は通常の壁3 を越える操作。
 * 安全の要は「金額上限 (1発注 + 月次)」で、これを店舗が明示設定していることを核の条件とする。
 * opt-in + 構造化搬送 (API/ポータル) + 金額上限の全条件が揃ったときだけ許可し、既定では送らない。
 * 運営の信頼パートナー承認 (is_trusted) は自動送信のゲートには使わない (金額上限で制御する方針)。
 * 判定ロジックを純関数に切り出してテスト可能にする (IO は partnerReorder 側)。
 */

export interface AutoSendContext {
  /** テナントが自動送信を opt-in 済みか (tenant_supply_auto_send_settings.enabled)。 */
  optInEnabled: boolean;
  /** パートナーが API 連携済みか (メールのみは自動送信しない)。 */
  partnerHasApi: boolean;
  /**
   * パートナーが Ledra ホストの受注ポータルを使うか (supply_partners.portal_enabled)。
   * ポータルは Ledra が両側を握るプル型で確実に届くため、API 同様に構造化搬送として
   * 自動送信の対象に含める (API 無しでも可)。既定 false。
   */
  partnerHasPortal?: boolean;
  /** この発注の概算合計 (円)。 */
  orderTotalJpy: number;
  /** 1 発注あたり上限 (円)。null/0 以下なら自動送信不可。 */
  maxOrderJpy: number | null;
  /** 月次上限 (円)。null/0 以下なら自動送信不可。 */
  monthlyCapJpy: number | null;
  /** 今月すでに自動送信した合計 (円)。 */
  monthlySentJpy: number;
}

export type AutoSendDecision = { ok: true } | { ok: false; reason: AutoSendDenyReason };

export type AutoSendDenyReason =
  | "opt_out"
  | "no_api_transport"
  | "empty_order"
  | "no_per_order_cap"
  | "exceeds_per_order_cap"
  | "no_monthly_cap"
  | "exceeds_monthly_cap";

/**
 * 自動送信してよいか判定する。1 つでも条件を満たさなければ ok=false (draft のまま人の承認待ち)。
 * 上限は両方とも正の値で設定されている必要がある (未設定 = 自動送信しない安全側)。
 */
export function decideAutoSend(ctx: AutoSendContext): AutoSendDecision {
  if (!ctx.optInEnabled) return { ok: false, reason: "opt_out" };
  // 構造化搬送 (API or ポータル) が無ければ自動送信しない。メールのみは対象外。
  if (!ctx.partnerHasApi && !ctx.partnerHasPortal) return { ok: false, reason: "no_api_transport" };
  if (!(ctx.orderTotalJpy > 0)) return { ok: false, reason: "empty_order" };
  if (ctx.maxOrderJpy == null || ctx.maxOrderJpy <= 0) return { ok: false, reason: "no_per_order_cap" };
  if (ctx.orderTotalJpy > ctx.maxOrderJpy) return { ok: false, reason: "exceeds_per_order_cap" };
  if (ctx.monthlyCapJpy == null || ctx.monthlyCapJpy <= 0) return { ok: false, reason: "no_monthly_cap" };
  if (ctx.monthlySentJpy + ctx.orderTotalJpy > ctx.monthlyCapJpy) {
    return { ok: false, reason: "exceeds_monthly_cap" };
  }
  return { ok: true };
}
