import { describe, it, expect } from "vitest";
import {
  mapTamperingFlag,
  buildFindingsFromAudit,
  serialReusedFinding,
  flagFindingsFromEvidence,
} from "@/lib/parts/integrityChecks";
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

describe("flagFindingsFromEvidence", () => {
  it("flag が無ければ finding を生成しない", () => {
    expect(flagFindingsFromEvidence("i1", [{ integrity_flags: [] }, {}])).toEqual([]);
  });

  it("編集ソフト痕跡 → critical な photo_edited を生成", () => {
    const out = flagFindingsFromEvidence("i1", [{ integrity_flags: ["software_edited"] }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ installation_id: "i1", rule: "photo_edited", severity: "critical" });
    expect(out[0].detail.flags).toEqual(["software_edited"]);
  });

  it("同一 rule は集約し、最も重い severity を採用する", () => {
    // exif_stripped(photo_edited/warning) と software_edited(photo_edited/critical) は同 rule。
    const out = flagFindingsFromEvidence("i1", [
      { integrity_flags: ["exif_stripped"] },
      { integrity_flags: ["software_edited"] },
    ]);
    const photoEdited = out.find((f) => f.rule === "photo_edited");
    expect(out).toHaveLength(1);
    expect(photoEdited?.severity).toBe("critical");
    expect(photoEdited?.detail.flags).toEqual(["exif_stripped", "software_edited"]);
  });

  it("異なる rule は別 finding として返す", () => {
    const out = flagFindingsFromEvidence("i1", [{ integrity_flags: ["software_edited", "timestamp_future"] }]);
    const rules = out.map((f) => f.rule).sort();
    expect(rules).toEqual(["photo_edited", "timestamp_anomaly"]);
  });
});
