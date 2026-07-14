import { describe, it, expect } from "vitest";
import { nextFlowState, isTerminal, type FlowState } from "../states";

describe("nextFlowState", () => {
  it("advances the happy path: registration → detail → draft → ok → option confirm → final ok → schedule", () => {
    expect(nextFlowState("awaiting_registration", { type: "registered" })).toBe("awaiting_quote_detail");
    expect(nextFlowState("awaiting_quote_detail", { type: "detail_provided" })).toBe("quote_drafted");
    expect(nextFlowState("quote_drafted", { type: "quote_sent" })).toBe("awaiting_quote_ok");
    expect(nextFlowState("awaiting_quote_ok", { type: "yes" })).toBe("awaiting_option_confirm");
    // オプション選択は見積り更新のため一旦 quote_drafted (再送待ち) に戻る。実装
    // (IO層) は再送時に selected_options の有無を見て awaiting_final_ok へ進める
    // (この分岐は context 依存のため純粋な nextFlowState では表現しない)。
    expect(nextFlowState("awaiting_option_confirm", { type: "option_selected", index: 0 })).toBe("quote_drafted");
    expect(nextFlowState("awaiting_final_ok", { type: "yes" })).toBe("awaiting_schedule_pick");
    expect(nextFlowState("awaiting_schedule_pick", { type: "slot_selected", index: 0 })).toBe("scheduled");
  });

  it("skips the final-ok re-confirmation when no options are selected (nothing changed)", () => {
    expect(nextFlowState("awaiting_option_confirm", { type: "options_none" })).toBe("awaiting_schedule_pick");
  });

  it("routes NG at either approval gate to human_takeover (fail-closed)", () => {
    expect(nextFlowState("awaiting_quote_ok", { type: "no" })).toBe("human_takeover");
    expect(nextFlowState("awaiting_final_ok", { type: "no" })).toBe("human_takeover");
  });

  it("routes handoff from any non-terminal state to human_takeover", () => {
    const states: FlowState[] = [
      "awaiting_registration",
      "awaiting_quote_detail",
      "quote_drafted",
      "awaiting_quote_ok",
      "awaiting_option_confirm",
      "awaiting_final_ok",
      "awaiting_schedule_pick",
      "awaiting_vehicle_photo",
    ];
    for (const s of states) {
      expect(nextFlowState(s, { type: "handoff" })).toBe("human_takeover");
    }
  });

  it("closes the vehicle-photo side-flow on photo_received", () => {
    expect(nextFlowState("awaiting_vehicle_photo", { type: "photo_received" })).toBe("closed");
  });

  it("returns null for undefined transitions (event does not match state)", () => {
    expect(nextFlowState("awaiting_quote_detail", { type: "yes" })).toBeNull();
    expect(nextFlowState("awaiting_registration", { type: "slot_selected", index: 0 })).toBeNull();
    expect(nextFlowState("scheduled", { type: "yes" })).toBeNull();
  });

  it("never transitions out of a terminal state", () => {
    for (const s of ["closed", "expired", "human_takeover"] as FlowState[]) {
      expect(isTerminal(s)).toBe(true);
      expect(nextFlowState(s, { type: "handoff" })).toBeNull();
      expect(nextFlowState(s, { type: "yes" })).toBeNull();
    }
  });
});
