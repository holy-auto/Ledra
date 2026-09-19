/**
 * `posCheckoutSchema` は admin/mobile 両方の POS checkout ルートが共有する。
 * ルート個別に排他チェックを書くと片方だけ直る（/code-review 指摘: モバイル側に
 * 同じガードが無かった）ため、ここでスキーマ自体を1回検証する。
 */
import { describe, it, expect } from "vitest";

import { posCheckoutSchema } from "@/lib/validations/pos";

const base = { amount: 1000, payment_method: "cash" as const };

describe("posCheckoutSchema", () => {
  it("checkout_session_id と square_checkout_id を同時に渡すと拒否する", () => {
    const res = posCheckoutSchema.safeParse({ ...base, checkout_session_id: "cs_test_1", square_checkout_id: "co_1" });
    expect(res.success).toBe(false);
  });

  it("checkout_session_id と square_reconcile を同時に渡すと拒否する", () => {
    const res = posCheckoutSchema.safeParse({ ...base, checkout_session_id: "cs_test_1", square_reconcile: true });
    expect(res.success).toBe(false);
  });

  it("square_checkout_id と square_reconcile を同時に渡すと拒否する", () => {
    // 端末フィールドが古いまま POS アプリ引き当てへ切り替えた場合等。両方
    // 渡すとルート側は square_checkout_id を優先し、square_reconcile が
    // 意図した決済を黙って無視する（/code-review 指摘）。
    const res = posCheckoutSchema.safeParse({ ...base, square_checkout_id: "co_1", square_reconcile: true });
    expect(res.success).toBe(false);
  });

  it("どちらか片方だけなら通す", () => {
    expect(posCheckoutSchema.safeParse({ ...base, checkout_session_id: "cs_test_1" }).success).toBe(true);
    expect(posCheckoutSchema.safeParse({ ...base, square_checkout_id: "co_1" }).success).toBe(true);
    expect(posCheckoutSchema.safeParse({ ...base, square_reconcile: true }).success).toBe(true);
    expect(posCheckoutSchema.safeParse(base).success).toBe(true);
  });
});
