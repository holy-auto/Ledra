import { describe, it, expect } from "vitest";
import { deriveWorkStamp } from "../workStamp";

// 取り込みサーバ tz=UTC 前提で exif_captured_at は「壁時計の UTC 化」。
// テストの ISO は "...Z" 表記で壁時計の UTC 成分をそのまま与える。
const NOW = new Date("2026-03-15T00:00:00Z");

describe("deriveWorkStamp", () => {
  it("3枚: 最早の撮影日を施工日、最早→最遅を作業時間(分)にする", () => {
    const r = deriveWorkStamp(
      [
        { capturedAt: "2026-03-14T09:00:00Z" },
        { capturedAt: "2026-03-14T10:30:00Z" },
        { capturedAt: "2026-03-14T11:15:00Z" },
      ],
      { now: NOW },
    );
    expect(r.workDate).toBe("2026-03-14");
    expect(r.workMinutes).toBe(135); // 09:00→11:15 = 135分
    expect(r.confidence).toBe("high");
    expect(r.basis.usable).toBe(3);
    expect(r.warnings).toEqual([]);
  });

  it("1枚のみ: 施工日は出す・作業時間は null・single_photo 警告", () => {
    const r = deriveWorkStamp([{ capturedAt: "2026-03-14T09:00:00Z" }], { now: NOW });
    expect(r.workDate).toBe("2026-03-14");
    expect(r.workMinutes).toBeNull();
    expect(r.warnings).toContain("single_photo");
    expect(r.confidence).toBe("high");
  });

  it("EXIF無し(全て null): none・no_exif、日付も時間も出さない", () => {
    const r = deriveWorkStamp([{ capturedAt: null }, { capturedAt: null }], { now: NOW });
    expect(r.workDate).toBeNull();
    expect(r.workMinutes).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.warnings).toContain("no_exif");
  });

  it("壊れた時計(1970/未来)は除外し insane_clock、正常な1枚で日付を出す", () => {
    const r = deriveWorkStamp(
      [
        { capturedAt: "1970-01-01T00:00:00Z" }, // epoch
        { capturedAt: "2030-01-01T00:00:00Z" }, // 遠い未来
        { capturedAt: "2026-03-14T08:00:00Z" }, // 正常
      ],
      { now: NOW },
    );
    expect(r.workDate).toBe("2026-03-14");
    expect(r.basis.usable).toBe(1);
    expect(r.warnings).toContain("insane_clock");
    expect(r.warnings).toContain("single_photo");
  });

  it("広すぎる時間幅(>12h)は作業時間を出さず wide_spread・low", () => {
    const r = deriveWorkStamp(
      [
        { capturedAt: "2026-03-14T07:00:00Z" },
        { capturedAt: "2026-03-14T23:00:00Z" }, // 16h 差
      ],
      { now: NOW },
    );
    expect(r.workDate).toBe("2026-03-14");
    expect(r.workMinutes).toBeNull();
    expect(r.warnings).toContain("wide_spread");
    expect(r.confidence).toBe("low");
  });

  it("予約日から乖離した撮影日は stale_album・low", () => {
    const r = deriveWorkStamp([{ capturedAt: "2026-03-01T09:00:00Z" }, { capturedAt: "2026-03-01T09:30:00Z" }], {
      now: NOW,
      expectedDate: "2026-03-14",
    });
    expect(r.workDate).toBe("2026-03-01");
    expect(r.warnings).toContain("stale_album");
    expect(r.confidence).toBe("low");
  });

  it("tz境界: 23:30(UTC成分)の写真は変換せず同じ日付に留まる", () => {
    // Asia/Tokyo に変換すると翌日 08:30 になってしまうが、施工日は UTC 成分で読む。
    const r = deriveWorkStamp([{ capturedAt: "2026-03-14T23:30:00Z" }], { now: NOW });
    expect(r.workDate).toBe("2026-03-14");
  });

  it("Date インスタンスも文字列と同様に扱える", () => {
    const r = deriveWorkStamp(
      [{ capturedAt: new Date("2026-03-14T09:00:00Z") }, { capturedAt: new Date("2026-03-14T09:20:00Z") }],
      { now: NOW },
    );
    expect(r.workDate).toBe("2026-03-14");
    expect(r.workMinutes).toBe(20);
  });
});
