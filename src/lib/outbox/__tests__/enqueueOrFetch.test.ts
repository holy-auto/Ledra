import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueOutbox: vi.fn(),
}));

vi.mock("@/lib/outbox/queue", () => ({ enqueueOutbox: mocks.enqueueOutbox }));

import { enqueueOrFetch } from "@/lib/outbox/enqueueOrFetch";

beforeEach(() => {
  mocks.enqueueOutbox.mockReset();
});

function mkResponse(status: number, ok: boolean): Response {
  return { ok, status } as unknown as Response;
}

describe("enqueueOrFetch", () => {
  it("calls fetch directly when online", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mkResponse(200, true));

    const r = await enqueueOrFetch({
      url: "/api/x",
      method: "PUT",
      body: { a: 1 },
      label: "test",
      kind: "reservation_update",
      isOnline: () => true,
    });
    expect(r.queued).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("enqueues when offline without calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mocks.enqueueOutbox.mockResolvedValueOnce({ id: "out-1" });

    const r = await enqueueOrFetch({
      url: "/api/x",
      method: "PUT",
      body: { a: 1 },
      label: "test",
      kind: "reservation_update",
      isOnline: () => false,
    });
    expect(r.queued).toBe(true);
    expect(r.outboxId).toBe("out-1");
    expect(r.status).toBe(202);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/api/x",
        method: "PUT",
        bodyJson: '{"a":1}',
        label: "test",
        kind: "reservation_update",
      }),
    );

    fetchSpy.mockRestore();
  });

  it("falls back to outbox when fetch throws (mid-flight disconnection)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("net down"));
    mocks.enqueueOutbox.mockResolvedValueOnce({ id: "out-2" });

    const r = await enqueueOrFetch({
      url: "/api/x",
      method: "POST",
      body: { hello: "world" },
      label: "test",
      kind: "other",
      isOnline: () => true,
    });
    expect(r.queued).toBe(true);
    expect(r.outboxId).toBe("out-2");
    expect(r.networkError).toBe("net down");
    expect(mocks.enqueueOutbox).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it("passes through HTTP errors when online (not queued)", async () => {
    const errorResponse = mkResponse(500, false);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(errorResponse);

    const r = await enqueueOrFetch({
      url: "/api/x",
      method: "PUT",
      body: { a: 1 },
      label: "test",
      kind: "reservation_update",
      isOnline: () => true,
    });
    expect(r.queued).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.response).toBe(errorResponse);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("forwards Idempotency-Key header when online", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mkResponse(200, true));

    await enqueueOrFetch({
      url: "/api/admin/certificates",
      method: "POST",
      body: { customer_name: "x" },
      label: "cert create",
      kind: "certificate_create",
      idempotencyKey: "abc-12345678",
      isOnline: () => true,
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("abc-12345678");

    fetchSpy.mockRestore();
  });

  it("persists Idempotency-Key in outbox headers when offline", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mocks.enqueueOutbox.mockResolvedValueOnce({ id: "out-x" });

    await enqueueOrFetch({
      url: "/api/admin/certificates",
      method: "POST",
      body: { customer_name: "x" },
      label: "cert create",
      kind: "certificate_create",
      idempotencyKey: "abc-12345678",
      isOnline: () => false,
    });

    const enqueued = mocks.enqueueOutbox.mock.calls[0][0];
    expect(enqueued.headers).toMatchObject({ "Idempotency-Key": "abc-12345678" });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("omits Content-Type when body is null", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mkResponse(204, true));

    await enqueueOrFetch({
      url: "/api/x/123",
      method: "DELETE",
      label: "delete",
      kind: "other",
      isOnline: () => true,
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();

    fetchSpy.mockRestore();
  });
});
