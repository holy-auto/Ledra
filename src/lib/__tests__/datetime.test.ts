import { describe, it, expect } from "vitest";
import {
  jstLocalInputToUtcIso,
  utcIsoToJstLocalInput,
  formatJstDateTime,
  formatJstDateTimeJa,
  formatJstDateJa,
  businessDateString,
} from "../datetime";

describe("businessDateString", () => {
  it("JST 深夜帯を前日ではなく当日として返す", () => {
    expect(businessDateString(new Date("2026-08-27T15:30:00.000Z"))).toBe("2026-08-28");
  });
});

describe("jstLocalInputToUtcIso", () => {
  it("naive な datetime-local を JST として解釈し UTC ISO へ変換する（9時間戻す）", () => {
    // 予約: JST 14:00 → UTC 05:00。サーバ TZ に依存しない。
    expect(jstLocalInputToUtcIso("2026-07-30T14:00")).toBe("2026-07-30T05:00:00.000Z");
  });

  it("秒付きも扱える", () => {
    expect(jstLocalInputToUtcIso("2026-07-30T14:00:30")).toBe("2026-07-30T05:00:30.000Z");
  });

  it("空文字・null は null", () => {
    expect(jstLocalInputToUtcIso("")).toBeNull();
    expect(jstLocalInputToUtcIso(null)).toBeNull();
    expect(jstLocalInputToUtcIso(undefined)).toBeNull();
  });

  it("既にオフセット付きの文字列は二重付与しない", () => {
    expect(jstLocalInputToUtcIso("2026-07-30T05:00:00.000Z")).toBe("2026-07-30T05:00:00.000Z");
    expect(jstLocalInputToUtcIso("2026-07-30T14:00+09:00")).toBe("2026-07-30T05:00:00.000Z");
  });
});

describe("utcIsoToJstLocalInput", () => {
  it("UTC ISO を JST 壁時計の datetime-local へ戻す", () => {
    expect(utcIsoToJstLocalInput("2026-07-30T05:00:00.000Z")).toBe("2026-07-30T14:00");
  });

  it("空・不正は空文字", () => {
    expect(utcIsoToJstLocalInput(null)).toBe("");
    expect(utcIsoToJstLocalInput("")).toBe("");
    expect(utcIsoToJstLocalInput("not-a-date")).toBe("");
  });

  it("入力→保存→再表示のラウンドトリップが一致する", () => {
    const input = "2026-12-31T23:30";
    const stored = jstLocalInputToUtcIso(input)!;
    expect(utcIsoToJstLocalInput(stored)).toBe(input);
  });
});

describe("表示フォーマッタ（JST・サーバTZ非依存）", () => {
  it("formatJstDateTime: UTC保存値を JST の YYYY/MM/DD HH:mm で表示", () => {
    // JST 14:00 は 05:00Z で保存される。一覧表示は 14:00 でなければならない。
    expect(formatJstDateTime("2026-07-30T05:00:00.000Z")).toBe("2026/07/30 14:00");
    expect(formatJstDateTime(null)).toBe("—");
    expect(formatJstDateTime("bad", "-")).toBe("-");
  });

  it("formatJstDateTimeJa: JST の YYYY年M月D日 HH:mm", () => {
    expect(formatJstDateTimeJa("2026-07-30T05:00:00.000Z")).toBe("2026年7月30日 14:00");
    expect(formatJstDateTimeJa(null)).toBe("");
  });

  it("formatJstDateJa: JST 暦日で日付を表示（深夜帯の日付ずれを防ぐ）", () => {
    // JST 07:00 は前日 22:00Z。UTC の日付部を切ると前日になるが、JST では当日。
    expect(formatJstDateJa("2026-07-29T22:00:00.000Z")).toBe("2026年7月30日");
    // MDX の純日付（YYYY-MM-DD）は同日を維持する。
    expect(formatJstDateJa("2026-07-30")).toBe("2026年7月30日");
    expect(formatJstDateJa("bad", "bad")).toBe("bad");
  });
});
