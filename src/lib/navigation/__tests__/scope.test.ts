import { describe, it, expect } from "vitest";
import { WORK_SCOPES, WORK_SCOPE_LABELS, availableScopes, defaultScope, type WorkScope } from "../scope";

/**
 * WorkScope 型定義・ユーティリティのテスト（IMP-021）。
 */

describe("WORK_SCOPES", () => {
  it("3 段階: self, store, all_stores", () => {
    expect(WORK_SCOPES).toEqual(["self", "store", "all_stores"]);
  });

  it("全スコープに日本語ラベルが存在する", () => {
    for (const s of WORK_SCOPES) {
      expect(WORK_SCOPE_LABELS[s]).toBeTruthy();
    }
  });
});

describe("availableScopes", () => {
  it("owner は全3段階", () => {
    expect(availableScopes("owner")).toEqual(WORK_SCOPES);
  });

  it("admin は全3段階", () => {
    expect(availableScopes("admin")).toEqual(WORK_SCOPES);
  });

  it("staff は self + store", () => {
    expect(availableScopes("staff")).toEqual(["self", "store"]);
  });

  it("viewer は self のみ", () => {
    expect(availableScopes("viewer")).toEqual(["self"]);
  });
});

describe("defaultScope", () => {
  it("admin+ は store", () => {
    expect(defaultScope("owner")).toBe("store");
    expect(defaultScope("admin")).toBe("store");
  });

  it("staff 以下は self", () => {
    expect(defaultScope("staff")).toBe("self");
    expect(defaultScope("viewer")).toBe("self");
  });
});
