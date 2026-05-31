import { describe, it, expect } from "vitest";
import { inferServiceType, pickWorkflowProposalCandidate, type WorkflowTemplateLite } from "@/lib/ai/workflowProposal";

const templates: WorkflowTemplateLite[] = [
  { id: "plat-coating", name: "コーティング標準", service_type: "coating", is_default: false, is_platform: true },
  { id: "plat-ppf", name: "PPF施工標準", service_type: "ppf", is_default: false, is_platform: true },
  { id: "tenant-coating", name: "当店コーティング", service_type: "coating", is_default: true, is_platform: false },
];

describe("inferServiceType", () => {
  it("maps coating keywords", () => {
    expect(inferServiceType("ガラスコーティング施工", [])).toBe("coating");
    expect(inferServiceType(null, ["セラミックコーティング"])).toBe("coating");
  });
  it("maps ppf / wrapping / body_repair keywords", () => {
    expect(inferServiceType("PPF プロテクションフィルム", [])).toBe("ppf");
    expect(inferServiceType("カーラッピング", [])).toBe("wrapping");
    expect(inferServiceType("バンパー板金修理", [])).toBe("body_repair");
  });
  it("returns null when nothing matches", () => {
    expect(inferServiceType("点検", [])).toBe(null);
    expect(inferServiceType(null, [])).toBe(null);
  });
  it("prioritizes ppf over coating when both could appear", () => {
    // 'コーティング' 含むが PPF が主の場合は ppf を優先 (順序判定)
    expect(inferServiceType("PPF + ガラスコーティング", [])).toBe("ppf");
  });
});

describe("pickWorkflowProposalCandidate", () => {
  it("prefers tenant default template for the inferred service_type", () => {
    const r = pickWorkflowProposalCandidate({
      title: "ガラスコーティング",
      menuItemNames: [],
      pastServiceTypes: [],
      templates,
    });
    expect(r.serviceType).toBe("coating");
    expect(r.suggestedTemplateId).toBe("tenant-coating"); // tenant default beats platform
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("falls back to past history when current intent is ambiguous", () => {
    const r = pickWorkflowProposalCandidate({
      title: "点検",
      menuItemNames: [],
      pastServiceTypes: ["ppf", "ppf", "coating"],
      templates,
    });
    expect(r.serviceType).toBe("ppf");
    expect(r.suggestedTemplateId).toBe("plat-ppf");
  });

  it("high confidence when current intent and history agree", () => {
    const r = pickWorkflowProposalCandidate({
      title: "ガラスコーティング",
      menuItemNames: [],
      pastServiceTypes: ["coating"],
      templates,
    });
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("no suggestion (null) when no template matches the type", () => {
    const r = pickWorkflowProposalCandidate({
      title: "カーラッピング",
      menuItemNames: [],
      pastServiceTypes: [],
      templates, // no wrapping template
    });
    expect(r.serviceType).toBe("wrapping");
    expect(r.suggestedTemplateId).toBe(null);
  });

  it("returns null suggestion when type cannot be determined", () => {
    const r = pickWorkflowProposalCandidate({
      title: "点検",
      menuItemNames: [],
      pastServiceTypes: [],
      templates,
    });
    expect(r.serviceType).toBe(null);
    expect(r.suggestedTemplateId).toBe(null);
    expect(r.confidence).toBe(0);
  });
});
