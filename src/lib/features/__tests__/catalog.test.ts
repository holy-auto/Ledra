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

  // Regression guard: a route that had no catalog entry before was implicitly
  // "core" (featureTierForHref falls back to "core" for unknown hrefs — see
  // below), i.e. always visible. Newly cataloguing it as "advanced" would
  // retroactively hide it for every existing user whose user_feature_prefs
  // has no row yet (isAdvancedFeatureVisible defaults to hidden). These hrefs
  // were backfilled into the catalog in this change and must stay "core" so
  // existing sidebars don't lose links overnight.
  it("routes newly added to the catalog stay core (no retroactive hiding)", () => {
    const previouslyUncataloguedHrefs = [
      "/admin/body-repair",
      "/admin/hq-overview",
      "/admin/inspection-templates",
      "/admin/integrations",
      "/admin/line-broadcasts",
      "/admin/loaner-cars",
      "/admin/maintenance-packs",
      "/admin/messages",
      "/admin/organizations",
      "/admin/parts-install/new",
      "/admin/parts-orders",
      "/admin/payment-ledger",
      "/admin/pos",
      "/admin/price-stats",
      "/admin/purchase-orders",
      "/admin/service-reminders",
      "/admin/settings/follow-up",
      "/admin/settings/customer-ranks",
      "/admin/staff",
      "/admin/stocktake",
      "/admin/tire-storage",
    ];
    for (const href of previouslyUncataloguedHrefs) {
      expect(FEATURE_BY_HREF.get(href)?.tier, `${href} must stay core`).toBe("core");
    }

    // 2026-07 ナビ大カテゴリ再編で、低頻度機能を意図的に advanced（既定非表示＋
    // オプトイン）へ移した。既存ユーザーは /admin/settings/features で再表示できる。
    // 上の「後から隠さない」ガードの明示的な例外なので、advanced であることを固定する。
    const intentionallyOptionalisedHrefs = [
      "/admin/agent-commissions",
      "/admin/booths",
      "/admin/contact-schedules",
      "/admin/coupons",
      "/admin/deals",
      "/admin/insurers",
      "/admin/market-vehicles",
      "/admin/next-touch",
      "/admin/notification-logs",
      "/admin/quick-quote",
      "/admin/reviews",
      "/admin/shop-announcements",
    ];
    for (const href of intentionallyOptionalisedHrefs) {
      expect(FEATURE_BY_HREF.get(href)?.tier, `${href} is now advanced (intentional)`).toBe("advanced");
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
