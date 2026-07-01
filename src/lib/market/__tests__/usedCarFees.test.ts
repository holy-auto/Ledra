import { describe, it, expect } from "vitest";
import { buildUsedCarEstimateItems, estimateTotal, type EstimateItem } from "../usedCarFees";

describe("buildUsedCarEstimateItems", () => {
  it("車両本体行に合意価格を入れ、諸費用は既定 0 のスケルトンを返す", () => {
    const items = buildUsedCarEstimateItems({ vehicleLabel: "トヨタ プリウス", agreedPrice: 1_500_000 });

    const body = items.find((i) => i.item_type === "item" && i.description.includes("車両本体価格"));
    expect(body).toBeDefined();
    expect(body?.description).toContain("トヨタ プリウス");
    expect(body?.unit_price).toBe(1_500_000);

    // 諸費用行は既定 0
    const fees = items.filter((i) => i.item_type === "item" && !i.description.includes("車両本体価格"));
    expect(fees.length).toBeGreaterThan(0);
    expect(fees.every((f) => f.unit_price === 0)).toBe(true);

    // 見出しが3セクション (車両本体 / 課税諸費用 / 非課税諸費用)
    expect(items.filter((i) => i.item_type === "heading")).toHaveLength(3);
  });

  it("支払総額 = 車両本体 + 差し込んだ諸費用の合計 (課税/非課税混在でも正確)", () => {
    const items = buildUsedCarEstimateItems({
      vehicleLabel: "日産 ノート",
      agreedPrice: 1_000_000,
      fees: {
        dealer_fee: 33_000, // 課税
        registration_agent: 22_000, // 課税
        auto_tax: 15_000, // 非課税
        recycling_deposit: 12_000, // 非課税
      },
    });
    // 1,000,000 + 33,000 + 22,000 + 15,000 + 12,000 = 1,082,000
    expect(estimateTotal(items)).toBe(1_082_000);
  });

  it("見出し行は金額に含めない", () => {
    const items = buildUsedCarEstimateItems({ agreedPrice: 500_000 });
    const headingSum = items
      .filter((i) => i.item_type === "heading")
      .reduce((s, i) => s + i.quantity * i.unit_price, 0);
    expect(headingSum).toBe(0);
    expect(estimateTotal(items)).toBe(500_000);
  });

  it("ラベル未指定・負値・非数は安全に扱う", () => {
    const items = buildUsedCarEstimateItems({ agreedPrice: -100, fees: { dealer_fee: Number.NaN } });
    const body = items.find((i: EstimateItem) => i.description.includes("車両本体価格"));
    expect(body?.description).toContain("車両");
    expect(body?.unit_price).toBe(0);
    expect(estimateTotal(items)).toBe(0);
  });

  it("下取り充当はマイナス行として支払総額から差し引かれる", () => {
    const items = buildUsedCarEstimateItems({
      vehicleLabel: "トヨタ アクア",
      agreedPrice: 1_200_000,
      fees: { dealer_fee: 30_000 },
      tradeInAllowance: 400_000,
      tradeInLabel: "日産 デイズ",
    });
    const tradeInRow = items.find((i) => i.description.includes("下取り充当"));
    expect(tradeInRow).toBeDefined();
    expect(tradeInRow?.unit_price).toBe(-400_000);
    expect(tradeInRow?.description).toContain("日産 デイズ");
    // 1,200,000 + 30,000 - 400,000 = 830,000
    expect(estimateTotal(items)).toBe(830_000);
  });

  it("下取り充当が0/未指定なら下取り行を出さない", () => {
    const none = buildUsedCarEstimateItems({ agreedPrice: 500_000 });
    expect(none.some((i) => i.description.includes("下取り"))).toBe(false);
    const zero = buildUsedCarEstimateItems({ agreedPrice: 500_000, tradeInAllowance: 0 });
    expect(zero.some((i) => i.description.includes("下取り"))).toBe(false);
  });

  it("非課税諸費用行に法定費用ラベルが含まれる", () => {
    const items = buildUsedCarEstimateItems({ agreedPrice: 0 });
    const labels = items.map((i) => i.description);
    expect(labels).toContain("自賠責保険料");
    expect(labels).toContain("リサイクル預託金");
    expect(labels).toContain("自動車重量税");
  });
});
