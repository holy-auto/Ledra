import { describe, it, expect } from "vitest";
import { computeInitialGroupState } from "@/components/ui/Sidebar";

describe("computeInitialGroupState", () => {
  const groups = [
    { label: "業務", defaultOpen: true },
    { label: "情報・学習", defaultOpen: false },
    { label: "設定" }, // no defaultOpen specified → defaults to open
  ];

  it("on desktop, respects each group's own defaultOpen", () => {
    expect(computeInitialGroupState(groups, false)).toEqual({
      業務: true,
      "情報・学習": false,
      設定: true,
    });
  });

  it("on mobile, collapses every group regardless of defaultOpen", () => {
    expect(computeInitialGroupState(groups, true)).toEqual({
      業務: false,
      "情報・学習": false,
      設定: false,
    });
  });

  it("skips the unlabeled group (no collapsible header to track state for)", () => {
    const withUnlabeled = [{ label: "", defaultOpen: true }, ...groups];
    expect(Object.keys(computeInitialGroupState(withUnlabeled, false))).not.toContain("");
  });
});
