import { describe, expect, it } from "vitest";
import { arrivalPushMessage, isExpoPushToken } from "../arrivalPush";

describe("arrival push", () => {
  it("Expo push tokenだけを許可する", () => {
    expect(isExpoPushToken("ExpoPushToken[abc_123-XYZ]")).toBe(true);
    expect(isExpoPushToken("ExponentPushToken[abc123]")).toBe(true);
    expect(isExpoPushToken("https://attacker.example/token")).toBe(false);
  });

  it("Watchへ転送できる来店カテゴリと案件導線を付ける", () => {
    expect(
      arrivalPushMessage("ExpoPushToken[token]", {
        id: "reservation-1",
        customer: "山田 太郎",
        plate: "品川 300 あ 12-34",
      }),
    ).toMatchObject({
      title: "お客様が来店しました",
      categoryId: "customer_arrived",
      data: { route: "/work/reservation-1", reservationId: "reservation-1" },
    });
  });
});
