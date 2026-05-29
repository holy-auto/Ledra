import { describe, it, expect } from "vitest";
import { suggestCaseAssignees } from "../caseAssignSuggest";
import { buildFallbackLines } from "../caseSummary";

describe("suggestCaseAssignees", () => {
  const users = [
    { id: "u1", display_name: "佐藤" },
    { id: "u2", display_name: "鈴木" },
    { id: "u3", display_name: "高橋" },
  ];

  it("returns the rule-matched assignee with confidence 1.0", async () => {
    const out = await suggestCaseAssignees({
      category: "coating",
      priority: "high",
      history: [],
      users,
      rules: [{ condition_type: "category", condition_value: "coating", assign_to: "u2", is_active: true }],
    });
    expect(out.candidates).toEqual([
      expect.objectContaining({ user_id: "u2", method: "rule", score: 1.0 }),
    ]);
  });

  it("ignores inactive rules", async () => {
    const out = await suggestCaseAssignees({
      category: "coating",
      priority: "high",
      history: [],
      users,
      rules: [{ condition_type: "category", condition_value: "coating", assign_to: "u2", is_active: false }],
    });
    expect(out.candidates[0]?.method).not.toBe("rule");
  });

  it("falls back to history frequency when no rule matches", async () => {
    const out = await suggestCaseAssignees({
      category: "ppf",
      priority: "normal",
      history: [
        { category: "ppf", priority: "normal", assigned_to: "u3" },
        { category: "ppf", priority: "normal", assigned_to: "u3" },
        { category: "ppf", priority: "high", assigned_to: "u1" },
      ],
      users,
      rules: [],
    });
    expect(out.candidates[0]?.user_id).toBe("u3");
    expect(out.candidates[0]?.method).toBe("history");
  });

  it("returns first user as deterministic fallback when nothing matches", async () => {
    const out = await suggestCaseAssignees({
      category: null,
      priority: "low",
      history: [],
      users,
      rules: [],
    });
    expect(out.candidates[0]?.user_id).toBe("u1");
    expect(out.candidates[0]?.method).toBe("fallback");
    expect(out.candidates[0]?.score).toBeLessThan(0.5);
  });

  it("returns empty candidates when there are no users at all", async () => {
    const out = await suggestCaseAssignees({
      category: null,
      priority: "low",
      history: [],
      users: [],
      rules: [],
    });
    expect(out.candidates).toEqual([]);
  });

  it("matches subject_contains rules case-insensitively", async () => {
    const out = await suggestCaseAssignees({
      category: null,
      priority: "normal",
      subject: "板金修理の見積もりについて",
      history: [],
      users,
      rules: [{ condition_type: "subject_contains", condition_value: "板金", assign_to: "u3", is_active: true }],
    });
    expect(out.candidates[0]?.user_id).toBe("u3");
  });
});

describe("buildFallbackLines", () => {
  it("uses the subject when available", () => {
    const out = buildFallbackLines({
      subject: "前バンパー塗装の保証請求",
      status: "in_progress",
      priority: "high",
    });
    expect(out.lines[0]).toContain("前バンパー");
    expect(out.lines[1]).toContain("in_progress");
  });

  it("uses the vehicle when subject is missing", () => {
    const out = buildFallbackLines({
      status: "open",
      priority: "normal",
      vehicle: { maker: "トヨタ", model: "プリウス" },
    });
    expect(out.lines[0]).toContain("トヨタ");
  });

  it("returns a generic placeholder when everything is missing", () => {
    const out = buildFallbackLines({ status: "open", priority: "normal" });
    expect(out.lines).toHaveLength(3);
    expect(out.ai).toBe(false);
  });
});
