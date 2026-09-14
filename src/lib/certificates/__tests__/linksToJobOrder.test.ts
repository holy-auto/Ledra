import { describe, expect, it } from "vitest";
import { linksToJobOrder } from "@/lib/certificates/linkToJobOrder";
import { linksToReservation } from "@/lib/certificates/linkToReservation";

describe("linksToJobOrder", () => {
  it("発注の車両と証明書の車両が一致すれば紐付ける", () => {
    expect(linksToJobOrder({ vehicle_id: "v1" }, { vehicleId: "v1" })).toBe(true);
  });

  it("発注に車両があるのに別の車両なら紐付けない（他社への誤開示を止める）", () => {
    expect(linksToJobOrder({ vehicle_id: "v1" }, { vehicleId: "v2" })).toBe(false);
  });

  it("発注に車両があるのに証明書側が未確定なら紐付けない", () => {
    // ここが linksToReservation との分かれ目。あちらは「片方が null なら矛盾なし」
    // として通すが、相手方テナントに出る紐付けでは通してはいけない。
    expect(linksToJobOrder({ vehicle_id: "v1" }, { vehicleId: null })).toBe(false);
    expect(linksToReservation({ vehicle_id: "v1", customer_id: null }, { vehicleId: null, customerId: null })).toBe(
      true,
    );
  });

  it("発注に車両が無ければ検証できないので通す（歯止めは発行フォームの明示）", () => {
    // 受発注画面は車両を送らないため、UI から作られた発注はこの形になる。
    expect(linksToJobOrder({ vehicle_id: null }, { vehicleId: "v1" })).toBe(true);
    expect(linksToJobOrder({ vehicle_id: null }, { vehicleId: null })).toBe(true);
  });
});
