import { describe, it, expect, vi } from "vitest";
import {
  decideGate,
  auditCertificatePhotos,
  type StandardRule,
  type CertificatePhotoAudit,
} from "../photoQualityCheck";

vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: () => {
    throw new Error("AI client should not be invoked in precheck mode");
  },
  AI_MODEL_VISION: "stub",
}));

const baseAudit = (partial: Partial<CertificatePhotoAudit> = {}): CertificatePhotoAudit => ({
  certificateId: "c1",
  category: "ppf",
  overallStatus: "pass",
  standardLevel: "standard",
  score: 90,
  photoResults: [],
  missingPhotos: [],
  missingFields: [],
  warningMessages: [],
  ...partial,
});

describe("decideGate", () => {
  it("passes a clean audit", () => {
    expect(decideGate(baseAudit())).toEqual({ action: "pass" });
  });

  it("blocks when required photos are missing", () => {
    const result = decideGate(baseAudit({ missingPhotos: ["施工前 全体"], missingFields: [] }));
    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.reason).toContain("写真");
      expect(result.missingPhotos).toContain("施工前 全体");
    }
  });

  it("blocks when required fields are missing", () => {
    const result = decideGate(baseAudit({ missingFields: ["コーティング剤名"] }));
    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.reason).toContain("項目");
    }
  });

  it("blocks when an error-level warning is present even if nothing else is missing", () => {
    const result = decideGate(
      baseAudit({
        warningMessages: [{ level: "error", message: "保証期間が空です" }],
      }),
    );
    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.errors).toContain("保証期間が空です");
    }
  });

  it("warns when only warning-level messages exist", () => {
    const result = decideGate(
      baseAudit({
        warningMessages: [
          { level: "warning", message: "写真が 4 枚未満です" },
          { level: "info", message: "おまけ情報" },
        ],
      }),
    );
    expect(result.action).toBe("warn");
    if (result.action === "warn") {
      expect(result.warnings).toEqual(["写真が 4 枚未満です"]);
    }
  });

  it("uses the combined reason when both photos and fields are missing", () => {
    const result = decideGate(
      baseAudit({
        missingPhotos: ["施工後 全体"],
        missingFields: ["保証期間"],
      }),
    );
    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.reason).toContain("写真");
      expect(result.reason).toContain("項目");
    }
  });
});

describe("auditCertificatePhotos (precheck path)", () => {
  const rule: StandardRule = {
    id: "rule-1",
    category: "ppf",
    category_label: "PPF",
    required_photos: [
      { id: "before_full", label: "施工前 全体", required: true, count_min: 1 },
      { id: "after_full", label: "施工後 全体", required: true, count_min: 1 },
    ],
    required_fields: [
      { key: "material_name", label: "素材名", required: true },
      { key: "warranty_period", label: "保証期間", required: true },
    ],
    warning_rules: [{ condition: "photo_count_lt_4", level: "warning", message: "写真が 4 枚未満です" }],
    standard_level: "standard",
  };

  it("flags missing required photos and fields without calling Vision", async () => {
    const audit = await auditCertificatePhotos({
      certificateId: "",
      category: "ppf",
      photoUrls: [],
      fieldValues: {},
      standardRule: rule,
      checkPhotosWithAI: false,
    });
    expect(audit.missingPhotos.length).toBeGreaterThan(0);
    expect(audit.missingFields).toEqual(["素材名", "保証期間"]);
    expect(audit.overallStatus).toBe("warning");
  });

  it("returns pass once all required fields and photos are present", async () => {
    const audit = await auditCertificatePhotos({
      certificateId: "",
      category: "ppf",
      photoUrls: ["a", "b", "c", "d"],
      fieldValues: { material_name: "XPEL Ultimate Plus", warranty_period: "10年" },
      standardRule: rule,
      checkPhotosWithAI: false,
    });
    expect(audit.missingPhotos).toEqual([]);
    expect(audit.missingFields).toEqual([]);
    expect(audit.overallStatus).toBe("pass");
    expect(decideGate(audit)).toEqual({ action: "pass" });
  });

  it("emits a warning when photo count triggers a warning rule", async () => {
    const audit = await auditCertificatePhotos({
      certificateId: "",
      category: "ppf",
      photoUrls: ["a", "b"],
      fieldValues: { material_name: "XPEL", warranty_period: "10年" },
      standardRule: rule,
      checkPhotosWithAI: false,
    });
    expect(audit.warningMessages.some((w) => w.level === "warning")).toBe(true);
    const gate = decideGate(audit);
    expect(gate.action).toBe("warn");
  });
});
