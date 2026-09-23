// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { clearDraft, draftKey, DRAFT_TTL_MS, loadDraft, saveDraft } from "../documentDraftStorage";

describe("documentDraftStorage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a draft and clears it", () => {
    const key = draftKey({});
    saveDraft(key, { formNote: "途中" }, 1000);
    expect(loadDraft(key, 2000)).toEqual({ savedAt: 1000, data: { formNote: "途中" } });
    clearDraft(key);
    expect(loadDraft(key, 2000)).toBeNull();
  });

  it("keeps drafts from different prefill contexts apart", () => {
    saveDraft(draftKey({ reservationId: "r-1" }), { formNote: "A" }, 0);
    expect(loadDraft(draftKey({ reservationId: "r-2" }), 0)).toBeNull();
    expect(loadDraft(draftKey({}), 0)).toBeNull();
  });

  it("drops expired drafts", () => {
    const key = draftKey({});
    saveDraft(key, { formNote: "古い" }, 0);
    expect(loadDraft(key, DRAFT_TTL_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("ignores corrupted storage instead of throwing", () => {
    const key = draftKey({});
    window.localStorage.setItem(key, "{not json");
    expect(loadDraft(key)).toBeNull();
  });
});
