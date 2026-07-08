import { describe, it, expect } from "vitest";
import {
  AUTOMATION_FIELDS,
  AUTOMATION_FIELD_BY_KEY,
  AUTOMATION_FIELD_KEYS,
  AUTOMATION_SOURCES,
  NEVER_AUTO_FIELDS,
  isFieldPolicy,
  isKnownFieldKey,
  isKnownSourceKey,
  isNeverAutoField,
  sanitizeFieldPolicies,
  sanitizeSourcePolicies,
} from "../automation/fieldCatalog";
import {
  DEFAULT_AI_AUTOMATION_SETTINGS,
  filterDraftByPolicy,
  filterVehicleOcrByPolicy,
  isSourceAllowed,
  resolveFieldPolicy,
} from "../automation/policy";
import type { DraftCertificateResult } from "../draftCertificate";

describe("fieldCatalog", () => {
  it("has unique field keys", () => {
    const keys = AUTOMATION_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("populates the FIELD_BY_KEY map with every entry", () => {
    for (const f of AUTOMATION_FIELDS) {
      expect(AUTOMATION_FIELD_BY_KEY.get(f.key)).toBe(f);
      expect(AUTOMATION_FIELD_KEYS.has(f.key)).toBe(true);
    }
  });

  it("only references sources defined in AUTOMATION_SOURCES", () => {
    const sourceKeys = new Set(AUTOMATION_SOURCES.map((s) => s.key));
    for (const f of AUTOMATION_FIELDS) {
      for (const s of f.sources) {
        expect(sourceKeys.has(s)).toBe(true);
      }
    }
  });

  it("classifies policy strings", () => {
    expect(isFieldPolicy("auto")).toBe(true);
    expect(isFieldPolicy("suggest")).toBe(true);
    expect(isFieldPolicy("manual")).toBe(true);
    expect(isFieldPolicy("YOLO")).toBe(false);
    expect(isFieldPolicy(null)).toBe(false);
  });

  it("classifies field / source keys", () => {
    expect(isKnownFieldKey("certificate.title")).toBe(true);
    expect(isKnownFieldKey("does.not.exist")).toBe(false);
    expect(isKnownSourceKey("hearings")).toBe(true);
    expect(isKnownSourceKey("twitter")).toBe(false);
  });

  it("sanitizes field policies, dropping unknown keys and bad values", () => {
    const out = sanitizeFieldPolicies({
      "certificate.title": "auto",
      "certificate.description": "suggest",
      "certificate.materials": "wat", // bad value
      "ghost.field": "auto", // unknown key
      garbage: 42,
    });
    expect(out).toEqual({
      "certificate.title": "auto",
      "certificate.description": "suggest",
    });
  });

  it("sanitizes field policies of non-object input", () => {
    expect(sanitizeFieldPolicies(null)).toEqual({});
    expect(sanitizeFieldPolicies(["certificate.title"])).toEqual({});
    expect(sanitizeFieldPolicies("auto")).toEqual({});
  });

  it("sanitizes source policies", () => {
    const out = sanitizeSourcePolicies({
      photos: true,
      hearings: false,
      unknown: true,
      voice_memo: "yes", // wrong type
    });
    expect(out).toEqual({ photos: true, hearings: false });
  });
});

describe("resolveFieldPolicy", () => {
  it("returns the catalog default when nothing is overridden", () => {
    expect(resolveFieldPolicy(DEFAULT_AI_AUTOMATION_SETTINGS, "vehicle.maker")).toBe("auto");
    expect(resolveFieldPolicy(DEFAULT_AI_AUTOMATION_SETTINGS, "certificate.cautions")).toBe("manual");
    expect(resolveFieldPolicy(DEFAULT_AI_AUTOMATION_SETTINGS, "certificate.description")).toBe("suggest");
  });

  it("honors an explicit override", () => {
    const out = resolveFieldPolicy(
      {
        ...DEFAULT_AI_AUTOMATION_SETTINGS,
        fieldPolicies: { "vehicle.maker": "manual" },
      },
      "vehicle.maker",
    );
    expect(out).toBe("manual");
  });

  it("forces every field to manual when disabled globally", () => {
    const settings = { ...DEFAULT_AI_AUTOMATION_SETTINGS, enabled: false };
    expect(resolveFieldPolicy(settings, "vehicle.maker")).toBe("manual");
    expect(resolveFieldPolicy(settings, "certificate.title")).toBe("manual");
  });

  it("demotes auto → suggest when confidence is below the threshold", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      fieldPolicies: { "vehicle.maker": "auto" as const },
      confidenceThreshold: 0.8,
    };
    expect(resolveFieldPolicy(settings, "vehicle.maker", 0.95)).toBe("auto");
    expect(resolveFieldPolicy(settings, "vehicle.maker", 0.4)).toBe("suggest");
  });

  it("does not demote manual or suggest", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      fieldPolicies: {
        "certificate.cautions": "manual" as const,
        "certificate.description": "suggest" as const,
      },
      confidenceThreshold: 0.9,
    };
    expect(resolveFieldPolicy(settings, "certificate.cautions", 0.1)).toBe("manual");
    expect(resolveFieldPolicy(settings, "certificate.description", 0.1)).toBe("suggest");
  });

  it("falls back to default policy for unknown keys", () => {
    expect(resolveFieldPolicy(DEFAULT_AI_AUTOMATION_SETTINGS, "made-up.key")).toBe("suggest");
  });
});

