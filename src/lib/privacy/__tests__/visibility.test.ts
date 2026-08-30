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
  it("tenant_internal > partner_shared > public（この3レベルはネスト階層として比較可能）", () => {
    expect(isMoreRestrictive("tenant_internal", "partner_shared")).toBe(true);
    expect(isMoreRestrictive("partner_shared", "public")).toBe(true);
  });

  it("同レベル → false", () => {
    expect(isMoreRestrictive("public", "public")).toBe(false);
  });

  it("owner_only が絡む比較は常に false（独立した軸のため順序比較できない、Codex レビュー指摘）", () => {
    // 数値比較をそのまま使うと owner_only=0 が「最も制限的」として階層に
    // 巻き戻ってしまう——canAccess() が owner_only を独立させたのと矛盾する。
    expect(isMoreRestrictive("owner_only", "tenant_internal")).toBe(false);
    expect(isMoreRestrictive("tenant_internal", "owner_only")).toBe(false);
    expect(isMoreRestrictive("owner_only", "public")).toBe(false);
  });
});

describe("canAccess", () => {
  it("同レベル → true", () => {
    expect(canAccess("tenant_internal", "tenant_internal")).toBe(true);
  });

  it("下位（より特権が低い）→ false", () => {
    expect(canAccess("tenant_internal", "public")).toBe(false);
  });

  it("public は全レベルからアクセス可（owner_only 含む）", () => {
    expect(canAccess("public", "owner_only")).toBe(true);
    expect(canAccess("public", "public")).toBe(true);
  });

  it("owner_only はネストした特権階層に含まれない — 本人であっても tenant_internal/partner_shared/restricted(owner_only要求)へは自動昇格しない", () => {
    // Codex レビュー指摘（P1）の回帰防止: 顧客は自分のPIIの「所有者」であって、
    // テナントスタッフより「上位の特権者」ではない。
    expect(canAccess("tenant_internal", "owner_only")).toBe(false);
    expect(canAccess("partner_shared", "owner_only")).toBe(false);
  });

  it("owner_only 要求のフィールドは owner_only 閲覧者のみ閲覧可（本人限定）", () => {
    expect(canAccess("owner_only", "owner_only")).toBe(true);
    expect(canAccess("owner_only", "tenant_internal")).toBe(false);
    expect(canAccess("owner_only", "partner_shared")).toBe(false);
    expect(canAccess("owner_only", "public")).toBe(false);
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

  it("owner_only → service_type（public要求）のみ表示、tenant_internal/partner_shared要求は非表示", () => {
    // Codex レビュー指摘（P1）の回帰防止: owner_only はネストした特権階層に含まれないため、
    // 「データ主体本人」であっても tenant_internal/partner_shared 要求のフィールドは見えない。
    const hidden = findHiddenFields(rules, "owner_only");
    expect(hidden.sort()).toEqual(["customer_name", "owner_email"]);
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
