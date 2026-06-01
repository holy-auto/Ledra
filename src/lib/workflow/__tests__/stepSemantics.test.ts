import { describe, it, expect } from "vitest";
import { classifyWorkflowStep } from "@/lib/workflow/stepSemantics";

describe("classifyWorkflowStep", () => {
  it("recognizes the default certificate step (key + label)", () => {
    expect(classifyWorkflowStep({ key: "certificate", label: "証明書発行" })).toBe("certificate");
    expect(classifyWorkflowStep({ key: "cert_issue", label: "" })).toBe("certificate");
    expect(classifyWorkflowStep({ key: "", label: "保証書の発行" })).toBe("certificate");
  });

  it("recognizes the default billing step (key + label)", () => {
    expect(classifyWorkflowStep({ key: "billing", label: "会計" })).toBe("billing");
    expect(classifyWorkflowStep({ key: "payment", label: "" })).toBe("billing");
    expect(classifyWorkflowStep({ key: "", label: "ご請求・精算" })).toBe("billing");
  });

  it("returns null for operational steps", () => {
    expect(classifyWorkflowStep({ key: "wash", label: "洗車" })).toBeNull();
    expect(classifyWorkflowStep({ key: "coating", label: "コーティング施工" })).toBeNull();
    expect(classifyWorkflowStep({ key: "inspect", label: "検査・仕上げ" })).toBeNull();
  });

  it("handles missing fields", () => {
    expect(classifyWorkflowStep({})).toBeNull();
    expect(classifyWorkflowStep({ key: null, label: null })).toBeNull();
  });

  it("prioritizes certificate over billing when both could match", () => {
    expect(classifyWorkflowStep({ key: "certificate", label: "証明書と会計" })).toBe("certificate");
  });
});
