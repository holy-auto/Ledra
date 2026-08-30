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
import { VEHICLE_TABLE_PII_COLUMNS } from "@/lib/vehicles/customerRelation";

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
    expect(getFieldClassification("tenants", "line_channel_secret_ciphertext")).toBe("restricted");
    expect(getFieldClassification("invoices", "total")).toBe("confidential");
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
      { table: "invoices", column: "total" }, // confidential
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
      { table: "tenants", column: "line_channel_secret_ciphertext" }, // restricted
    ];
    expect(maxClassification(fields)).toBe("restricted");
  });

  it("非空配列では defaultClassification が最大値の計算に混入しない（Codex レビュー指摘）", () => {
    // 全フィールドが confidential でも、defaultClassification に "pii"（より厳しい値）
    // を渡すと、修正前は結果が誤って "pii" になっていた。defaultClassification は
    // 未登録フィールドの穴埋め用であり、登録済みフィールドの集計に混ぜてはならない。
    const fields = [{ table: "invoices", column: "total" }]; // confidential
    expect(maxClassification(fields, "pii")).toBe("confidential");
  });

  it("非空配列内の未登録フィールドは confidential にフェイルクローズする（Codex レビュー指摘: 'public' を渡しても危険側に倒さない）", () => {
    // defaultClassification="public" を渡しても、未登録の新規センシティブ
    // カラムが誤って public 扱いにならないことを確認。
    const fields = [{ table: "unknown_new_table", column: "unknown_new_column" }];
    expect(maxClassification(fields, "public")).toBe("confidential");
  });
});

describe("findClassificationViolations", () => {
  it("閾値以下 → 違反なし", () => {
    const fields = [{ table: "invoices", column: "total" }]; // confidential
    expect(findClassificationViolations(fields, "confidential")).toEqual([]);
  });

  it("PII フィールドが public 閾値を超える → 違反", () => {
    const fields = [
      { table: "customers", column: "name" }, // pii > public
      { table: "invoices", column: "total" }, // confidential > public
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

  it("vehicles の PII カラムは VEHICLE_TABLE_PII_COLUMNS（単一定義源）と完全一致", () => {
    // 手書きの固定リストにすると、テーブル側でカラムが増減しても追随せず乖離する
    // （customer_name 等は既に削除済み・plate_display が抜けていたバグの回帰防止）。
    const vehiclePii = FIELD_CLASSIFICATIONS.filter((e) => e.table === "vehicles" && e.classification === "pii").map(
      (e) => e.column,
    );
    expect(vehiclePii.sort()).toEqual([...VEHICLE_TABLE_PII_COLUMNS].sort());
  });

  it("実在しないテーブル/カラム名を登録しない（tenant_secrets・hearings.content・invoices.total_amount 等）", () => {
    const badRefs = [
      { table: "tenant_secrets", column: "encrypted_value" },
      { table: "hearings", column: "content" },
      { table: "invoices", column: "total_amount" },
      { table: "insurer_cases", column: "claim_amount" },
    ];
    for (const bad of badRefs) {
      const found = FIELD_CLASSIFICATIONS.some((e) => e.table === bad.table && e.column === bad.column);
      expect(found).toBe(false);
    }
  });

  it("customers の実在する PII カラムを網羅する（Codex レビュー指摘: name_kana/postal_code/address/birth_date 等が未登録だった）", () => {
    const expectedPii = [
      "name",
      "name_kana",
      "email",
      "phone",
      "postal_code",
      "address",
      "birth_date",
      "note",
      "line_user_id",
    ];
    for (const column of expectedPii) {
      expect(getFieldClassification("customers", column)).toBe("pii");
    }
  });
});
