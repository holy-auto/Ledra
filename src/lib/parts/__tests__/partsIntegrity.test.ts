import { describe, it, expect } from "vitest";
import { derivePartsIntegrityOk, type PartFindingSummary } from "../partsIntegrity";

describe("derivePartsIntegrityOk()", () => {
  it("findings 0 件 → true（部品なし = 通過）", () => {
    expect(derivePartsIntegrityOk([])).toBe(true);
  });

  it("resolved/dismissed の critical → true（解消済み）", () => {
    const findings: PartFindingSummary[] = [
      { severity: "critical", status: "resolved" },
      { severity: "critical", status: "dismissed" },
    ];
    expect(derivePartsIntegrityOk(findings)).toBe(true);
  });

  it("open の critical → false（ブロック）", () => {
    const findings: PartFindingSummary[] = [{ severity: "critical", status: "open" }];
    expect(derivePartsIntegrityOk(findings)).toBe(false);
  });

  it("acknowledged の critical → false（未解消）", () => {
    const findings: PartFindingSummary[] = [{ severity: "critical", status: "acknowledged" }];
    expect(derivePartsIntegrityOk(findings)).toBe(false);
  });

  it("warning / info は open でも通過", () => {
    const findings: PartFindingSummary[] = [
      { severity: "warning", status: "open" },
      { severity: "info", status: "open" },
    ];
    expect(derivePartsIntegrityOk(findings)).toBe(true);
  });

  it("混在: critical resolved + warning open → true", () => {
    const findings: PartFindingSummary[] = [
      { severity: "critical", status: "resolved" },
      { severity: "warning", status: "open" },
    ];
    expect(derivePartsIntegrityOk(findings)).toBe(true);
  });

  it("混在: warning open + critical open → false", () => {
    const findings: PartFindingSummary[] = [
      { severity: "warning", status: "open" },
      { severity: "critical", status: "open" },
    ];
    expect(derivePartsIntegrityOk(findings)).toBe(false);
  });
});
