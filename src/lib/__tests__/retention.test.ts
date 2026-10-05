import { describe, it, expect } from "vitest";
import { retentionUntilYears, isRetentionExpired, todayInJst } from "../retention";

describe("retentionUntilYears", () => {
  it("指定年数を加算した YYYY-MM-DD を返す", () => {
    expect(retentionUntilYears(2, new Date("2026-10-05T00:00:00Z"))).toBe("2028-10-05");
    expect(retentionUntilYears(1, new Date("2026-01-31T12:00:00Z"))).toBe("2027-01-31");
  });
});

describe("isRetentionExpired [G2 保持期限後の消去経路]", () => {
  it("保持期限が無い（null/未設定）はこの経路の対象外＝false", () => {
    expect(isRetentionExpired(null, "2030-01-01")).toBe(false);
    expect(isRetentionExpired(undefined, "2030-01-01")).toBe(false);
    expect(isRetentionExpired("", "2030-01-01")).toBe(false);
  });

  it("期限日当日まで（保存義務期間中）は false（UTC/JST ズレの安全余裕で当日も保つ）", () => {
    expect(isRetentionExpired("2028-10-05", "2028-10-04")).toBe(false);
    expect(isRetentionExpired("2028-10-05", "2028-10-05")).toBe(false);
  });

  it("期限日の翌日以降は true（翌日から消去可）", () => {
    expect(isRetentionExpired("2028-10-05", "2028-10-06")).toBe(true);
  });

  it("不正な日付形式は対象外＝false（誤って消去可にしない）", () => {
    expect(isRetentionExpired("2028/10/05", "2030-01-01")).toBe(false);
    expect(isRetentionExpired("not-a-date", "2030-01-01")).toBe(false);
  });
});

describe("todayInJst", () => {
  it("UTC 深夜でも Asia/Tokyo の日付（+9h）を返す", () => {
    expect(todayInJst(new Date("2026-10-04T20:00:00Z"))).toBe("2026-10-05");
    expect(todayInJst(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-05");
  });
});
