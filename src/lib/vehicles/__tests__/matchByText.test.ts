import { describe, it, expect } from "vitest";
import { matchVehicleByText } from "../matchByText";

const VEHICLES = [
  { id: "v1", maker: "トヨタ", model: "アルファード", plate_display: "品川300あ1234" },
  { id: "v2", maker: "ホンダ", model: "フリード", plate_display: "品川500い5678" },
];

describe("matchVehicleByText", () => {
  it("matches by model name", () => {
    expect(matchVehicleByText(VEHICLES, "アルファード 2022年式")?.id).toBe("v1");
  });

  it("matches by plate", () => {
    expect(matchVehicleByText(VEHICLES, "品川500い5678のコーティングお願いします")?.id).toBe("v2");
  });

  it("returns null when no vehicle matches", () => {
    expect(matchVehicleByText(VEHICLES, "プリウス")).toBeNull();
  });

  it("returns null (does not guess) when multiple vehicles match", () => {
    const ambiguous = [
      { id: "v1", maker: "トヨタ", model: "アルファード", plate_display: null },
      { id: "v2", maker: "トヨタ", model: "ヴェルファイア", plate_display: null },
    ];
    expect(matchVehicleByText(ambiguous, "トヨタの車です")).toBeNull();
  });

  it("returns null for empty/whitespace-only text", () => {
    expect(matchVehicleByText(VEHICLES, "")).toBeNull();
    expect(matchVehicleByText(VEHICLES, "   ")).toBeNull();
  });

  it("ignores short (<2 char) tokens to avoid noisy single-character matches", () => {
    const withShortToken = [{ id: "v1", maker: "S", model: "M", plate_display: null }];
    expect(matchVehicleByText(withShortToken, "Sクラスの見積り")).toBeNull();
  });
});
