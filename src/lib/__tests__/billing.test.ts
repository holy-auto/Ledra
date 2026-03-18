import { describe, it, expect } from "vitest";
import { memberLimit, memberLimitLabel, canAddMember } from "../billing/memberLimits";
import { normalizePlanTier, canUseFeature, PHOTO_LIMITS } from "../billing/planFeatures";

describe("memberLimits", () => {
  describe("memberLimit", () => {
    it("mini allows 1 member", () => {
      expect(memberLimit("mini")).toBe(1);
    });

    it("standard allows 5 members", () => {
      expect(memberLimit("standard")).toBe(5);
    });

    it("pro has no limit", () => {
      expect(memberLimit("pro")).toBeNull();
    });
  });

  describe("memberLimitLabel", () => {
    it("mini shows '1人'", () => {
      expect(memberLimitLabel("mini")).toBe("1人");
    });

    it("pro shows '無制限'", () => {
      expect(memberLimitLabel("pro")).toBe("無制限");
    });
  });

  describe("canAddMember", () => {
    it("mini: cannot add when count >= 1", () => {
      expect(canAddMember("mini", 0)).toBe(true);
      expect(canAddMember("mini", 1)).toBe(false);
      expect(canAddMember("mini", 5)).toBe(false);
    });

    it("standard: cannot add when count >= 5", () => {
      expect(canAddMember("standard", 4)).toBe(true);
      expect(canAddMember("standard", 5)).toBe(false);
    });

    it("pro: always can add", () => {
      expect(canAddMember("pro", 0)).toBe(true);
      expect(canAddMember("pro", 100)).toBe(true);
      expect(canAddMember("pro", 999)).toBe(true);
    });
  });
});

describe("planFeatures", () => {
  describe("normalizePlanTier", () => {
    it("normalizes 'mini'", () => {
      expect(normalizePlanTier("mini")).toBe("mini");
      expect(normalizePlanTier("Mini")).toBe("mini");
      expect(normalizePlanTier("MINI")).toBe("mini");
    });

    it("normalizes 'standard'", () => {
      expect(normalizePlanTier("standard")).toBe("standard");
    });

    it("defaults to 'pro' for unknown", () => {
      expect(normalizePlanTier("pro")).toBe("pro");
      expect(normalizePlanTier("unknown")).toBe("pro");
      expect(normalizePlanTier(null)).toBe("pro");
      expect(normalizePlanTier(undefined)).toBe("pro");
    });
  });

  describe("canUseFeature", () => {
    it("mini can issue certificates", () => {
      expect(canUseFeature("mini", "issue_certificate")).toBe(true);
    });

    it("mini cannot export search CSV", () => {
      expect(canUseFeature("mini", "export_search_csv")).toBe(false);
    });

    it("mini cannot manage templates", () => {
      expect(canUseFeature("mini", "manage_templates")).toBe(false);
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
    it("mini allows 3 photos", () => {
      expect(PHOTO_LIMITS.mini).toBe(3);
    });

    it("standard allows 10 photos", () => {
      expect(PHOTO_LIMITS.standard).toBe(10);
    });

    it("pro allows 20 photos", () => {
      expect(PHOTO_LIMITS.pro).toBe(20);
    });
  });
});
