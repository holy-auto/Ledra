import { describe, it, expect } from "vitest";
import {
  FEATURES,
  FEATURE_BY_HREF,
  FEATURE_BY_KEY,
  ADVANCED_FEATURE_KEYS,
  FEATURE_GROUPS,
  isKnownAdvancedFeature,
  sanitizeFeatureKeys,
  isAdvancedFeatureVisible,
  featureTierForHref,
  isVisibleInBusinessMode,
} from "../catalog";

describe("feature catalog integrity", () => {
  it("has unique keys and hrefs", () => {
    const keys = FEATURES.map((f) => f.key);
    const hrefs = FEATURES.map((f) => f.href);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("lookup maps cover every feature", () => {
    for (const f of FEATURES) {
      expect(FEATURE_BY_KEY.get(f.key)).toBe(f);
      expect(FEATURE_BY_HREF.get(f.href)).toBe(f);
    }
  });

  it("ADVANCED_FEATURE_KEYS contains exactly the advanced features", () => {
    const advanced = FEATURES.filter((f) => f.tier === "advanced").map((f) => f.key);
    expect([...ADVANCED_FEATURE_KEYS].sort()).toEqual(advanced.sort());
    // core keys must never be persistable
    for (const f of FEATURES.filter((x) => x.tier === "core")) {
      expect(ADVANCED_FEATURE_KEYS.has(f.key)).toBe(false);
    }
  });

  it("every advanced feature belongs to a known group", () => {
    const groupKeys = new Set(FEATURE_GROUPS.map((g) => g.key));
    for (const f of FEATURES.filter((x) => x.tier === "advanced")) {
      expect(groupKeys.has(f.groupKey)).toBe(true);
    }
  });
});

describe("isKnownAdvancedFeature", () => {
  it("accepts only known advanced keys", () => {
    expect(isKnownAdvancedFeature("audit")).toBe(true);
    expect(isKnownAdvancedFeature("dashboard")).toBe(false); // core
    expect(isKnownAdvancedFeature("nope")).toBe(false);
    expect(isKnownAdvancedFeature(123)).toBe(false);
    expect(isKnownAdvancedFeature(null)).toBe(false);
  });
});

describe("sanitizeFeatureKeys", () => {
  it("drops unknown/core/non-string keys and dedupes", () => {
    const out = sanitizeFeatureKeys([
      "audit",
      "audit",
      "dashboard", // core -> dropped
      "definitely-not-real",
      42,
      null,
      "stores",
    ]);
    expect(out.sort()).toEqual(["audit", "stores"].sort());
  });

  it("returns [] for non-array input", () => {
    expect(sanitizeFeatureKeys("audit")).toEqual([]);
    expect(sanitizeFeatureKeys(undefined)).toEqual([]);
    expect(sanitizeFeatureKeys({})).toEqual([]);
  });
});

describe("isAdvancedFeatureVisible", () => {
  it("visible only when not tenant-disabled AND user opted in", () => {
    const disabled = new Set<string>(["btob"]);
    const visible = new Set<string>(["btob", "stores"]);

    // user opted in, tenant allows -> visible
    expect(isAdvancedFeatureVisible("stores", disabled, visible)).toBe(true);
    // user opted in, but tenant disabled -> hidden (gate wins)
    expect(isAdvancedFeatureVisible("btob", disabled, visible)).toBe(false);
    // tenant allows, but user did not opt in -> hidden (default)
    expect(isAdvancedFeatureVisible("audit", disabled, visible)).toBe(false);
  });

  it("defaults to hidden with empty preferences", () => {
    const empty = new Set<string>();
    expect(isAdvancedFeatureVisible("stores", empty, empty)).toBe(false);
  });
});

describe("featureTierForHref", () => {
  it("returns the catalog tier, treating unknown hrefs as core", () => {
    expect(featureTierForHref("/admin")).toBe("core");
    expect(featureTierForHref("/admin/audit")).toBe("advanced");
    expect(featureTierForHref("/admin/certificates")).toBe("core");
    // unknown / platform / hidden routes are never gated by this layer
    expect(featureTierForHref("/admin/platform/operations")).toBe("core");
    expect(featureTierForHref("/admin/totally-unknown")).toBe("core");
  });
});

describe("isVisibleInBusinessMode", () => {
  it("never filters when no mode is selected (null = 'all')", () => {
    expect(isVisibleInBusinessMode("/admin/tire-storage", null)).toBe(true);
    expect(isVisibleInBusinessMode("/admin/body-repair", null)).toBe(true);
  });

  it("shows a tagged feature only in one of its tagged modes", () => {
    expect(isVisibleInBusinessMode("/admin/tire-storage", "mechanic")).toBe(true);
    expect(isVisibleInBusinessMode("/admin/tire-storage", "coating")).toBe(false);
    expect(isVisibleInBusinessMode("/admin/thickness-reports", "coating")).toBe(true);
    expect(isVisibleInBusinessMode("/admin/thickness-reports", "ppf")).toBe(true);
    expect(isVisibleInBusinessMode("/admin/thickness-reports", "mechanic")).toBe(false);
  });

  it("treats untagged features as common — always visible in any selected mode", () => {
    expect(isVisibleInBusinessMode("/admin/customers", "mechanic")).toBe(true);
    expect(isVisibleInBusinessMode("/admin/customers", "ppf")).toBe(true);
  });

  it("treats unknown hrefs as common (never filtered)", () => {
    expect(isVisibleInBusinessMode("/admin/totally-unknown", "mechanic")).toBe(true);
  });
});
