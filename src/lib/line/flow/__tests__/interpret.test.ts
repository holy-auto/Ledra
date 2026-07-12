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
    expect(interpretReply("awaiting_option_confirm", { postbackData: "flow:option:x" })).toEqual({
      type: "option_selected",
    });
    expect(interpretReply("awaiting_registration", { postbackData: "flow:registered" })).toEqual({
      type: "registered",
    });
    expect(interpretReply("awaiting_quote_ok", { postbackData: "flow:cancel" })).toEqual({ type: "handoff" });
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
});
