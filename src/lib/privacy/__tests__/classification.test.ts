import { describe, it, expect } from "vitest";
import {
  isStricterThan,
  stricterOf,
  getFieldClassification,
  maxClassification,
  findClassificationViolations,
  FIELD_CLASSIFICATIONS,
  DATA_CLASSIFICATIONS,
} from "../classification";

describe("DATA_CLASSIFICATIONS", () => {
  it("4 分類が定義されている", () => {
    expect(DATA_CLASSIFICATIONS).toEqual(["restricted", "pii", "confidential", "public"]);
  });
});

describe("isStricterThan", () => {
  it("restricted > pii > confidential > public", () => {
    expect(isStricterThan("restricted", "pii")).toBe(true);
    expect(isStricterThan("pii", "confidential")).toBe(true);
    expect(isStricterThan("confidential", "public")).toBe(true);
  });

  it("同じレベル → false", () => {
    expect(isStricterThan("pii", "pii")).toBe(false);
  });

  it("逆方向 → false", () => {
    expect(isStricterThan("public", "restricted")).toBe(false);
  });
});

describe("stricterOf", () => {
  it("2 つの分類のうち厳しい方を返す", () => {
    expect(stricterOf("pii", "public")).toBe("pii");
    expect(stricterOf("confidential", "restricted")).toBe("restricted");
    expect(stricterOf("pii", "pii")).toBe("pii");
  });
});

describe("getFieldClassification", () => {
  it("登録済みフィールドの分類を返す", () => {
    expect(getFieldClassification("customers", "name")).toBe("pii");
    expect(getFieldClassification("tenant_secrets", "encrypted_value")).toBe("restricted");
    expect(getFieldClassification("invoices", "total_amount")).toBe("confidential");
  });

  it("未登録フィールド → デフォルト confidential", () => {
    expect(getFieldClassification("unknown", "unknown")).toBe("confidential");
  });

  it("デフォルト値を指定できる", () => {
    expect(getFieldClassification("unknown", "unknown", "public")).toBe("public");
  });
});

describe("maxClassification", () => {
  it("フィールド群の最も厳しい分類を返す", () => {
    const fields = [
      { table: "customers", column: "name" }, // pii
      { table: "invoices", column: "total_amount" }, // confidential
    ];
    expect(maxClassification(fields)).toBe("pii");
  });

  it("空配列 → デフォルト", () => {
    expect(maxClassification([])).toBe("public");
    expect(maxClassification([], "confidential")).toBe("confidential");
  });

  it("restricted が含まれれば restricted", () => {
    const fields = [
      { table: "customers", column: "name" }, // pii
      { table: "tenant_secrets", column: "encrypted_value" }, // restricted
    ];
    expect(maxClassification(fields)).toBe("restricted");
  });
});

describe("findClassificationViolations", () => {
  it("閾値以下 → 違反なし", () => {
    const fields = [{ table: "invoices", column: "total_amount" }]; // confidential
    expect(findClassificationViolations(fields, "confidential")).toEqual([]);
  });

  it("PII フィールドが public 閾値を超える → 違反", () => {
    const fields = [
      { table: "customers", column: "name" }, // pii > public
      { table: "invoices", column: "total_amount" }, // confidential > public
    ];
    const violations = findClassificationViolations(fields, "public");
    expect(violations).toHaveLength(2);
    expect(violations[0]).toEqual({ table: "customers", column: "name", actual: "pii" });
  });

  it("空 → 違反なし", () => {
    expect(findClassificationViolations([], "public")).toEqual([]);
  });
});

describe("FIELD_CLASSIFICATIONS レジストリ", () => {
  it("全エントリに table, column, classification がある", () => {
    for (const entry of FIELD_CLASSIFICATIONS) {
      expect(entry.table).toBeTruthy();
      expect(entry.column).toBeTruthy();
      expect(DATA_CLASSIFICATIONS).toContain(entry.classification);
    }
  });

  it("vehicles の PII カラム 5 件が登録されている", () => {
    const vehiclePii = FIELD_CLASSIFICATIONS.filter((e) => e.table === "vehicles" && e.classification === "pii");
    expect(vehiclePii.length).toBe(5);
  });
});
