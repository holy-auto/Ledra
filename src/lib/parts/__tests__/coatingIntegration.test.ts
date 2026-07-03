import { describe, it, expect } from "vitest";
import { isTrackableCoatingRow, coatingRowPartName } from "@/lib/parts/coatingIntegration";

describe("coatingIntegration", () => {
  describe("isTrackableCoatingRow", () => {
    it("製品名があれば対象", () => {
      expect(isTrackableCoatingRow({ product_name: "ガラスコーティングA" })).toBe(true);
    });

    it("ブランド名だけでも対象", () => {
      expect(isTrackableCoatingRow({ brand_name: "SomeBrand" })).toBe(true);
    });

    it("部位だけの空行は対象外", () => {
      expect(isTrackableCoatingRow({ location: "ボンネット" })).toBe(false);
    });

    it("全て空の行は対象外", () => {
      expect(isTrackableCoatingRow({})).toBe(false);
    });
  });

  describe("coatingRowPartName", () => {
    it("製品名を優先", () => {
      expect(coatingRowPartName({ product_name: "ガラスコーティングA", brand_name: "Brand" })).toBe(
        "ガラスコーティングA",
      );
    });

    it("製品名が無ければブランド名+部位", () => {
      expect(coatingRowPartName({ brand_name: "Brand", location: "ボンネット" })).toBe("Brand ボンネット");
    });

    it("何も無ければ既定名", () => {
      expect(coatingRowPartName({})).toBe("コーティング剤");
    });
  });
});
