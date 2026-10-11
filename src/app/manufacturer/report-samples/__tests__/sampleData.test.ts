import { describe, expect, it } from "vitest";
import {
  SAMPLE_REPORTS,
  coatAge,
  coatTotal,
  ftShops,
  minivanDamage,
  oemMaint,
  oemMileage,
  ppfCars,
  ppfFilmRows,
  sum,
} from "../sampleData";

// ダミーでも、合計と内訳が食い違うと商談で突っ込まれる。内訳どうしの整合だけを固定する。
describe("連携レポート見本のダミーデータ", () => {
  it("内訳の合計が見出しの件数と一致する", () => {
    expect(sum(coatAge.map((x) => x[1]))).toBe(coatTotal);
    expect(sum(ppfFilmRows.map((r) => sum(r[1])))).toBe(ppfCars);
    expect(sum(oemMileage.map((x) => x[1]))).toBe(oemMaint);
    expect(sum(ftShops.map((s) => s[1] + s[2] + s[3]))).toBe(60);
  });

  it("傷マーカーの座標は証明書と同じ 0..1 正規化に収まる", () => {
    for (const [, x, y] of minivanDamage) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("業種タブの id が重複しない", () => {
    const ids = SAMPLE_REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
