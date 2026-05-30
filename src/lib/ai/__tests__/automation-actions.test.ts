import { describe, it, expect } from "vitest";
import {
  AUTOMATION_ACTIONS,
  isKnownActionKey,
  isNeverAutoAction,
  sanitizeAutoActions,
} from "../automation/actionCatalog";
import { DEFAULT_AI_AUTOMATION_SETTINGS, resolveAutoAction } from "../automation/policy";
import {
  canAutoIssueCertificate,
  decideInboundCommit,
  isValidYmd,
  shouldAutoAnalyzeReview,
  shouldAutoDraftCertificate,
  shouldAutoExtractInbound,
  shouldAutoSendDocument,
} from "../automation/orchestrator";

describe("actionCatalog", () => {
  it("ships every action default OFF (opt-in only)", () => {
    for (const a of AUTOMATION_ACTIONS) {
      expect(a.defaultEnabled).toBe(false);
    }
  });

  it("classifies known / never-auto action keys", () => {
    expect(isKnownActionKey("inbound_message.auto_extract")).toBe(true);
    expect(isKnownActionKey("certificate.auto_issue")).toBe(false); // 壁3 はカタログに無い
    expect(isKnownActionKey("nope")).toBe(false);
    expect(isNeverAutoAction("certificate.auto_issue")).toBe(true);
    expect(isNeverAutoAction("invoice.auto_send")).toBe(true);
    expect(isNeverAutoAction("payment.auto_charge")).toBe(true);
    expect(isNeverAutoAction("inbound_message.auto_extract")).toBe(false);
  });

  it("sanitizes auto-actions: drops unknown / false / 壁3, keeps known true", () => {
    const out = sanitizeAutoActions({
      "inbound_message.auto_extract": true,
      "certificate.auto_draft": false, // false は捨てる
      "certificate.auto_issue": true, // 壁3 は捨てる
      "ghost.action": true, // 未知
      garbage: 42,
    });
    expect(out).toEqual({ "inbound_message.auto_extract": true });
  });

  it("sanitizes non-object input to empty", () => {
    expect(sanitizeAutoActions(null)).toEqual({});
    expect(sanitizeAutoActions(["x"])).toEqual({});
    expect(sanitizeAutoActions("auto")).toEqual({});
  });
});

describe("resolveAutoAction", () => {
  it("is false by default (nothing opted in)", () => {
    expect(resolveAutoAction(DEFAULT_AI_AUTOMATION_SETTINGS, "inbound_message.auto_extract")).toBe(false);
  });

  it("is true when enabled + opted in + known", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      autoActions: { "inbound_message.auto_extract": true },
    };
    expect(resolveAutoAction(settings, "inbound_message.auto_extract")).toBe(true);
  });

  it("is false when AI globally disabled", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      enabled: false,
      autoActions: { "inbound_message.auto_extract": true },
    };
    expect(resolveAutoAction(settings, "inbound_message.auto_extract")).toBe(false);
  });

  it("壁3: never returns true even if the DB somehow stored it true", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      autoActions: {
        "certificate.auto_issue": true,
        "invoice.auto_send": true,
        "payment.auto_charge": true,
      },
    };
    expect(resolveAutoAction(settings, "certificate.auto_issue")).toBe(false);
    expect(resolveAutoAction(settings, "invoice.auto_send")).toBe(false);
    expect(resolveAutoAction(settings, "payment.auto_charge")).toBe(false);
  });
});

describe("isValidYmd", () => {
  it("accepts real calendar dates", () => {
    expect(isValidYmd("2026-05-29")).toBe(true);
    expect(isValidYmd("2024-02-29")).toBe(true); // 閏年
  });
  it("rejects malformed / impossible dates", () => {
    expect(isValidYmd("2026-13-01")).toBe(false);
    expect(isValidYmd("2026-02-30")).toBe(false);
    expect(isValidYmd("明日")).toBe(false);
    expect(isValidYmd(undefined)).toBe(false);
    expect(isValidYmd("2026/05/29")).toBe(false);
  });
});