describe("isSourceAllowed", () => {
  it("returns the catalog default when no policy is set", () => {
    expect(isSourceAllowed(DEFAULT_AI_AUTOMATION_SETTINGS, "photos")).toBe(true);
    expect(isSourceAllowed(DEFAULT_AI_AUTOMATION_SETTINGS, "voice_memo")).toBe(true);
  });

  it("respects explicit overrides", () => {
    const out = isSourceAllowed(
      {
        ...DEFAULT_AI_AUTOMATION_SETTINGS,
        sourcePolicies: { photos: false },
      },
      "photos",
    );
    expect(out).toBe(false);
  });

  it("returns false when AI is globally disabled", () => {
    expect(isSourceAllowed({ ...DEFAULT_AI_AUTOMATION_SETTINGS, enabled: false }, "photos")).toBe(false);
  });
});

describe("filterDraftByPolicy", () => {
  const draft: DraftCertificateResult = {
    title: "ガラスコーティング施工",
    description: "下地処理 → 9H ガラスコーティング → 仕上げ研磨",
    materials: [{ name: "Crystal Pro 9H", maker: "Acme" }],
    warrantyCandidates: ["3年", "5年"],
    workAreas: ["ボンネット", "ルーフ"],
    cautions: "1 週間は洗車を控えてください",
    confidence: 0.9,
    missingInfo: [],
  };

  it("returns the draft untouched when every field is auto or suggest", () => {
    const out = filterDraftByPolicy(draft, DEFAULT_AI_AUTOMATION_SETTINGS);
    expect(out.draft.title).toBe(draft.title);
    expect(out.draft.materials).toEqual(draft.materials);
    // cautions default is manual → must be blanked
    expect(out.draft.cautions).toBe("");
    expect(out.policies["certificate.cautions"]).toBe("manual");
  });

  it("blanks individual manual fields", () => {
    const out = filterDraftByPolicy(draft, {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      fieldPolicies: {
        "certificate.title": "manual",
        "certificate.materials": "manual",
        "certificate.warranty": "manual",
        "certificate.work_areas": "manual",
        "certificate.cautions": "manual",
      },
    });
    expect(out.draft.title).toBe("");
    expect(out.draft.materials).toEqual([]);
    expect(out.draft.warrantyCandidates).toEqual([]);
    expect(out.draft.workAreas).toEqual([]);
    expect(out.draft.cautions).toBe("");
    // suggest description survives
    expect(out.draft.description).toBe(draft.description);
  });

  it("blanks everything when disabled globally", () => {
    const out = filterDraftByPolicy(draft, { ...DEFAULT_AI_AUTOMATION_SETTINGS, enabled: false });
    expect(out.draft.title).toBe("");
    expect(out.draft.description).toBe("");
    expect(out.draft.materials).toEqual([]);
  });
});

