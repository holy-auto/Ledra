import { describe, it, expect } from "vitest";
import { derivePartsIntegrityOk, getPartsIntegrityFindings, type PartFindingSummary } from "../partsIntegrity";
import type { SupabaseClient } from "@supabase/supabase-js";

/** table ごとに canned response を返す最小限の admin client スタブ。 */
function makeStub(opts: {
  installations?: Array<{ id: string }>;
  installationsError?: object;
  findings?: PartFindingSummary[];
  findingsError?: object;
}) {
  return {
    from(table: string) {
      if (table === "part_installations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: opts.installations ?? [], error: opts.installationsError ?? null }),
            }),
          }),
        };
      }
      if (table === "part_integrity_findings") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: opts.findings ?? [], error: opts.findingsError ?? null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

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

describe("getPartsIntegrityFindings()", () => {
  it("reservationId が無いと空配列（クエリを投げない）", async () => {
    const stub = makeStub({});
    expect(await getPartsIntegrityFindings(stub, "t1", null)).toEqual([]);
  });

  it("紐づく part_installations が無いと空配列", async () => {
    const stub = makeStub({ installations: [] });
    expect(await getPartsIntegrityFindings(stub, "t1", "r1")).toEqual([]);
  });

  it("part_installations → part_integrity_findings の2段引きで findings を返す", async () => {
    const stub = makeStub({
      installations: [{ id: "pi1" }, { id: "pi2" }],
      findings: [{ severity: "critical", status: "open" }],
    });
    expect(await getPartsIntegrityFindings(stub, "t1", "r1")).toEqual([{ severity: "critical", status: "open" }]);
  });

  it("part_installations のクエリが失敗すると throw する（fail-closed は呼び出し側で扱う）", async () => {
    const stub = makeStub({ installationsError: { message: "boom" } });
    await expect(getPartsIntegrityFindings(stub, "t1", "r1")).rejects.toBeTruthy();
  });

  it("part_integrity_findings のクエリが失敗すると throw する", async () => {
    const stub = makeStub({ installations: [{ id: "pi1" }], findingsError: { message: "boom" } });
    await expect(getPartsIntegrityFindings(stub, "t1", "r1")).rejects.toBeTruthy();
  });
});
