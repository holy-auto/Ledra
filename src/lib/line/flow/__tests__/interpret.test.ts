import { describe, it, expect } from "vitest";
import { interpretReply, parseFlowPostback } from "../interpret";

describe("parseFlowPostback", () => {
  it("parses flow postback data with and without args", () => {
    expect(parseFlowPostback("flow:yes")).toEqual({ event: "yes", arg: undefined });
    expect(parseFlowPostback("flow:slot:2")).toEqual({ event: "slot", arg: "2" });
    expect(parseFlowPostback("flow:option:abc")).toEqual({ event: "option", arg: "abc" });
  });

  it("ignores non-flow postbacks (rich menu etc.)", () => {
    expect(parseFlowPostback("menu:booking")).toBeNull();
    expect(parseFlowPostback("")).toBeNull();
    expect(parseFlowPostback(null)).toBeNull();
  });
});

describe("interpretReply", () => {
  it("maps flow buttons to events regardless of state", () => {
    expect(interpretReply("awaiting_quote_ok", { postbackData: "flow:yes" })).toEqual({ type: "yes" });
    expect(interpretReply("awaiting_quote_ok", { postbackData: "flow:no" })).toEqual({ type: "no" });
    expect(interpretReply("awaiting_schedule_pick", { postbackData: "flow:slot:1" })).toEqual({
      type: "slot_selected",
      index: 1,
    });
    expect(interpretReply("awaiting_option_confirm", { postbackData: "flow:option:0" })).toEqual({
      type: "option_selected",
      index: 0,
    });
    expect(interpretReply("awaiting_option_confirm", { postbackData: "flow:options_none" })).toEqual({
      type: "options_none",
    });
    expect(interpretReply("awaiting_registration", { postbackData: "flow:registered" })).toEqual({
      type: "registered",
    });
    expect(interpretReply("awaiting_quote_ok", { postbackData: "flow:cancel" })).toEqual({ type: "handoff" });
  });

  it("maps the reservation-cancel postbacks (distinct from flow:cancel handoff)", () => {
    expect(interpretReply("awaiting_cancel_pick", { postbackData: "flow:cancel_pick:1" })).toEqual({
      type: "cancel_pick_selected",
      index: 1,
    });
    expect(interpretReply("awaiting_cancel_confirm", { postbackData: "flow:cancel_confirm" })).toEqual({
      type: "cancel_confirmed",
    });
    expect(interpretReply("awaiting_cancel_confirm", { postbackData: "flow:cancel_abort" })).toEqual({
      type: "cancel_aborted",
    });
    // flow:cancel (日程相談への引き継ぎ) はキャンセル確定とは別物のまま。
    expect(interpretReply("awaiting_cancel_confirm", { postbackData: "flow:cancel" })).toEqual({ type: "handoff" });
  });

  it("rejects a malformed cancel_pick index", () => {
    expect(interpretReply("awaiting_cancel_pick", { postbackData: "flow:cancel_pick:abc" })).toBeNull();
    expect(interpretReply("awaiting_cancel_pick", { postbackData: "flow:cancel_pick:-1" })).toBeNull();
    expect(interpretReply("awaiting_cancel_pick", { postbackData: "flow:cancel_pick:" })).toBeNull();
  });

  it("maps the reschedule postbacks (pick / slot)", () => {
    expect(interpretReply("awaiting_reschedule_pick", { postbackData: "flow:reschedule_pick:1" })).toEqual({
      type: "reschedule_pick_selected",
      index: 1,
    });
    expect(interpretReply("awaiting_reschedule_slot", { postbackData: "flow:reschedule_slot:0" })).toEqual({
      type: "reschedule_slot_selected",
      index: 0,
    });
    // flow:cancel (その他の日程を相談する) は日程変更中も handoff のまま。
    expect(interpretReply("awaiting_reschedule_slot", { postbackData: "flow:cancel" })).toEqual({ type: "handoff" });
    // 不正な index は null。
    expect(interpretReply("awaiting_reschedule_slot", { postbackData: "flow:reschedule_slot:abc" })).toBeNull();
  });

  it("falls back to yes/no keywords only in approval states", () => {
    expect(interpretReply("awaiting_quote_ok", { text: "はい、お願いします" })).toEqual({ type: "yes" });
    expect(interpretReply("awaiting_final_ok", { text: "OKです" })).toEqual({ type: "yes" });
    expect(interpretReply("awaiting_quote_ok", { text: "やっぱりキャンセルで" })).toEqual({ type: "no" });
  });

  it("prioritizes NG when a message mixes yes and cancel", () => {
    expect(interpretReply("awaiting_quote_ok", { text: "はい、でもキャンセルします" })).toEqual({ type: "no" });
  });

  it("does not keyword-classify text outside approval states", () => {
    expect(interpretReply("awaiting_quote_detail", { text: "はい" })).toBeNull();
    expect(interpretReply("awaiting_registration", { text: "OK" })).toBeNull();
  });

  it("returns null for unrecognized input", () => {
    expect(interpretReply("awaiting_quote_ok", { text: "うーん検討します" })).toBeNull();
    expect(interpretReply("awaiting_quote_ok", {})).toBeNull();
  });

  it("rejects a non-numeric or negative slot index (malformed/spoofed postback)", () => {
    expect(interpretReply("awaiting_schedule_pick", { postbackData: "flow:slot:abc" })).toBeNull();
    expect(interpretReply("awaiting_schedule_pick", { postbackData: "flow:slot:-1" })).toBeNull();
    expect(interpretReply("awaiting_schedule_pick", { postbackData: "flow:slot:" })).toBeNull();
  });

  it("rejects a non-numeric or negative option index (malformed/spoofed postback)", () => {
    expect(interpretReply("awaiting_option_confirm", { postbackData: "flow:option:abc" })).toBeNull();
    expect(interpretReply("awaiting_option_confirm", { postbackData: "flow:option:-1" })).toBeNull();
    expect(interpretReply("awaiting_option_confirm", { postbackData: "flow:option:" })).toBeNull();
  });
});
