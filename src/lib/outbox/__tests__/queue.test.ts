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
    const markBlocked = vi.fn(async () => {});
    const doFetch = vi.fn(async () => mkResponse({ ok: true, status: 200 }));
    const items = [item({ id: "a" }), item({ id: "b" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      markBlocked,
      isOnline: () => true,
    });

    expect(result).toMatchObject({ attempted: 2, succeeded: 2, failed: 0 });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(markAttempt).not.toHaveBeenCalled();
  });

  it("treats 409 as already-processed and removes the item", async () => {
    const remove = vi.fn(async () => {});
    const markAttempt = vi.fn(async () => {});
    const markBlocked = vi.fn(async () => {});
    const doFetch = vi.fn(async () => mkResponse({ ok: false, status: 409, text: "conflict" }));
    const items = [item({ id: "a" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      markBlocked,
      isOnline: () => true,
    });

    expect(result.succeeded).toBe(1);
    expect(remove).toHaveBeenCalledWith("a");
    expect(markAttempt).not.toHaveBeenCalled();
  });

  it("marks attempt with HTTP error message on 5xx (keeps item)", async () => {
    const remove = vi.fn(async () => {});
    const markAttempt = vi.fn(async () => {});
    const markBlocked = vi.fn(async () => {});
    const doFetch = vi.fn(async () => mkResponse({ ok: false, status: 503, text: "boom" }));
    const items = [item({ id: "a" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      markBlocked,
      isOnline: () => true,
    });

    expect(result).toMatchObject({ attempted: 1, succeeded: 0, failed: 1 });
    expect(remove).not.toHaveBeenCalled();
    expect(markAttempt).toHaveBeenCalledWith("a", expect.stringContaining("HTTP 503"));
  });

  it("catches network errors and records them as markAttempt", async () => {
    const remove = vi.fn(async () => {});
    const markAttempt = vi.fn(async () => {});
    const markBlocked = vi.fn(async () => {});
    const doFetch = vi.fn(async () => {
      throw new Error("net down");
    });
    const items = [item({ id: "a" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      markBlocked,
      isOnline: () => true,
    });

    expect(result.failed).toBe(1);
    expect(markAttempt).toHaveBeenCalledWith("a", "net down");
  });

  it("blocks instead of retrying when the request itself is rejected (400)", async () => {
    // 必須項目が増えた後に、それを持たない古いアイテムが残っているケース。
    // 何度送っても 400 のままなので、markAttempt で無限に積み直してはいけない。
    const remove = vi.fn(async () => {});
    const markAttempt = vi.fn(async () => {});
    const markBlocked = vi.fn(async () => {});
    const doFetch = vi.fn(async () => mkResponse({ ok: false, status: 400, text: "mileage_required" }));

    const result = await drainItems([item({ id: "a" })], {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt,
      markBlocked,
      isOnline: () => true,
    });

    expect(result).toMatchObject({ attempted: 1, succeeded: 0, failed: 0, blocked: 1 });
    expect(markBlocked).toHaveBeenCalledWith("a", expect.stringContaining("mileage_required"));
    expect(markAttempt).not.toHaveBeenCalled();
    // 利用者が内容を確認して取り消せるよう、勝手に消さない
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps retrying statuses that can recover (401 / 429 / 5xx)", async () => {
    for (const status of [401, 403, 408, 429, 500, 503]) {
      const markAttempt = vi.fn(async () => {});
      const markBlocked = vi.fn(async () => {});
      const doFetch = vi.fn(async () => mkResponse({ ok: false, status, text: "later" }));

      const result = await drainItems([item({ id: "a" })], {
        doFetch: doFetch as unknown as typeof fetch,
        remove: vi.fn(async () => {}),
        markAttempt,
        markBlocked,
        isOnline: () => true,
      });

      expect(result, `status ${status}`).toMatchObject({ failed: 1, blocked: 0 });
      expect(markBlocked, `status ${status}`).not.toHaveBeenCalled();
      expect(markAttempt, `status ${status}`).toHaveBeenCalled();
    }
  });

  it("skips already-blocked items so they cannot starve the ones behind them", async () => {
    const remove = vi.fn(async () => {});
    const doFetch = vi.fn(async () => mkResponse({ ok: true, status: 200 }));
    const items = [item({ id: "blocked", blockedAt: 1 }), item({ id: "fresh" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt: vi.fn(async () => {}),
      markBlocked: vi.fn(async () => {}),
      isOnline: () => true,
    });

    expect(result).toMatchObject({ attempted: 1, succeeded: 1 });
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledExactlyOnceWith("fresh");
  });

  it("breaks the loop when isOnline() becomes false", async () => {
    let calls = 0;
    const doFetch = vi.fn(async () => mkResponse({ ok: true, status: 200 }));
    const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];

    const result = await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove: vi.fn(async () => {}),
      markAttempt: vi.fn(async () => {}),
      markBlocked: vi.fn(async () => {}),
      isOnline: () => {
        calls += 1;
        // first 2 = online; 3rd call = offline
        return calls <= 2;
      },
    });

    expect(result.attempted).toBe(2);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("rebuilds FormData for multipart items using resolveBlob", async () => {
    const remove = vi.fn(async () => {});
    const doFetch = vi.fn(async (_url: unknown, _init?: unknown) => mkResponse({ ok: true, status: 201 }));
    const resolveBlob = vi.fn(async (refId: string) => ({
      blob: new Blob(["x"], { type: "image/jpeg" }),
      fileName: refId + ".jpg",
      mimeType: "image/jpeg",
    }));

    const multipartItem = item({
      id: "mp-1",
      url: "/api/upload",
      method: "POST",
      bodyJson: null,
      multipart: {
        fields: [{ name: "public_id", value: "abc" }],
        files: [{ name: "photos", blobRef: "ref-1", fileName: "a.jpg", mimeType: "image/jpeg" }],
      },
    });

    const result = await drainItems([multipartItem], {
      doFetch: doFetch as unknown as typeof fetch,
      remove,
      markAttempt: vi.fn(async () => {}),
      markBlocked: vi.fn(async () => {}),
      isOnline: () => true,
      resolveBlob,
    });

    expect(result.succeeded).toBe(1);
    expect(remove).toHaveBeenCalledWith("mp-1");
    const init = doFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    // multipart リクエストでは Content-Type を手動セットしてはいけない (boundary が壊れる)
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(resolveBlob).toHaveBeenCalledWith("ref-1");
  });

  it("marks attempt when multipart blob is missing", async () => {
    const markAttempt = vi.fn(async () => {});
    const markBlocked = vi.fn(async () => {});
    const doFetch = vi.fn();
    const resolveBlob = vi.fn(async () => null);

    const multipartItem = item({
      id: "mp-bad",
      url: "/api/upload",
      method: "POST",
      bodyJson: null,
      multipart: {
        fields: [],
        files: [{ name: "photos", blobRef: "ref-missing", fileName: "x.jpg", mimeType: "image/jpeg" }],
      },
    });

    const result = await drainItems([multipartItem], {
      doFetch: doFetch as unknown as typeof fetch,
      remove: vi.fn(async () => {}),
      markAttempt,
      markBlocked,
      isOnline: () => true,
      resolveBlob,
    });
    expect(result.failed).toBe(1);
    expect(doFetch).not.toHaveBeenCalled();
    expect(markAttempt).toHaveBeenCalledWith("mp-bad", expect.stringContaining("blob missing"));
  });

  it("sends Content-Type header only when body is present", async () => {
    const doFetch = vi.fn(async (_url: unknown, _init?: unknown) => mkResponse({ ok: true, status: 200 }));
    const items = [item({ id: "a", bodyJson: null, method: "DELETE" })];

    await drainItems(items, {
      doFetch: doFetch as unknown as typeof fetch,
      remove: vi.fn(async () => {}),
      markAttempt: vi.fn(async () => {}),
      markBlocked: vi.fn(async () => {}),
      isOnline: () => true,
    });

    const init = doFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});