describe("filterVehicleOcrByPolicy", () => {
  const extracted = {
    maker: "TOYOTA",
    model: "PRIUS",
    year: 2022,
    vin_code: "JTDKARFP0N3000001",
    plate_display: "水戸 300 あ 12-34",
    expiry_date: "2026-03-31",
    fuel_type: "hybrid",
    length_mm: 4575,
    width_mm: 1760,
    height_mm: 1470,
    size_class: "M",
  };

  it("returns the extraction untouched on defaults", () => {
    const out = filterVehicleOcrByPolicy(extracted, DEFAULT_AI_AUTOMATION_SETTINGS);
    expect(out.extracted).toEqual(extracted);
    expect(out.policies["vehicle.maker"]).toBe("auto");
    expect(out.policies["vehicle.vin"]).toBe("suggest");
  });

  it("nullifies VIN when policy is manual", () => {
    const out = filterVehicleOcrByPolicy(extracted, {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      fieldPolicies: { "vehicle.vin": "manual" },
    });
    expect(out.extracted.vin_code).toBeNull();
    expect(out.extracted.maker).toBe("TOYOTA"); // unaffected
  });

  it("nullifies every mapped field when globally disabled", () => {
    const out = filterVehicleOcrByPolicy(extracted, {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      enabled: false,
    });
    expect(out.extracted.maker).toBeNull();
    expect(out.extracted.model).toBeNull();
    expect(out.extracted.year).toBeNull();
    expect(out.extracted.vin_code).toBeNull();
    expect(out.extracted.size_class).toBeNull();
    // dimensions have no field mapping, they pass through as quality data
    expect(out.extracted.length_mm).toBe(4575);
  });
});

describe("旧・壁3 フィールド (廃止済み — 全フィールドで auto 許可)", () => {
  it("isNeverAutoField always returns false (Wall 3 disabled)", () => {
    expect(isNeverAutoField("invoice.items")).toBe(false);
    expect(isNeverAutoField("job.estimated_price")).toBe(false);
    expect(isNeverAutoField("customer.phone")).toBe(false);
    expect(isNeverAutoField("vehicle.vin")).toBe(false);
    expect(isNeverAutoField("vehicle.maker")).toBe(false);
    expect(isNeverAutoField("nope")).toBe(false);
  });

  it("NEVER_AUTO_FIELDS is empty", () => {
    expect(NEVER_AUTO_FIELDS.size).toBe(0);
  });

  it("allows auto on money / identity fields when explicitly set", () => {
    for (const key of ["invoice.items", "customer.phone", "vehicle.vin", "job.estimated_price"]) {
      const settings = {
        ...DEFAULT_AI_AUTOMATION_SETTINGS,
        fieldPolicies: { [key]: "auto" as const },
      };
      expect(resolveFieldPolicy(settings, key, 0.99)).toBe("auto");
    }
  });

  it("still demotes to suggest on low confidence", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      fieldPolicies: { "invoice.items": "auto" as const },
      confidenceThreshold: 0.8,
    };
    expect(resolveFieldPolicy(settings, "invoice.items", 0.5)).toBe("suggest");
  });

  it("still allows manual on any field", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      fieldPolicies: { "invoice.items": "manual" as const },
    };
    expect(resolveFieldPolicy(settings, "invoice.items")).toBe("manual");
  });
});

describe("filterDraftByPolicy — per-field confidence", () => {
  const base: DraftCertificateResult = {
    title: "コーティング施工",
    description: "下地処理 → コーティング",
    materials: [{ name: "9H" }],
    warrantyCandidates: ["3年"],
    workAreas: ["ルーフ"],
    cautions: "",
    confidence: 0.95,
    missingInfo: [],
  };

  it("demotes only the low-confidence field, keeping confident ones auto", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      // title/description を auto に、閾値 0.7
      fieldPolicies: {
        "certificate.title": "auto" as const,
        "certificate.description": "auto" as const,
      },
      confidenceThreshold: 0.7,
    };
    const draft: DraftCertificateResult = {
      ...base,
      confidence: 0.95,
      fieldConfidence: { title: 0.9, description: 0.4 }, // description だけ低い
    };
    const out = filterDraftByPolicy(draft, settings);
    expect(out.policies["certificate.title"]).toBe("auto"); // 高確信 → auto 維持
    expect(out.policies["certificate.description"]).toBe("suggest"); // 低確信 → デモート
  });

  it("falls back to draft-level confidence when fieldConfidence is absent", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      fieldPolicies: { "certificate.title": "auto" as const },
      confidenceThreshold: 0.7,
    };
    const low = filterDraftByPolicy({ ...base, confidence: 0.5 }, settings);
    expect(low.policies["certificate.title"]).toBe("suggest");
    const high = filterDraftByPolicy({ ...base, confidence: 0.95 }, settings);
    expect(high.policies["certificate.title"]).toBe("auto");
  });
});
