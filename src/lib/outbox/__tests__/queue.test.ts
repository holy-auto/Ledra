/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { drainItems } from "@/lib/outbox/queue";
import type { OutboxItem } from "@/lib/outbox/types";

function item(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: "id-1",
    url: "/api/x",
    method: "POST",
    bodyJson: '{"a":1}',
    label: "test",
    kind: "other",
    createdAt: 0,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    ...overrides,
  };
}

function mkResponse(opts: { ok: boolean; status: number; text?: string }): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    text: async () => opts.text ?? "",
  } as unknown as Response;
}

describe("drainItems", () => {
  it("removes successfully-fetched items and counts succeeded", async () => {
    const remove = vi.fn(async () => {});
    const markAttempt = vi.fn(async () => {});
    const doFetch = vi.fn(async () => mkResponse({ ok: true, status: 200 }));
    const items = [item({ id: "a" }), item({ id: "b" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      isOnline: () => true,
    });

    expect(result).toMatchObject({ attempted: 2, succeeded: 2, failed: 0 });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(markAttempt).not.toHaveBeenCalled();
  });

  it("treats 409 as already-processed and removes the item", async () => {
    const remove = vi.fn(async () => {});
    const markAttempt = vi.fn(async () => {});
    const doFetch = vi.fn(async () => mkResponse({ ok: false, status: 409, text: "conflict" }));
    const items = [item({ id: "a" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      isOnline: () => true,
    });

    expect(result.succeeded).toBe(1);
    expect(remove).toHaveBeenCalledWith("a");
    expect(markAttempt).not.toHaveBeenCalled();
  });

  it("marks attempt with HTTP error message on 5xx (keeps item)", async () => {
    const remove = vi.fn(async () => {});
    const markAttempt = vi.fn(async () => {});
    const doFetch = vi.fn(async () => mkResponse({ ok: false, status: 503, text: "boom" }));
    const items = [item({ id: "a" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      isOnline: () => true,
    });

    expect(result).toMatchObject({ attempted: 1, succeeded: 0, failed: 1 });
    expect(remove).not.toHaveBeenCalled();
    expect(markAttempt).toHaveBeenCalledWith("a", expect.stringContaining("HTTP 503"));
  });

  it("catches network errors and records them as markAttempt", async () => {
    const remove = vi.fn(async () => {});
    const markAttempt = vi.fn(async () => {});
    const doFetch = vi.fn(async () => {
      throw new Error("net down");
    });
    const items = [item({ id: "a" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      isOnline: () => true,
    });

    expect(result.failed).toBe(1);
    expect(markAttempt).toHaveBeenCalledWith("a", "net down");
  });

  it("breaks the loop when isOnline() becomes false", async () => {
    let calls = 0;
    const doFetch = vi.fn(async () => mkResponse({ ok: true, status: 200 }));
    const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove: vi.fn(async () => {}),
      markAttempt: vi.fn(async () => {}),
      isOnline: () => {
        calls += 1;
        // first 2 = online; 3rd call = offline
        return calls <= 2;
      },
    });

    expect(result.attempted).toBe(2);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("sends Content-Type header only when body is present", async () => {
    const doFetch = vi.fn(async (_url: unknown, _init?: unknown) => mkResponse({ ok: true, status: 200 }));
    const items = [item({ id: "a", bodyJson: null, method: "DELETE" })];

    await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove: vi.fn(async () => {}),
      markAttempt: vi.fn(async () => {}),
      isOnline: () => true,
    });

    const init = doFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});
