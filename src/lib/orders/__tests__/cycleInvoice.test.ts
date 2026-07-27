import { describe, it, expect } from "vitest";
import { isClosingToday, dueDateFromClosing } from "@/lib/orders/cycleInvoice";
import { mapOrderPaymentMethod } from "@/lib/orders/markOrderInvoicePaid";
import { isConsolidatedBilling } from "@/lib/orders/orderInvoice";

/**
 * 指名BtoB請求の金額・日付・分岐に関わる純関数の回帰チェック。
 * DB を使わず、締め日境界／支払期限／支払方法マップ／合算分岐を検証する。
 */

describe("isClosingToday（締め日一致・末日丸め）", () => {
  it("締め日が当日に一致すれば true", () => {
    expect(isClosingToday(15, 2026, 7, 15)).toBe(true);
    expect(isClosingToday(15, 2026, 7, 14)).toBe(false);
  });

  it("closing_day=null は常に false（都度扱い）", () => {
    expect(isClosingToday(null, 2026, 7, 15)).toBe(false);
  });

  it("締め日が当月末日を超える場合は末日に丸める（31 を 2 月に設定）", () => {
    // 2026年2月は28日まで → 31 締めは 28 日に丸まる
    expect(isClosingToday(31, 2026, 2, 28)).toBe(true);
    expect(isClosingToday(31, 2026, 2, 27)).toBe(false);
    // 4月(30日まで)の 31 締めは 30 日
    expect(isClosingToday(31, 2026, 4, 30)).toBe(true);
    // 通常月（7月31日）はそのまま
    expect(isClosingToday(31, 2026, 7, 31)).toBe(true);
  });
});

describe("dueDateFromClosing（締め日 + 支払サイト）", () => {
  it("締め日 + 支払サイト日数（既定30）", () => {
    // 2026-07-31 締め + 30日 = 2026-08-30
    expect(dueDateFromClosing(2026, 7, 31, 30)).toBe("2026-08-30");
    // termsDays 未指定は 30 日
    expect(dueDateFromClosing(2026, 7, 31, null)).toBe("2026-08-30");
  });

  it("月跨ぎ・年跨ぎを正しく計算", () => {
    // 2026-12-31 締め + 31日 = 2027-01-31
    expect(dueDateFromClosing(2026, 12, 31, 31)).toBe("2027-01-31");
    // 0 日サイトは当日
    expect(dueDateFromClosing(2026, 7, 15, 0)).toBe("2026-07-15");
  });
});

describe("mapOrderPaymentMethod（payment_entries CHECK 適合）", () => {
  it("job_orders の全 payment_method を許可値へマップ", () => {
    expect(mapOrderPaymentMethod("bank_transfer")).toBe("bank_transfer");
    expect(mapOrderPaymentMethod("cash")).toBe("cash");
    expect(mapOrderPaymentMethod("card")).toBe("credit_card");
    expect(mapOrderPaymentMethod("stripe_connect")).toBe("credit_card");
    expect(mapOrderPaymentMethod("other")).toBe("other");
    expect(mapOrderPaymentMethod(null)).toBe("bank_transfer");
  });

  it("payment_entries が許可する値のみを返す", () => {
    const allowed = new Set(["cash", "bank_transfer", "credit_card", "qr", "other"]);
    for (const m of ["bank_transfer", "cash", "card", "stripe_connect", "other", null, "unknown"]) {
      expect(allowed.has(mapOrderPaymentMethod(m as string | null))).toBe(true);
    }
  });
});

describe("isConsolidatedBilling（合算 cron へ委譲する分岐）", () => {
  it("consolidated かつ 締め日あり → true（per-order を作らず cron に委ねる）", () => {
    expect(isConsolidatedBilling({ billing_cycle: "consolidated", closing_day: 31 })).toBe(true);
  });

  it("都度払い / 締め日なし / 顧客未紐付け → false（per-order 下書きを作る）", () => {
    expect(isConsolidatedBilling({ billing_cycle: "per_job", closing_day: 31 })).toBe(false);
    expect(isConsolidatedBilling({ billing_cycle: "consolidated", closing_day: null })).toBe(false);
    expect(isConsolidatedBilling(null)).toBe(false);
  });
});
