import { describe, expect, it } from "vitest";
import { mergeConditionChecks } from "../conditionChecks";

describe("mergeConditionChecks", () => {
  it("条件の定義順に全件並べ、記録の無い条件は checked_at を null にする", () => {
    const rows = mergeConditionChecks(
      [
        { id: "c1", label: "下地処理", check_type: "boolean" },
        { id: "c2", label: "気温", check_type: "numeric" },
      ],
      [
        {
          id: "k2",
          condition_id: "c2",
          value_boolean: null,
          value_numeric: 24,
          value_text: null,
          checked_at: "2026-08-05T00:12:00Z",
        },
      ],
    );
    expect(rows.map((r) => r.label)).toEqual(["下地処理", "気温"]);
    expect(rows[0]).toMatchObject({ id: "condition-c1", checked_at: null, value_boolean: null });
    expect(rows[1]).toMatchObject({ id: "k2", value_numeric: 24, checked_at: "2026-08-05T00:12:00Z" });
  });
});
