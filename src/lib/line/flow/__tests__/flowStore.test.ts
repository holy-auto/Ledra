import { describe, it, expect } from "vitest";
import { emptyStore, makeFakeAdmin } from "../../../ai/automation/__tests__/fakeSupabaseAdmin";
import { advanceFlow } from "../flowStore";

const FLOW_ID = "flow-1";

function seedFlow(state: string) {
  return emptyStore({
    line_conversation_flows: [{ id: FLOW_ID, state, context_json: {} }],
  });
}

describe("advanceFlow", () => {
  it("updates the row and returns true when expectState matches", async () => {
    const store = seedFlow("awaiting_schedule_pick");
    const admin = makeFakeAdmin(store);

    const ok = await advanceFlow(
      admin,
      { id: FLOW_ID, context_json: {} },
      { toState: "scheduled", expectState: "awaiting_schedule_pick" },
    );

    expect(ok).toBe(true);
    expect(store.tables.line_conversation_flows[0].state).toBe("scheduled");
  });

  it("returns false and leaves the row untouched when expectState no longer matches (concurrent claim)", async () => {
    // 別リクエストが先に scheduled へ進めた後の状態を模す。
    const store = seedFlow("scheduled");
    const admin = makeFakeAdmin(store);

    const ok = await advanceFlow(
      admin,
      { id: FLOW_ID, context_json: {} },
      { toState: "scheduled", expectState: "awaiting_schedule_pick" },
    );

    expect(ok).toBe(false);
    // state は "scheduled" のまま (二重更新されていない)。
    expect(store.tables.line_conversation_flows[0].state).toBe("scheduled");
  });

  it("returns false for an unknown flow id", async () => {
    const store = seedFlow("awaiting_schedule_pick");
    const admin = makeFakeAdmin(store);

    const ok = await advanceFlow(admin, { id: "no-such-flow", context_json: {} }, { toState: "closed" });
    expect(ok).toBe(false);
  });
});
