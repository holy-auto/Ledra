import { describe, it, expect } from "vitest";
import { isBillingDenial } from "../BillingFetchGuard";

/**
 * 無料プラン利用者が「その他」タブを開くたびに勝手に請求・プラン画面へ
 * 飛ばされる不具合の回帰テスト。
 *
 * 原因: /api/admin/follow-up-settings のような settings:view 権限チェックが
 * apiForbidden() (billing_url を持たない素の 403) を返すのに、
 * BillingFetchGuard が「403 なら billing_url が無くても /admin/billing へ飛ばす」
 * 実装になっていて、課金と無関係な RBAC 403 まで課金拒否と誤認していた。
 */
describe("isBillingDenial", () => {
  it("billing_url の無い 403 (RBAC 拒否) は課金拒否とみなさない", () => {
    expect(isBillingDenial(403, null)).toBe(false);
  });

  it("billing_url を含む 403 (プラン制限) は課金拒否とみなす", () => {
    expect(isBillingDenial(403, "/admin/billing?reason=plan")).toBe(true);
  });

  it("402 (支払い停止) は billing_url が無くても課金拒否とみなす", () => {
    expect(isBillingDenial(402, null)).toBe(true);
  });

  it("200 は課金拒否とみなさない", () => {
    expect(isBillingDenial(200, null)).toBe(false);
  });
});