describe("shouldAutoExtractInbound", () => {
  it("follows the opt-in flag", () => {
    expect(shouldAutoExtractInbound(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(
      shouldAutoExtractInbound({
        ...DEFAULT_AI_AUTOMATION_SETTINGS,
        autoActions: { "inbound_message.auto_extract": true },
      }),
    ).toBe(true);
  });
});

describe("shouldAutoAnalyzeReview", () => {
  it("follows the opt-in flag", () => {
    expect(shouldAutoAnalyzeReview(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(
      shouldAutoAnalyzeReview({
        ...DEFAULT_AI_AUTOMATION_SETTINGS,
        autoActions: { "review.auto_analyze": true },
      }),
    ).toBe(true);
  });

  it("is gated by the global master switch", () => {
    expect(
      shouldAutoAnalyzeReview({
        ...DEFAULT_AI_AUTOMATION_SETTINGS,
        enabled: false,
        autoActions: { "review.auto_analyze": true },
      }),
    ).toBe(false);
  });
});

describe("decideInboundCommit", () => {
  const enabled = {
    ...DEFAULT_AI_AUTOMATION_SETTINGS,
    confidenceThreshold: 0.5,
    autoActions: { "inbound_message.auto_create_reservation": true },
  };
  const ctx = { knownCustomerId: "cust-1" };

  it("does not create when the action is not opted in", () => {
    const d = decideInboundCommit(
      DEFAULT_AI_AUTOMATION_SETTINGS,
      { intent: "new_reservation", confidence: 0.9, scheduled_date: "2026-06-01" },
      ctx,
    );
    expect(d).toEqual({ create: false, reason: "auto_create_off" });
  });

  it("does not create for non-new intents", () => {
    const d = decideInboundCommit(
      enabled,
      { intent: "inquiry_only", confidence: 0.9, scheduled_date: "2026-06-01" },
      ctx,
    );
    expect(d.create).toBe(false);
    expect(d.reason).toBe("intent_not_new");
  });

  it("does not create on low confidence", () => {
    const d = decideInboundCommit(
      enabled,
      { intent: "new_reservation", confidence: 0.3, scheduled_date: "2026-06-01" },
      ctx,
    );
    expect(d.reason).toBe("low_confidence");
  });

  it("壁3: does not create for unknown customers (no auto identity creation)", () => {
    const d = decideInboundCommit(
      enabled,
      { intent: "new_reservation", confidence: 0.9, scheduled_date: "2026-06-01" },
      { knownCustomerId: null },
    );
    expect(d.reason).toBe("unknown_customer");
  });

  it("does not create without a valid concrete date", () => {
    const d = decideInboundCommit(enabled, { intent: "new_reservation", confidence: 0.9, scheduled_date: "明日" }, ctx);
    expect(d.reason).toBe("no_valid_date");
  });

  it("creates when everything lines up", () => {
    const d = decideInboundCommit(
      enabled,
      { intent: "new_reservation", confidence: 0.9, scheduled_date: "2026-06-01" },
      ctx,
    );
    expect(d).toEqual({ create: true, reason: "ok" });
  });
});

describe("certificate auto-draft / auto-issue", () => {
  const draftOn = {
    ...DEFAULT_AI_AUTOMATION_SETTINGS,
    autoActions: { "certificate.auto_draft": true },
  };

  it("auto-drafts only when completed + has vehicle + not already drafted", () => {
    expect(shouldAutoDraftCertificate(draftOn, { isCompleted: true, hasVehicle: true })).toBe(true);
    // 未完了 / 車両なし → false
    expect(shouldAutoDraftCertificate(draftOn, { isCompleted: false, hasVehicle: true })).toBe(false);
    expect(shouldAutoDraftCertificate(draftOn, { isCompleted: true, hasVehicle: false })).toBe(false);
    // 既に下書き済みなら上書きしない
    expect(shouldAutoDraftCertificate(draftOn, { isCompleted: true, hasVehicle: true, alreadyDrafted: true })).toBe(
      false,
    );
    // opt-in していなければ false
    expect(shouldAutoDraftCertificate(DEFAULT_AI_AUTOMATION_SETTINGS, { isCompleted: true, hasVehicle: true })).toBe(
      false,
    );
  });

  it("壁3: certificate issuance is never auto", () => {
    expect(canAutoIssueCertificate(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(
      canAutoIssueCertificate({
        ...DEFAULT_AI_AUTOMATION_SETTINGS,
        autoActions: { "certificate.auto_issue": true },
      }),
    ).toBe(false);
  });
});

describe("shouldAutoSendDocument (確定→自動送付)", () => {
  const invoiceOn = {
    ...DEFAULT_AI_AUTOMATION_SETTINGS,
    autoActions: { "invoice.auto_send_on_confirm": true },
  };
  const quoteOn = {
    ...DEFAULT_AI_AUTOMATION_SETTINGS,
    autoActions: { "quote.auto_send_on_confirm": true },
  };

  it("auto-sends invoices (incl. consolidated) only when opted in", () => {
    expect(shouldAutoSendDocument(invoiceOn, "invoice")).toBe(true);
    expect(shouldAutoSendDocument(invoiceOn, "consolidated_invoice")).toBe(true);
    // 見積の opt-in は請求書には効かない
    expect(shouldAutoSendDocument(invoiceOn, "estimate")).toBe(false);
    // opt-in 無しは false
    expect(shouldAutoSendDocument(DEFAULT_AI_AUTOMATION_SETTINGS, "invoice")).toBe(false);
  });

  it("auto-sends quotes only when opted in", () => {
    expect(shouldAutoSendDocument(quoteOn, "estimate")).toBe(true);
    expect(shouldAutoSendDocument(quoteOn, "invoice")).toBe(false);
    expect(shouldAutoSendDocument(DEFAULT_AI_AUTOMATION_SETTINGS, "estimate")).toBe(false);
  });

  it("returns false for unrelated doc types", () => {
    expect(shouldAutoSendDocument(invoiceOn, "receipt")).toBe(false);
    expect(shouldAutoSendDocument(quoteOn, "delivery_note")).toBe(false);
  });

  it("is gated by the global master switch", () => {
    expect(
      shouldAutoSendDocument({ ...invoiceOn, enabled: false }, "invoice"),
    ).toBe(false);
  });

  it("壁3: ungated auto_send keys are still never auto", () => {
    const sneaky = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      autoActions: { "invoice.auto_send": true, "quote.auto_send": true },
    };
    expect(resolveAutoAction(sneaky, "invoice.auto_send")).toBe(false);
    expect(resolveAutoAction(sneaky, "quote.auto_send")).toBe(false);
  });
});
