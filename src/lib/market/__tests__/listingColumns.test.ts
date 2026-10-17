import { describe, it, expect } from "vitest";
import { MARKET_LISTING_COLUMNS } from "../listingColumns";

describe("MARKET_LISTING_COLUMNS", () => {
  const cols = MARKET_LISTING_COLUMNS.split(",").map((c) => c.trim());

  it("他テナントに内部の列（仕入・成約・買主・車両の特定情報・店舗）を出さない", () => {
    for (const internal of [
      "cost_price",
      "supplier_name",
      "acquisition_date",
      "sold_at",
      "sold_price",
      "buyer_info",
      "chassis_number",
      "plate_number",
      "store_id",
    ]) {
      expect(cols).not.toContain(internal);
    }
    expect(cols).not.toContain("*");
  });

  it("列の一覧そのものを固定する（足すときは、他テナントに見せてよい列かを確かめてからここも直す）", () => {
    expect([...cols].sort()).toEqual(
      [
        "id",
        "tenant_id",
        "maker",
        "model",
        "grade",
        "year",
        "mileage",
        "color",
        "color_code",
        "engine_type",
        "displacement",
        "transmission",
        "drive_type",
        "fuel_type",
        "door_count",
        "seating_capacity",
        "body_type",
        "inspection_date",
        "repair_history",
        "condition_grade",
        "condition_note",
        "asking_price",
        "wholesale_price",
        "status",
        "listed_at",
        "description",
        "features",
        "created_at",
        "updated_at",
      ].sort(),
    );
  });

  it("/market の画面が出す列は含む", () => {
    for (const shown of ["id", "maker", "model", "asking_price", "wholesale_price", "status", "listed_at"]) {
      expect(cols).toContain(shown);
    }
  });
});
