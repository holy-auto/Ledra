import { describe, it, expect } from "vitest";

import { linksToReservation } from "@/lib/certificates/linkToReservation";

const NONE = { vehicleId: null, customerId: null };

describe("linksToReservation", () => {
  it("**予約側が空なら矛盾ではない**（本番の予約169件中164件がこの形）", () => {
    // 予約に顧客も車両も入っていないのに、証明書側で顧客を作った状態。
    // 以前はこれを不一致として弾き、証明書45件すべてで reservation_id が
    // null になっていた（施工写真が永久に0件）
    expect(linksToReservation({ vehicle_id: null, customer_id: null }, { vehicleId: "v1", customerId: "c1" })).toBe(
      true,
    );
  });

  it("両方に値があって一致すれば紐付ける", () => {
    expect(linksToReservation({ vehicle_id: "v1", customer_id: "c1" }, { vehicleId: "v1", customerId: "c1" })).toBe(
      true,
    );
  });

  it("**車両が食い違えば紐付けない**（別案件を「作成済」に誤マークしない）", () => {
    expect(linksToReservation({ vehicle_id: "v1", customer_id: "c1" }, { vehicleId: "v2", customerId: "c1" })).toBe(
      false,
    );
  });

  it("**顧客が食い違えば紐付けない**", () => {
    expect(linksToReservation({ vehicle_id: "v1", customer_id: "c1" }, { vehicleId: "v1", customerId: "c2" })).toBe(
      false,
    );
  });

  it("証明書側が空なら、予約側に値があっても矛盾しない", () => {
    expect(linksToReservation({ vehicle_id: "v1", customer_id: "c1" }, NONE)).toBe(true);
  });

  it("片方だけ食い違えば紐付けない（もう片方が一致していても）", () => {
    expect(linksToReservation({ vehicle_id: "v1", customer_id: null }, { vehicleId: "v2", customerId: "c1" })).toBe(
      false,
    );
  });
});
