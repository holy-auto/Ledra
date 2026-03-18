import { describe, it, expect } from "vitest";
import { normalizePlanTier, canUseFeature, featureLabel, PHOTO_LIMITS, CERT_LIMITS } from "./planFeatures";
import type { FeatureId } from "@/lib/billing/featureKeys";

// ─── normalizePlanTier ───
describe("normalizePlanTier", () => {
  it("正常なプラン名を返す", () => {
    expect(normalizePlanTier("free")).toBe("free");
    expect(normalizePlanTier("starter")).toBe("starter");
    expect(normalizePlanTier("standard")).toBe("standard");
    expect(normalizePlanTier("pro")).toBe("pro");
  });

  it("大文字も正規化する", () => {
    expect(normalizePlanTier("FREE")).toBe("free");
    expect(normalizePlanTier("Starter")).toBe("starter");
    expect(normalizePlanTier("Standard")).toBe("standard");
  });

  it("旧 mini は starter にマッピング", () => {
    expect(normalizePlanTier("mini")).toBe("starter");
    expect(normalizePlanTier("MINI")).toBe("starter");
  });

  it("不明な値は free にフォールバック", () => {
    expect(normalizePlanTier("")).toBe("free");
    expect(normalizePlanTier(null)).toBe("free");
    expect(normalizePlanTier(undefined)).toBe("free");
    expect(normalizePlanTier("enterprise")).toBe("free");
  });
});

// ─── canUseFeature ───
describe("canUseFeature", () => {
  describe("freeプラン", () => {
    const plan = "free";

    it("証明書発行は可能", () => {
      expect(canUseFeature(plan, "issue_certificate")).toBe(true);
    });

    it("PDF単体出力は可能", () => {
      expect(canUseFeature(plan, "pdf_one")).toBe(true);
    });

    it("CSV単体出力は不可", () => {
      expect(canUseFeature(plan, "export_one_csv")).toBe(false);
    });

    it("テンプレート管理は不可", () => {
      expect(canUseFeature(plan, "manage_templates")).toBe(false);
    });

    it("ロゴアップロードは不可", () => {
      expect(canUseFeature(plan, "upload_logo")).toBe(false);
    });
  });

  describe("starterプラン", () => {
    const plan = "starter";

    it("証明書発行・CSV単体・PDF単体は可能", () => {
      expect(canUseFeature(plan, "issue_certificate")).toBe(true);
      expect(canUseFeature(plan, "export_one_csv")).toBe(true);
      expect(canUseFeature(plan, "pdf_one")).toBe(true);
    });

    it("ロゴアップロードは可能", () => {
      expect(canUseFeature(plan, "upload_logo")).toBe(true);
    });

    it("テンプレート管理は不可", () => {
      expect(canUseFeature(plan, "manage_templates")).toBe(false);
    });

    it("PDF ZIP出力は不可", () => {
      expect(canUseFeature(plan, "pdf_zip")).toBe(false);
    });
  });

  describe("standardプラン", () => {
    const plan = "standard";

    it("starterの全機能が使える", () => {
      expect(canUseFeature(plan, "issue_certificate")).toBe(true);
      expect(canUseFeature(plan, "export_one_csv")).toBe(true);
      expect(canUseFeature(plan, "pdf_one")).toBe(true);
      expect(canUseFeature(plan, "upload_logo")).toBe(true);
    });

    it("テンプレート管理・PDF ZIP・CSV検索結果が使える", () => {
      expect(canUseFeature(plan, "manage_templates")).toBe(true);
      expect(canUseFeature(plan, "pdf_zip")).toBe(true);
      expect(canUseFeature(plan, "export_search_csv")).toBe(true);
    });

    it("店舗管理が使える", () => {
      expect(canUseFeature(plan, "manage_stores")).toBe(true);
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
        "manage_templates", "upload_logo", "manage_stores",
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
      "manage_templates", "upload_logo", "manage_stores",
    ];
    for (const f of features) {
      const label = featureLabel(f);
      expect(label).toBeTruthy();
      expect(label).not.toBe(f);
    }
  });
});

// ─── PHOTO_LIMITS ───
describe("PHOTO_LIMITS", () => {
  it("freeは3枚", () => {
    expect(PHOTO_LIMITS.free).toBe(3);
  });

  it("starterは5枚", () => {
    expect(PHOTO_LIMITS.starter).toBe(5);
  });

  it("standardは10枚", () => {
    expect(PHOTO_LIMITS.standard).toBe(10);
  });

  it("proは20枚", () => {
    expect(PHOTO_LIMITS.pro).toBe(20);
  });

  it("上位プランほど上限が大きい", () => {
    expect(PHOTO_LIMITS.free).toBeLessThan(PHOTO_LIMITS.starter);
    expect(PHOTO_LIMITS.starter).toBeLessThan(PHOTO_LIMITS.standard);
    expect(PHOTO_LIMITS.standard).toBeLessThan(PHOTO_LIMITS.pro);
  });
});

// ─── CERT_LIMITS ───
describe("CERT_LIMITS", () => {
  it("freeは月10件", () => {
    expect(CERT_LIMITS.free).toBe(10);
  });

  it("starterは月80件", () => {
    expect(CERT_LIMITS.starter).toBe(80);
  });

  it("standardは月300件", () => {
    expect(CERT_LIMITS.standard).toBe(300);
  });

  it("proは無制限（null）", () => {
    expect(CERT_LIMITS.pro).toBeNull();
  });
});
