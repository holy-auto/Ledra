import { describe, it, expect, vi } from "vitest";
import { backoffSeconds, processOutboxBatch, enqueueOutboxEvent } from "@/lib/outbox";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

function makeAdmin(rows: Array<Record<string, unknown>>, opts: { claim?: Array<{ id: string }> } = {}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  let inserted: Record<string, unknown> | null = null;
  // in_flight claim (`.update().eq("id").eq("status").select("id")`) の戻り行
  const claimRows = opts.claim ?? [{ id: "claimed" }];

  const builder = (table: string) => {
    const state = { selectCols: "", filters: [] as Array<[string, unknown]>, orderField: "", limit: 0 };
    const chain: Record<string, unknown> = {
      select(cols: string) {
        state.selectCols = cols;
        return chain;
      },
      eq(col: string, val: unknown) {
        state.filters.push([col, val]);
        return chain;
      },
      lte() {
        return chain;
      },
      order(field: string) {
        state.orderField = field;
        return chain;
      },
      limit(n: number) {
        state.limit = n;
        return Promise.resolve({ data: rows, error: null });
      },
      insert(doc: Record<string, unknown>) {
        inserted = doc;
        return {
          select: () => ({ single: () => Promise.resolve({ data: { id: "new-id" }, error: null }) }),
        };
      },
      update(patch: Record<string, unknown>) {
        // eq("id", ...) の update だけ記録する（stale-in_flight リセットは
        // eq("status", "in_flight").lte(...) なので対象外）。
        const updateChain: Record<string, unknown> = {
          eq(col: string, val: unknown) {
            if (col === "id") updates.push({ id: String(val), patch });
            return updateChain;
          },
          lte: () => Promise.resolve({ error: null }),
          select: () => Promise.resolve({ data: claimRows, error: null }),
        };
        return updateChain;
      },
    };
    return chain;
  };
  return {
    admin: { from: builder } as unknown as Parameters<typeof processOutboxBatch>[0],
    updates,
    getInserted: () => inserted,
  };
}

describe("backoffSeconds", () => {
  it("clamps low attempts to 30s", () => {
    expect(backoffSeconds(0)).toBe(30);
    expect(backoffSeconds(1)).toBe(30);
  });
  it("escalates with attempts", () => {
    expect(backoffSeconds(2)).toBe(120);
    expect(backoffSeconds(3)).toBe(600);
    expect(backoffSeconds(4)).toBe(1800);
  });
  it("plateaus past the table", () => {
    expect(backoffSeconds(99)).toBe(28800);
  });
});

describe("enqueueOutboxEvent", () => {
  it("inserts a row with the provided fields", async () => {
    const { admin, getInserted } = makeAdmin([]);
    const r = await enqueueOutboxEvent(admin, {
      tenantId: "t1",
      topic: "agent.approved",
      aggregateId: "agent-1",
      payload: { foo: "bar" },
    });
    expect(r.ok).toBe(true);
    const inserted = getInserted();
    expect(inserted).toMatchObject({
      tenant_id: "t1",
      topic: "agent.approved",
      aggregate_id: "agent-1",
      payload: { foo: "bar" },
    });
  });
});

describe("processOutboxBatch", () => {
  it("marks delivered on dispatcher success", async () => {
    const rows = [
      { id: "e1", tenant_id: "t", topic: "demo", payload: {}, aggregate_id: null, attempts: 0, status: "pending" },
    ];
    const { admin, updates } = makeAdmin(rows);
    const dispatcher = vi.fn().mockResolvedValue({ ok: true });

    const result = await processOutboxBatch(admin, { demo: dispatcher }, { batchSize: 10 });
    expect(result).toEqual({ processed: 1, delivered: 1, errored: 0, dead: 0 });
    expect(dispatcher).toHaveBeenCalledOnce();
    // Two updates: first to in_flight, second to delivered.
    expect(updates.map((u) => u.patch.status)).toEqual(["in_flight", "delivered"]);
  });

  it("retries with backoff when dispatcher fails", async () => {
    const rows = [
      { id: "e2", tenant_id: "t", topic: "demo", payload: {}, aggregate_id: null, attempts: 0, status: "pending" },
    ];
    const { admin, updates } = makeAdmin(rows);
    const dispatcher = vi.fn().mockResolvedValue({ ok: false, error: "504 timeout" });

    const result = await processOutboxBatch(admin, { demo: dispatcher });
    expect(result).toEqual({ processed: 1, delivered: 0, errored: 1, dead: 0 });
    const last = updates[updates.length - 1].patch as { status: string; attempts: number; last_error: string };
    expect(last.status).toBe("pending");
    expect(last.attempts).toBe(1);
    expect(last.last_error).toBe("504 timeout");
  });

  it("moves to dead_letter after maxAttempts", async () => {
    const rows = [
      { id: "e3", tenant_id: "t", topic: "demo", payload: {}, aggregate_id: null, attempts: 7, status: "pending" },
    ];
    const { admin, updates } = makeAdmin(rows);
    const dispatcher = vi.fn().mockResolvedValue({ ok: false, error: "fatal" });

    const result = await processOutboxBatch(admin, { demo: dispatcher }, { maxAttempts: 8 });
    expect(result).toEqual({ processed: 1, delivered: 0, errored: 0, dead: 1 });
    const last = updates[updates.length - 1].patch as { status: string };
    expect(last.status).toBe("dead_letter");
  });

  it("treats a dispatcher throw like a failure and schedules a retry", async () => {
    const rows = [
      { id: "e5", tenant_id: "t", topic: "demo", payload: {}, aggregate_id: null, attempts: 0, status: "pending" },
    ];
    const { admin, updates } = makeAdmin(rows);
    const dispatcher = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await processOutboxBatch(admin, { demo: dispatcher });
    expect(result).toEqual({ processed: 1, delivered: 0, errored: 1, dead: 0 });
    const last = updates[updates.length - 1].patch as { status: string; last_error: string };
    expect(last.status).toBe("pending");
    expect(last.last_error).toBe("boom");
  });

  it("skips the row when another worker already claimed it", async () => {
    const rows = [
      { id: "e6", tenant_id: "t", topic: "demo", payload: {}, aggregate_id: null, attempts: 0, status: "pending" },
    ];
    const { admin, updates } = makeAdmin(rows, { claim: [] });
    const dispatcher = vi.fn().mockResolvedValue({ ok: true });

    const result = await processOutboxBatch(admin, { demo: dispatcher });
    expect(dispatcher).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, delivered: 0, errored: 0, dead: 0 });
    // claim を試みた update だけが記録され、delivered 等は走らない
    expect(updates.map((u) => u.patch.status)).toEqual(["in_flight"]);
  });

  it("warns and skips events whose topic has no dispatcher", async () => {
    const rows = [
      { id: "e4", tenant_id: "t", topic: "unknown", payload: {}, aggregate_id: null, attempts: 0, status: "pending" },
    ];
    const { admin, updates } = makeAdmin(rows);
    const result = await processOutboxBatch(admin, {});
    expect(result.processed).toBe(1);
    expect(result.delivered).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
