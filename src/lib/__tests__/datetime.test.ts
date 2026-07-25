import { describe, it, expect } from "vitest";
import { jstLocalInputToUtcIso, utcIsoToJstLocalInput } from "../datetime";

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
