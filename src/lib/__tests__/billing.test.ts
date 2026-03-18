import { describe, it, expect } from "vitest";
import { memberLimit, memberLimitLabel, canAddMember } from "../billing/memberLimits";
import { normalizePlanTier, canUseFeature, PHOTO_LIMITS } from "../billing/planFeatures";

describe("memberLimits", () => {
  describe("memberLimit", () => {
    it("free allows 1 member", () => {
      expect(memberLimit("free")).toBe(1);
    });

    it("starter allows 3 members", () => {
      expect(memberLimit("starter")).toBe(3);
    });

    it("standard allows 7 members", () => {
      expect(memberLimit("standard")).toBe(7);
    });

    it("pro allows 15 members", () => {
      expect(memberLimit("pro")).toBe(15);
    });
  });

  describe("memberLimitLabel", () => {
    it("free shows '1人'", () => {
      expect(memberLimitLabel("free")).toBe("1人");
    });

    it("pro shows '15人'", () => {
      expect(memberLimitLabel("pro")).toBe("15人");
    });
  });

  describe("canAddMember", () => {
    it("free: cannot add when count >= 1", () => {
      expect(canAddMember("free", 0)).toBe(true);
      expect(canAddMember("free", 1)).toBe(false);
      expect(canAddMember("free", 5)).toBe(false);
    });

    it("starter: cannot add when count >= 3", () => {
      expect(canAddMember("starter", 2)).toBe(true);
      expect(canAddMember("starter", 3)).toBe(false);
    });

    it("standard: cannot add when count >= 7", () => {
      expect(canAddMember("standard", 6)).toBe(true);
      expect(canAddMember("standard", 7)).toBe(false);
    });

    it("pro: cannot add when count >= 15", () => {
      expect(canAddMember("pro", 14)).toBe(true);
      expect(canAddMember("pro", 15)).toBe(false);
    });
  });
});

describe("planFeatures", () => {
  describe("normalizePlanTier", () => {
    it("normalizes 'free'", () => {
      expect(normalizePlanTier("free")).toBe("free");
      expect(normalizePlanTier("Free")).toBe("free");
      expect(normalizePlanTier("FREE")).toBe("free");
    });

    it("normalizes 'starter' (and legacy 'mini')", () => {
      expect(normalizePlanTier("starter")).toBe("starter");
      expect(normalizePlanTier("mini")).toBe("starter");
      expect(normalizePlanTier("MINI")).toBe("starter");
    });

    it("normalizes 'standard'", () => {
      expect(normalizePlanTier("standard")).toBe("standard");
    });

    it("defaults to 'free' for unknown", () => {
      expect(normalizePlanTier("pro")).toBe("pro");
      expect(normalizePlanTier("unknown")).toBe("free");
      expect(normalizePlanTier(null)).toBe("free");
      expect(normalizePlanTier(undefined)).toBe("free");
    });
  });

  describe("canUseFeature", () => {
    it("free can issue certificates", () => {
      expect(canUseFeature("free", "issue_certificate")).toBe(true);
    });

    it("free cannot export CSV", () => {
      expect(canUseFeature("free", "export_one_csv")).toBe(false);
      expect(canUseFeature("free", "export_search_csv")).toBe(false);
    });

    it("starter can export single CSV", () => {
      expect(canUseFeature("starter", "export_one_csv")).toBe(true);
      expect(canUseFeature("starter", "export_search_csv")).toBe(false);
    });

    it("standard can manage templates", () => {
      expect(canUseFeature("standard", "manage_templates")).toBe(true);
    });

    it("standard cannot export selected CSV", () => {
      expect(canUseFeature("standard", "export_selected_csv")).toBe(false);
    });

    it("pro can do everything", () => {
      expect(canUseFeature("pro", "issue_certificate")).toBe(true);
      expect(canUseFeature("pro", "export_search_csv")).toBe(true);
      expect(canUseFeature("pro", "export_selected_csv")).toBe(true);
      expect(canUseFeature("pro", "manage_templates")).toBe(true);
      expect(canUseFeature("pro", "upload_logo")).toBe(true);
      expect(canUseFeature("pro", "pdf_zip")).toBe(true);
    });
  });

  describe("PHOTO_LIMITS", () => {
    it("free allows 3 photos", () => {
      expect(PHOTO_LIMITS.free).toBe(3);
    });

    it("starter allows 5 photos", () => {
      expect(PHOTO_LIMITS.starter).toBe(5);
    });

    it("standard allows 10 photos", () => {
      expect(PHOTO_LIMITS.standard).toBe(10);
    });

    it("pro allows 20 photos", () => {
      expect(PHOTO_LIMITS.pro).toBe(20);
    });
  });
});
