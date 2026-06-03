import { describe, it, expect } from "vitest";
import { reconcileQuantity, threeWayMatch, type LineItem } from "@/lib/parts/reconciliation";

describe("reconcileQuantity", () => {
  it("装着数 ≤ 納品数 かつ 請求=装着 なら finding なし", () => {
    expect(reconcileQuantity({ key: "g1", deliveredQty: 10, installedQty: 2, billedQty: 2 })).toEqual([]);
  });

  it("装着数 > 納品数 は critical(installed_exceeds_delivered)", () => {
    const f = reconcileQuantity({ key: "g1", deliveredQty: 1, installedQty: 2, billedQty: 2 });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: "qty_mismatch", severity: "critical" });
    expect(f[0].detail.kind).toBe("installed_exceeds_delivered");
  });

  it("請求数 ≠ 装着数 は warning(billed_ne_installed)", () => {
    const f = reconcileQuantity({ key: "g1", deliveredQty: 10, installedQty: 2, billedQty: 3 });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: "qty_mismatch", severity: "warning" });
  });

  it("両方の違反は2件返す", () => {
    const f = reconcileQuantity({ key: "g1", deliveredQty: 1, installedQty: 2, billedQty: 3 });
    expect(f).toHaveLength(2);
  });

  it("delivered/billed が null なら該当チェックをスキップ", () => {
    expect(reconcileQuantity({ key: "g1", deliveredQty: null, installedQty: 5 })).toEqual([]);
  });
});

describe("threeWayMatch", () => {
  const installed: LineItem = { key: "g1", quantity: 1, amountJpy: 10000 };

  it("納品・請求の両方に整合あれば finding なし", () => {
    const f = threeWayMatch({
      installed,
      deliveryLines: [{ key: "g1", quantity: 5 }],
      billedLines: [{ key: "g1", quantity: 1, amountJpy: 10000 }],
    });
    expect(f).toEqual([]);
  });

  it("納品書に無い装着は critical(missing_in_delivery)", () => {
    const f = threeWayMatch({
      installed,
      deliveryLines: [{ key: "other", quantity: 5 }],
      billedLines: [{ key: "g1", quantity: 1, amountJpy: 10000 }],
    });
    const crit = f.find((x) => x.detail.kind === "missing_in_delivery");
    expect(crit?.severity).toBe("critical");
  });

  it("請求に無い装着は info(missing_in_billing)", () => {
    const f = threeWayMatch({
      installed,
      deliveryLines: [{ key: "g1", quantity: 5 }],
      billedLines: [],
    });
    const info = f.find((x) => x.detail.kind === "missing_in_billing");
    expect(info?.severity).toBe("info");
  });

  it("金額乖離（許容超）は warning(amount_divergence)", () => {
    const f = threeWayMatch({
      installed: { key: "g1", quantity: 1, amountJpy: 20000 },
      deliveryLines: [{ key: "g1", quantity: 5 }],
      billedLines: [{ key: "g1", quantity: 1, amountJpy: 10000 }],
    });
    const warn = f.find((x) => x.detail.kind === "amount_divergence");
    expect(warn?.severity).toBe("warning");
    expect(warn?.detail.diff_rate).toBe(1);
  });

  it("金額が許容内なら乖離 finding なし", () => {
    const f = threeWayMatch({
      installed: { key: "g1", quantity: 1, amountJpy: 10300 },
      deliveryLines: [{ key: "g1", quantity: 5 }],
      billedLines: [{ key: "g1", quantity: 1, amountJpy: 10000 }],
      amountTolerance: 0.05,
    });
    expect(f.find((x) => x.detail.kind === "amount_divergence")).toBeUndefined();
  });
});
