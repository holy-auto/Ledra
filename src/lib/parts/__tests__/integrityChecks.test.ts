import { describe, it, expect } from "vitest";
import { mapTamperingFlag, buildFindingsFromAudit, serialReusedFinding } from "@/lib/parts/integrityChecks";
import type { TamperingAuditResult } from "@/lib/ai/photoTamperingCheck";

describe("mapTamperingFlag", () => {
  it("software_edited → photo_edited/critical", () => {
    expect(mapTamperingFlag("software_edited")).toEqual({ rule: "photo_edited", severity: "critical" });
  });
  it("duplicate_hash → photo_duplicate/critical", () => {
    expect(mapTamperingFlag("duplicate_hash")).toEqual({ rule: "photo_duplicate", severity: "critical" });
  });
  it("timestamp_future → timestamp_anomaly/warning", () => {
    expect(mapTamperingFlag("timestamp_future")).toEqual({ rule: "timestamp_anomaly", severity: "warning" });
  });
  it("gps_extreme → context_mismatch/warning", () => {
    expect(mapTamperingFlag("gps_extreme")).toEqual({ rule: "context_mismatch", severity: "warning" });
  });
});

describe("buildFindingsFromAudit", () => {
  const audit: TamperingAuditResult = {
    anyFlagged: true,
    summary: "",
    results: [
      {
        photoIndex: 0,
        sha256: "h0",
        exifMeta: { takenAt: null, latitude: null, longitude: null, deviceModel: null, software: null, hasExif: false },
        flags: ["duplicate_hash", "software_edited"],
        verdict: "suspicious",
        visionReason: null,
      },
      {
        photoIndex: 1,
        sha256: "h0",
        exifMeta: { takenAt: null, latitude: null, longitude: null, deviceModel: null, software: null, hasExif: false },
        flags: ["duplicate_hash"],
        verdict: "suspicious",
        visionReason: null,
      },
    ],
  };

  it("ルールごとに集約し、同一ルールはまとめる", () => {
    const findings = buildFindingsFromAudit("i1", audit);
    const rules = findings.map((f) => f.rule).sort();
    expect(rules).toEqual(["photo_duplicate", "photo_edited"]);
  });

  it("重複写真の hits を集約する", () => {
    const findings = buildFindingsFromAudit("i1", audit);
    const dup = findings.find((f) => f.rule === "photo_duplicate")!;
    expect((dup.detail.hits as unknown[]).length).toBe(2);
    expect(dup.severity).toBe("critical");
  });

  it("全 finding に installation_id が入る", () => {
    const findings = buildFindingsFromAudit("i1", audit);
    expect(findings.every((f) => f.installation_id === "i1")).toBe(true);
  });

  it("フラグなしなら finding は空", () => {
    const clean: TamperingAuditResult = { anyFlagged: false, summary: "", results: [] };
    expect(buildFindingsFromAudit("i1", clean)).toEqual([]);
  });
});

describe("serialReusedFinding", () => {
  it("critical な serial_reused を生成", () => {
    const f = serialReusedFinding("i1", "fp-abc");
    expect(f.rule).toBe("serial_reused");
    expect(f.severity).toBe("critical");
    expect(f.detail.serial_fingerprint).toBe("fp-abc");
  });
});
