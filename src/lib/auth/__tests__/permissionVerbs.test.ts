import { describe, it, expect } from "vitest";
import {
  PERMISSION_VERBS,
  RISK_LEVELS,
  canonicalVerb,
  operationRisk,
  type PermissionVerb,
  type RiskLevel,
} from "../permissionVerbs";
import type { Permission } from "../permissions";

describe("PERMISSION_VERBS", () => {
  it("has 7 canonical verbs", () => {
    expect(PERMISSION_VERBS).toEqual(["VIEW", "EDIT", "CONFIRM", "APPROVE", "ISSUE", "MANAGE", "EXPORT"]);
  });
});

describe("RISK_LEVELS", () => {
  it("has 4 levels in ascending order", () => {
    expect(RISK_LEVELS).toEqual(["low", "medium", "high", "critical"]);
  });
});

describe("canonicalVerb()", () => {
  it.each<[Permission, PermissionVerb]>([
    ["certificates:view", "VIEW"],
    ["certificates:create", "EDIT"],
    ["certificates:edit", "EDIT"],
    ["certificates:void", "APPROVE"],
    ["vehicles:delete", "EDIT"],
    ["templates:manage", "MANAGE"],
    ["register_sessions:operate", "MANAGE"],
  ])("%s → %s", (perm, expected) => {
    expect(canonicalVerb(perm)).toBe(expected);
  });

  it("defaults to VIEW for unknown verb suffix", () => {
    // ponytail: TypeScript prevents truly unknown Permission values,
    // but the fallback is VIEW (safest default).
    expect(canonicalVerb("dashboard:view")).toBe("VIEW");
  });
});

describe("operationRisk()", () => {
  it("classifies critical operations", () => {
    expect(operationRisk("certificates:void")).toBe("critical");
    expect(operationRisk("billing:manage")).toBe("critical");
    expect(operationRisk("platform:manage")).toBe("critical");
  });

  it("classifies high-risk operations", () => {
    expect(operationRisk("certificates:create")).toBe("high");
    expect(operationRisk("invoices:edit")).toBe("high");
    expect(operationRisk("payments:manage")).toBe("high");
    expect(operationRisk("members:manage")).toBe("high");
    expect(operationRisk("vehicles:delete")).toBe("high");
  });

  it("classifies medium-risk operations", () => {
    expect(operationRisk("reservations:create")).toBe("medium");
    expect(operationRisk("customers:edit")).toBe("medium");
    expect(operationRisk("templates:manage")).toBe("medium");
  });

  it("defaults to low for view permissions", () => {
    expect(operationRisk("dashboard:view")).toBe("low");
    expect(operationRisk("certificates:view")).toBe("low");
    expect(operationRisk("reservations:view")).toBe("low");
    expect(operationRisk("stores:view")).toBe("low");
  });
});

describe("canonicalVerb() — 分からないものを低リスク側に倒さない", () => {
  it("platform:operations は MANAGE（VIEW ではない）", () => {
    // 抜けていると特権操作が「閲覧」に分類され、監査と step-up の判断が緩む。
    expect(canonicalVerb("platform:operations")).toBe("MANAGE");
  });

  it("表に無い動詞は MANAGE（fail closed）", () => {
    for (const p of ["x:unknownverb", "y:constructor", "z:toString"]) {
      const v = canonicalVerb(p as Parameters<typeof canonicalVerb>[0]);
      expect(typeof v).toBe("string");
      expect(v).toBe("MANAGE");
    }
  });
});
