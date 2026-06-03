import { describe, it, expect } from "vitest";
import { shouldAnchorKind } from "@/lib/parts/anchorService";
import { parseFindingsQuery } from "@/lib/parts/findingsQuery";

describe("shouldAnchorKind", () => {
  it("high_value / serialized はアンカー対象", () => {
    expect(shouldAnchorKind("high_value")).toBe(true);
    expect(shouldAnchorKind("serialized")).toBe(true);
  });
  it("consumable / lot_only は対象外（メタアンカー側）", () => {
    expect(shouldAnchorKind("consumable")).toBe(false);
    expect(shouldAnchorKind("lot_only")).toBe(false);
  });
});

describe("parseFindingsQuery", () => {
  const q = (s: string) => parseFindingsQuery(new URLSearchParams(s));

  it("既定は status=null(=open扱い)・limit=100", () => {
    const r = q("");
    expect(r.status).toBeNull();
    expect(r.severity).toBeNull();
    expect(r.installationId).toBeNull();
    expect(r.limit).toBe(100);
  });

  it("有効な status/severity を受理", () => {
    const r = q("status=resolved&severity=critical");
    expect(r.status).toBe("resolved");
    expect(r.severity).toBe("critical");
  });

  it("不正な status/severity は null に落とす", () => {
    const r = q("status=bogus&severity=huge");
    expect(r.status).toBeNull();
    expect(r.severity).toBeNull();
  });

  it("installation_id は UUID のみ受理", () => {
    expect(q("installation_id=not-a-uuid").installationId).toBeNull();
    const uuid = "11111111-2222-3333-4444-555555555555";
    expect(q(`installation_id=${uuid}`).installationId).toBe(uuid);
  });

  it("limit は 1..500 にクランプ", () => {
    expect(q("limit=0").limit).toBe(100);
    expect(q("limit=99999").limit).toBe(100);
    expect(q("limit=50").limit).toBe(50);
  });
});
