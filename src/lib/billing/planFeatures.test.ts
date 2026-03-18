import { describe, it, expect } from "vitest";
import { normalizePlanTier, canUseFeature, featureLabel, PHOTO_LIMITS } from "./planFeatures";
import type { FeatureId } from "@/lib/billing/featureKeys";

// ─── normalizePlanTier ───
describe("normalizePlanTier", () => {
  it("正常なプラン名を返す", () => {
    expect(normalizePlanTier("mini")).toBe("mini");
    expect(normalizePlanTier("standard")).toBe("standard");
    expect(normalizePlanTier("pro")).toBe("pro");
  });

  it("大文字も正規化する", () => {
    expect(normalizePlanTier("MINI")).toBe("mini");
    expect(normalizePlanTier("Standard")).toBe("standard");
  });

  it("不明な値はproにフォールバック", () => {
    expect(normalizePlanTier("")).toBe("pro");
    expect(normalizePlanTier(null)).toBe("pro");
    expect(normalizePlanTier(undefined)).toBe("pro");
    expect(normalizePlanTier("enterprise")).toBe("pro");
  });
});

// ─── canUseFeature ───
describe("canUseFeature", () => {
  describe("miniプラン", () => {
    const plan = "mini";

    it("証明書発行は可能", () => {
      expect(canUseFeature(plan, "issue_certificate")).toBe(true);
    });

    it("CSV単体出力は可能", () => {
      expect(canUseFeature(plan, "export_one_csv")).toBe(true);
    });

    it("PDF単体出力は可能", () => {
      expect(canUseFeature(plan, "pdf_one")).toBe(true);
    });

    it("テンプレート管理は不可", () => {
      expect(canUseFeature(plan, "manage_templates")).toBe(false);
    });

    it("ロゴアップロードは不可", () => {
      expect(canUseFeature(plan, "upload_logo")).toBe(false);
    });

    it("PDF ZIP出力は不可", () => {
      expect(canUseFeature(plan, "pdf_zip")).toBe(false);
    });

    it("CSV検索結果出力は不可", () => {
      expect(canUseFeature(plan, "export_search_csv")).toBe(false);
    });

    it("CSV選択出力は不可", () => {
      expect(canUseFeature(plan, "export_selected_csv")).toBe(false);
    });
  });

  describe("standardプラン", () => {
    const plan = "standard";

    it("miniの全機能が使える", () => {
      expect(canUseFeature(plan, "issue_certificate")).toBe(true);
      expect(canUseFeature(plan, "export_one_csv")).toBe(true);
      expect(canUseFeature(plan, "pdf_one")).toBe(true);
    });

    it("テンプレート管理が使える", () => {
      expect(canUseFeature(plan, "manage_templates")).toBe(true);
    });

    it("ロゴアップロードが使える", () => {
      expect(canUseFeature(plan, "upload_logo")).toBe(true);
    });

    it("PDF ZIP出力が使える", () => {
      expect(canUseFeature(plan, "pdf_zip")).toBe(true);
    });

    it("CSV選択出力は不可", () => {
      expect(canUseFeature(plan, "export_selected_csv")).toBe(false);
    });
  });

  describe("proプラン", () => {
    const plan = "pro";

    it("全機能が使える", () => {
      const allFeatures: FeatureId[] = [
        "issue_certificate", "export_one_csv", "export_search_csv",
        "export_selected_csv", "pdf_one", "pdf_zip",
        "manage_templates", "upload_logo",
      ];
      for (const f of allFeatures) {
        expect(canUseFeature(plan, f)).toBe(true);
      }
    });
  });
});

// ─── featureLabel ───
describe("featureLabel", () => {
  it("全FeatureIdに日本語ラベルが定義されている", () => {
    const features: FeatureId[] = [
      "issue_certificate", "export_one_csv", "export_search_csv",
      "export_selected_csv", "pdf_one", "pdf_zip",
      "manage_templates", "upload_logo",
    ];
    for (const f of features) {
      const label = featureLabel(f);
      expect(label).toBeTruthy();
      expect(label).not.toBe(f); // 機能名がそのまま返ってこない
    }
  });
});

// ─── PHOTO_LIMITS ───
describe("PHOTO_LIMITS", () => {
  it("miniは3枚", () => {
    expect(PHOTO_LIMITS.mini).toBe(3);
  });

  it("standardは10枚", () => {
    expect(PHOTO_LIMITS.standard).toBe(10);
  });

  it("proは20枚", () => {
    expect(PHOTO_LIMITS.pro).toBe(20);
  });

  it("上位プランほど上限が大きい", () => {
    expect(PHOTO_LIMITS.mini).toBeLessThan(PHOTO_LIMITS.standard);
    expect(PHOTO_LIMITS.standard).toBeLessThan(PHOTO_LIMITS.pro);
  });
});
