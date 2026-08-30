import { describe, it, expect } from "vitest";
import {
  VISIBILITY_LEVELS,
  isMoreRestrictive,
  canAccess,
  resolveVisibility,
  findHiddenFields,
  DEFAULT_REQUIRED_VISIBILITY,
  type ViewerContext,
  type FieldVisibilityRule,
} from "../visibility";

describe("VISIBILITY_LEVELS", () => {
  it("4 レベルが定義されている", () => {
    expect(VISIBILITY_LEVELS).toEqual(["owner_only", "tenant_internal", "partner_shared", "public"]);
  });
});

describe("isMoreRestrictive", () => {
  it("owner_only > tenant_internal > partner_shared > public", () => {
    expect(isMoreRestrictive("owner_only", "tenant_internal")).toBe(true);
    expect(isMoreRestrictive("tenant_internal", "partner_shared")).toBe(true);
    expect(isMoreRestrictive("partner_shared", "public")).toBe(true);
  });

  it("同レベル → false", () => {
    expect(isMoreRestrictive("public", "public")).toBe(false);
  });
});

describe("canAccess", () => {
  it("同レベル → true", () => {
    expect(canAccess("tenant_internal", "tenant_internal")).toBe(true);
  });

  it("上位（より特権が高い）→ true", () => {
    expect(canAccess("tenant_internal", "owner_only")).toBe(true);
  });

  it("下位（より特権が低い）→ false", () => {
    expect(canAccess("tenant_internal", "public")).toBe(false);
  });

  it("public は全レベルからアクセス可", () => {
    expect(canAccess("public", "owner_only")).toBe(true);
    expect(canAccess("public", "public")).toBe(true);
  });
});

describe("resolveVisibility", () => {
  it("データ主体本人 → owner_only", () => {
    const viewer: ViewerContext = { role: "public", isDataSubject: true, hasPartnerConsent: false };
    expect(resolveVisibility(viewer)).toBe("owner_only");
  });

  it("テナントスタッフ → tenant_internal", () => {
    const viewer: ViewerContext = { role: "staff", isDataSubject: false, hasPartnerConsent: false };
    expect(resolveVisibility(viewer)).toBe("tenant_internal");
  });

  it("テナントオーナー → tenant_internal", () => {
    const viewer: ViewerContext = { role: "owner", isDataSubject: false, hasPartnerConsent: false };
    expect(resolveVisibility(viewer)).toBe("tenant_internal");
  });

  it("パートナー（開示同意あり）→ partner_shared", () => {
    const viewer: ViewerContext = { role: "partner", isDataSubject: false, hasPartnerConsent: true };
    expect(resolveVisibility(viewer)).toBe("partner_shared");
  });

  it("パートナー（開示同意なし）→ public", () => {
    const viewer: ViewerContext = { role: "partner", isDataSubject: false, hasPartnerConsent: false };
    expect(resolveVisibility(viewer)).toBe("public");
  });

  it("匿名 → public", () => {
    const viewer: ViewerContext = { role: "public", isDataSubject: false, hasPartnerConsent: false };
    expect(resolveVisibility(viewer)).toBe("public");
  });

  it("データ主体はロールに関わらず owner_only", () => {
    const viewer: ViewerContext = { role: "public", isDataSubject: true, hasPartnerConsent: false };
    expect(resolveVisibility(viewer)).toBe("owner_only");
  });
});

describe("findHiddenFields", () => {
  const rules: FieldVisibilityRule[] = [
    { field: "customer_name", requiredLevel: "tenant_internal" },
    { field: "owner_email", requiredLevel: "partner_shared" },
    { field: "service_type", requiredLevel: "public" },
  ];

  it("public 閲覧者 → customer_name, owner_email が非表示", () => {
    const hidden = findHiddenFields(rules, "public");
    expect(hidden.sort()).toEqual(["customer_name", "owner_email"]);
  });

  it("partner_shared → customer_name のみ非表示", () => {
    expect(findHiddenFields(rules, "partner_shared")).toEqual(["customer_name"]);
  });

  it("tenant_internal → 全表示", () => {
    expect(findHiddenFields(rules, "tenant_internal")).toEqual([]);
  });

  it("owner_only → 全表示", () => {
    expect(findHiddenFields(rules, "owner_only")).toEqual([]);
  });
});

describe("DEFAULT_REQUIRED_VISIBILITY", () => {
  it("pii/confidential は tenant_internal（テナントスタッフは通常業務で閲覧可能）", () => {
    // pii を owner_only にすると canAccess("owner_only", "tenant_internal") が false になり、
    // 顧客氏名・電話番号等を通常業務で見るスタッフ自身が弾かれてしまう回帰の防止。
    expect(DEFAULT_REQUIRED_VISIBILITY.pii).toBe("tenant_internal");
    expect(DEFAULT_REQUIRED_VISIBILITY.confidential).toBe("tenant_internal");
    expect(canAccess(DEFAULT_REQUIRED_VISIBILITY.pii, "tenant_internal")).toBe(true);
  });

  it("restricted は owner_only（テナントスタッフでも閲覧不可のまま）", () => {
    expect(DEFAULT_REQUIRED_VISIBILITY.restricted).toBe("owner_only");
    expect(canAccess(DEFAULT_REQUIRED_VISIBILITY.restricted, "tenant_internal")).toBe(false);
  });

  it("public は制限なし", () => {
    expect(DEFAULT_REQUIRED_VISIBILITY.public).toBe("public");
  });
});
