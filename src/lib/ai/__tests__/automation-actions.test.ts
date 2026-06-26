import { describe, it, expect } from "vitest";
import {
  AUTOMATION_ACTIONS,
  isKnownActionKey,
  isNeverAutoAction,
  sanitizeAutoActions,
  RECOMMENDED_AUTOMATION_ACTION_KEYS,
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
  shouldAutoDetectThickness,
  shouldAutoCategorizeAccountingOnIntake,
  shouldAutoCreateDraftCertificate,
  shouldAutoProposeWorkflowOnIntake,
  shouldAutoDraftReorder,
  shouldAutoSummarizeCase,
  shouldAutoClassifyInquiry,
  shouldAutoSuggestAssignee,
  shouldAutoQualityCheck,
  shouldAutoNextAction,
  shouldAutoReconcileDeliveryNote,
  shouldAutoIssueCertificate,
  shouldAutoFinalizeInvoice,
  shouldAutoCharge,
  shouldAutoCreateCustomer,
} from "../automation/orchestrator";

describe("actionCatalog", () => {
  it("ships every action default OFF (opt-in only)", () => {
    for (const a of AUTOMATION_ACTIONS) {
      expect(a.defaultEnabled).toBe(false);
    }
  });

  it("classifies known action keys (all formerly-Wall-3 actions now in catalog)", () => {
    expect(isKnownActionKey("inbound_message.auto_extract")).toBe(true);
    expect(isKnownActionKey("certificate.auto_issue")).toBe(true);
    expect(isKnownActionKey("invoice.auto_send")).toBe(true);
    expect(isKnownActionKey("invoice.auto_finalize")).toBe(true);
    expect(isKnownActionKey("payment.auto_charge")).toBe(true);
    expect(isKnownActionKey("quote.auto_send")).toBe(true);
    expect(isKnownActionKey("customer.auto_create")).toBe(true);
    expect(isKnownActionKey("nope")).toBe(false);
    // isNeverAutoAction is now always false
    expect(isNeverAutoAction("certificate.auto_issue")).toBe(false);
    expect(isNeverAutoAction("invoice.auto_send")).toBe(false);
    expect(isNeverAutoAction("payment.auto_charge")).toBe(false);
  });

  it("sanitizes auto-actions: drops unknown / false, keeps known true (including former Wall-3)", () => {
    const out = sanitizeAutoActions({
      "inbound_message.auto_extract": true,
      "certificate.auto_draft": false, // false は捨てる
      "certificate.auto_issue": true, // formerly Wall-3, now allowed
      "ghost.action": true, // 未知
      garbage: 42,
    });
    expect(out).toEqual({
      "inbound_message.auto_extract": true,
      "certificate.auto_issue": true,
    });
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

  it("formerly Wall-3 actions are now resolvable when opted in", () => {
    const settings = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      autoActions: {
        "certificate.auto_issue": true,
        "invoice.auto_send": true,
        "payment.auto_charge": true,
        "customer.auto_create": true,
      },
    };
    expect(resolveAutoAction(settings, "certificate.auto_issue")).toBe(true);
    expect(resolveAutoAction(settings, "invoice.auto_send")).toBe(true);
    expect(resolveAutoAction(settings, "payment.auto_charge")).toBe(true);
    expect(resolveAutoAction(settings, "customer.auto_create")).toBe(true);
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

  it("does not create for unknown customers when customer.auto_create is off", () => {
    const d = decideInboundCommit(
      enabled,
      { intent: "new_reservation", confidence: 0.9, scheduled_date: "2026-06-01" },
      { knownCustomerId: null },
    );
    expect(d.reason).toBe("unknown_customer");
  });

  it("creates for unknown customers when customer.auto_create is on and name is present", () => {
    const withAutoCreate = {
      ...enabled,
      autoActions: { ...enabled.autoActions, "customer.auto_create": true },
    };
    const d = decideInboundCommit(
      withAutoCreate,
      { intent: "new_reservation", confidence: 0.9, scheduled_date: "2026-06-01", customer_name: "田中太郎" },
      { knownCustomerId: null },
    );
    expect(d).toEqual({ create: true, reason: "ok_with_new_customer" });
  });

  it("rejects unknown customers even with auto_create if name is missing", () => {
    const withAutoCreate = {
      ...enabled,
      autoActions: { ...enabled.autoActions, "customer.auto_create": true },
    };
    const d = decideInboundCommit(
      withAutoCreate,
      { intent: "new_reservation", confidence: 0.9, scheduled_date: "2026-06-01", customer_name: "" },
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

  it("certificate issuance is auto when opted in", () => {
    expect(canAutoIssueCertificate(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(
      canAutoIssueCertificate({
        ...DEFAULT_AI_AUTOMATION_SETTINGS,
        autoActions: { "certificate.auto_issue": true },
      }),
    ).toBe(true);
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
    expect(shouldAutoSendDocument({ ...invoiceOn, enabled: false }, "invoice")).toBe(false);
  });

  it("ungated auto_send keys are now resolvable when opted in", () => {
    const full = {
      ...DEFAULT_AI_AUTOMATION_SETTINGS,
      autoActions: { "invoice.auto_send": true, "quote.auto_send": true },
    };
    expect(resolveAutoAction(full, "invoice.auto_send")).toBe(true);
    expect(resolveAutoAction(full, "quote.auto_send")).toBe(true);
    // shouldAutoSendDocument also resolves ungated keys
    expect(shouldAutoSendDocument(full, "invoice")).toBe(true);
    expect(shouldAutoSendDocument(full, "estimate")).toBe(true);
  });
});

describe("phase-1 auto-actions (thickness / accounting / certificate draft-record)", () => {
  const on = (key: string) => ({ ...DEFAULT_AI_AUTOMATION_SETTINGS, autoActions: { [key]: true } });

  it("every shipped action is still default OFF (incl. new ones)", () => {
    for (const a of AUTOMATION_ACTIONS) expect(a.defaultEnabled).toBe(false);
  });

  it("new action keys are known and NOT wall-3", () => {
    for (const k of [
      "thickness.auto_detect",
      "accounting.auto_categorize_on_intake",
      "certificate.auto_create_draft_record",
    ]) {
      expect(isKnownActionKey(k)).toBe(true);
      expect(isNeverAutoAction(k)).toBe(false);
    }
  });

  it("shouldAutoDetectThickness follows opt-in + master switch", () => {
    expect(shouldAutoDetectThickness(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoDetectThickness(on("thickness.auto_detect"))).toBe(true);
    expect(shouldAutoDetectThickness({ ...on("thickness.auto_detect"), enabled: false })).toBe(false);
  });

  it("shouldAutoCategorizeAccountingOnIntake follows opt-in", () => {
    expect(shouldAutoCategorizeAccountingOnIntake(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoCategorizeAccountingOnIntake(on("accounting.auto_categorize_on_intake"))).toBe(true);
  });

  it("shouldAutoCreateDraftCertificate: opt-in + completed + vehicle, idempotent, never issues", () => {
    const s = on("certificate.auto_create_draft_record");
    expect(shouldAutoCreateDraftCertificate(s, { isCompleted: true, hasVehicle: true })).toBe(true);
    expect(
      shouldAutoCreateDraftCertificate(DEFAULT_AI_AUTOMATION_SETTINGS, { isCompleted: true, hasVehicle: true }),
    ).toBe(false);
    expect(shouldAutoCreateDraftCertificate(s, { isCompleted: true, hasVehicle: false })).toBe(false);
    expect(shouldAutoCreateDraftCertificate(s, { isCompleted: false, hasVehicle: true })).toBe(false);
    expect(
      shouldAutoCreateDraftCertificate(s, { isCompleted: true, hasVehicle: true, alreadyHasCertificate: true }),
    ).toBe(false);
    // issuance is now a separate opt-in action
    expect(isKnownActionKey("certificate.auto_issue")).toBe(true);
  });
});

describe("phase-2 auto-action (workflow proposal on intake)", () => {
  const on = (key: string) => ({ ...DEFAULT_AI_AUTOMATION_SETTINGS, autoActions: { [key]: true } });

  it("workflow.auto_propose_on_intake is known, NOT wall-3, default OFF", () => {
    expect(isKnownActionKey("workflow.auto_propose_on_intake")).toBe(true);
    expect(isNeverAutoAction("workflow.auto_propose_on_intake")).toBe(false);
    const def = AUTOMATION_ACTIONS.find((a) => a.key === "workflow.auto_propose_on_intake");
    expect(def?.defaultEnabled).toBe(false);
  });

  it("shouldAutoProposeWorkflowOnIntake follows opt-in + master switch", () => {
    expect(shouldAutoProposeWorkflowOnIntake(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoProposeWorkflowOnIntake(on("workflow.auto_propose_on_intake"))).toBe(true);
    expect(shouldAutoProposeWorkflowOnIntake({ ...on("workflow.auto_propose_on_intake"), enabled: false })).toBe(false);
  });
});

describe("phase-3 auto-action (auto-draft reorder)", () => {
  const on = (key: string) => ({ ...DEFAULT_AI_AUTOMATION_SETTINGS, autoActions: { [key]: true } });

  it("inventory.auto_draft_reorder is known, NOT wall-3, default OFF", () => {
    expect(isKnownActionKey("inventory.auto_draft_reorder")).toBe(true);
    expect(isNeverAutoAction("inventory.auto_draft_reorder")).toBe(false);
    const def = AUTOMATION_ACTIONS.find((a) => a.key === "inventory.auto_draft_reorder");
    expect(def?.defaultEnabled).toBe(false);
  });

  it("shouldAutoDraftReorder follows opt-in + master switch", () => {
    expect(shouldAutoDraftReorder(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoDraftReorder(on("inventory.auto_draft_reorder"))).toBe(true);
    expect(shouldAutoDraftReorder({ ...on("inventory.auto_draft_reorder"), enabled: false })).toBe(false);
  });

  it("all shipped actions remain default OFF (full catalog)", () => {
    for (const a of AUTOMATION_ACTIONS) expect(a.defaultEnabled).toBe(false);
    // sanity: catalog grew to include all phase 1-3 keys
    const keys = AUTOMATION_ACTIONS.map((a) => a.key);
    for (const k of [
      "thickness.auto_detect",
      "accounting.auto_categorize_on_intake",
      "certificate.auto_create_draft_record",
      "workflow.auto_propose_on_intake",
      "inventory.auto_draft_reorder",
    ]) {
      expect(keys).toContain(k);
    }
  });
});

describe("すぐやる auto-actions (insurer case summary / assignee suggest / inquiry classify)", () => {
  const on = (key: string) => ({ ...DEFAULT_AI_AUTOMATION_SETTINGS, autoActions: { [key]: true } });

  it("new keys are known, NOT wall-3, default OFF", () => {
    for (const k of ["insurer_case.auto_summary", "insurer_case.auto_assign_suggest", "inquiry.auto_classify"]) {
      expect(isKnownActionKey(k)).toBe(true);
      expect(isNeverAutoAction(k)).toBe(false);
      const def = AUTOMATION_ACTIONS.find((a) => a.key === k);
      expect(def?.defaultEnabled).toBe(false);
    }
  });

  it("shouldAutoSummarizeCase follows opt-in + master switch", () => {
    expect(shouldAutoSummarizeCase(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoSummarizeCase(on("insurer_case.auto_summary"))).toBe(true);
    expect(shouldAutoSummarizeCase({ ...on("insurer_case.auto_summary"), enabled: false })).toBe(false);
  });

  it("shouldAutoSuggestAssignee follows opt-in + master switch", () => {
    expect(shouldAutoSuggestAssignee(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoSuggestAssignee(on("insurer_case.auto_assign_suggest"))).toBe(true);
    expect(shouldAutoSuggestAssignee({ ...on("insurer_case.auto_assign_suggest"), enabled: false })).toBe(false);
  });

  it("shouldAutoClassifyInquiry follows opt-in + master switch", () => {
    expect(shouldAutoClassifyInquiry(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoClassifyInquiry(on("inquiry.auto_classify"))).toBe(true);
    expect(shouldAutoClassifyInquiry({ ...on("inquiry.auto_classify"), enabled: false })).toBe(false);
  });

  it("are included in the recommended ('おまかせ') preset", () => {
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("insurer_case.auto_summary")).toBe(true);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("insurer_case.auto_assign_suggest")).toBe(true);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("inquiry.auto_classify")).toBe(true);
  });
});

describe("photo.auto_quality_check auto-action", () => {
  const on = (key: string) => ({ ...DEFAULT_AI_AUTOMATION_SETTINGS, autoActions: { [key]: true } });

  it("is known, NOT wall-3, default OFF, and recommended", () => {
    expect(isKnownActionKey("photo.auto_quality_check")).toBe(true);
    expect(isNeverAutoAction("photo.auto_quality_check")).toBe(false);
    expect(AUTOMATION_ACTIONS.find((a) => a.key === "photo.auto_quality_check")?.defaultEnabled).toBe(false);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("photo.auto_quality_check")).toBe(true);
  });

  it("shouldAutoQualityCheck follows opt-in + master switch", () => {
    expect(shouldAutoQualityCheck(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoQualityCheck(on("photo.auto_quality_check"))).toBe(true);
    expect(shouldAutoQualityCheck({ ...on("photo.auto_quality_check"), enabled: false })).toBe(false);
  });
});

describe("job.auto_next_action auto-action", () => {
  const on = (key: string) => ({ ...DEFAULT_AI_AUTOMATION_SETTINGS, autoActions: { [key]: true } });

  it("is known, NOT wall-3, default OFF, and recommended", () => {
    expect(isKnownActionKey("job.auto_next_action")).toBe(true);
    expect(isNeverAutoAction("job.auto_next_action")).toBe(false);
    expect(AUTOMATION_ACTIONS.find((a) => a.key === "job.auto_next_action")?.defaultEnabled).toBe(false);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("job.auto_next_action")).toBe(true);
  });

  it("shouldAutoNextAction follows opt-in + master switch", () => {
    expect(shouldAutoNextAction(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoNextAction(on("job.auto_next_action"))).toBe(true);
    expect(shouldAutoNextAction({ ...on("job.auto_next_action"), enabled: false })).toBe(false);
  });
});

describe("parts.auto_reconcile_delivery_note auto-action", () => {
  const on = (key: string) => ({ ...DEFAULT_AI_AUTOMATION_SETTINGS, autoActions: { [key]: true } });

  it("is known, NOT wall-3, default OFF, and recommended", () => {
    expect(isKnownActionKey("parts.auto_reconcile_delivery_note")).toBe(true);
    expect(isNeverAutoAction("parts.auto_reconcile_delivery_note")).toBe(false);
    expect(AUTOMATION_ACTIONS.find((a) => a.key === "parts.auto_reconcile_delivery_note")?.defaultEnabled).toBe(false);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("parts.auto_reconcile_delivery_note")).toBe(true);
  });

  it("shouldAutoReconcileDeliveryNote follows opt-in + master switch", () => {
    expect(shouldAutoReconcileDeliveryNote(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoReconcileDeliveryNote(on("parts.auto_reconcile_delivery_note"))).toBe(true);
    expect(shouldAutoReconcileDeliveryNote({ ...on("parts.auto_reconcile_delivery_note"), enabled: false })).toBe(
      false,
    );
  });
});

describe("formerly Wall-3 actions (now opt-in)", () => {
  const on = (key: string) => ({ ...DEFAULT_AI_AUTOMATION_SETTINGS, autoActions: { [key]: true } });

  it("all new action keys are known, in catalog, default OFF, and recommended", () => {
    for (const k of [
      "certificate.auto_issue",
      "invoice.auto_send",
      "invoice.auto_finalize",
      "quote.auto_send",
      "customer.auto_create",
      "payment.auto_charge",
    ]) {
      expect(isKnownActionKey(k)).toBe(true);
      expect(isNeverAutoAction(k)).toBe(false);
      expect(AUTOMATION_ACTIONS.find((a) => a.key === k)?.defaultEnabled).toBe(false);
      expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has(k)).toBe(true);
    }
  });

  it("shouldAutoIssueCertificate requires opt-in + all quality checks", () => {
    const fullCtx = {
      hasDraft: true,
      photoQualityPassed: true,
      tamperingCheckPassed: true,
      hasRequiredFields: true,
      confidence: 0.95,
    };
    expect(shouldAutoIssueCertificate(DEFAULT_AI_AUTOMATION_SETTINGS, fullCtx)).toBe(false);
    expect(shouldAutoIssueCertificate(on("certificate.auto_issue"), fullCtx)).toBe(true);
    // fails when photo quality not passed
    expect(shouldAutoIssueCertificate(on("certificate.auto_issue"), { ...fullCtx, photoQualityPassed: false })).toBe(
      false,
    );
    // fails when confidence below threshold
    expect(shouldAutoIssueCertificate(on("certificate.auto_issue"), { ...fullCtx, confidence: 0.1 })).toBe(false);
    // fails when no draft
    expect(shouldAutoIssueCertificate(on("certificate.auto_issue"), { ...fullCtx, hasDraft: false })).toBe(false);
  });

  it("shouldAutoFinalizeInvoice follows opt-in + master switch", () => {
    expect(shouldAutoFinalizeInvoice(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoFinalizeInvoice(on("invoice.auto_finalize"))).toBe(true);
    expect(shouldAutoFinalizeInvoice({ ...on("invoice.auto_finalize"), enabled: false })).toBe(false);
  });

  it("shouldAutoCharge follows opt-in + master switch", () => {
    expect(shouldAutoCharge(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoCharge(on("payment.auto_charge"))).toBe(true);
    expect(shouldAutoCharge({ ...on("payment.auto_charge"), enabled: false })).toBe(false);
  });

  it("shouldAutoCreateCustomer follows opt-in + master switch", () => {
    expect(shouldAutoCreateCustomer(DEFAULT_AI_AUTOMATION_SETTINGS)).toBe(false);
    expect(shouldAutoCreateCustomer(on("customer.auto_create"))).toBe(true);
    expect(shouldAutoCreateCustomer({ ...on("customer.auto_create"), enabled: false })).toBe(false);
  });
});
