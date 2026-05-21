import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueOutbox: vi.fn(),
  putOutboxBlob: vi.fn(),
}));

vi.mock("@/lib/outbox/queue", () => ({
  enqueueOutbox: mocks.enqueueOutbox,
  putOutboxBlob: mocks.putOutboxBlob,
}));

import { enqueueOrFetchMultipart } from "@/lib/outbox/enqueueOrFetchMultipart";

beforeEach(() => {
  mocks.enqueueOutbox.mockReset();
  mocks.putOutboxBlob.mockReset();
});

function mkFile(name: string, type: string, content = "x"): File {
  return new File([content], name, { type });
}

function mkResponse(status: number, ok: boolean): Response {
  return { ok, status } as unknown as Response;
}

describe("enqueueOrFetchMultipart", () => {
  it("posts FormData via fetch when online", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mkResponse(200, true));

    const r = await enqueueOrFetchMultipart({
      url: "/api/upload",
      fields: { public_id: "abc" },
      files: [{ fieldName: "photos", file: mkFile("a.jpg", "image/jpeg") }],
      label: "test upload",
      kind: "certificate_image_upload",
      isOnline: () => true,
    });
    expect(r.queued).toBe(false);
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(mocks.putOutboxBlob).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("stores blobs and enqueues when offline", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mocks.putOutboxBlob.mockImplementation(
      async (_blob, _name, _type) => "ref-" + Math.random().toString(36).slice(2, 6),
    );
    mocks.enqueueOutbox.mockResolvedValueOnce({ id: "out-1" });

    const r = await enqueueOrFetchMultipart({
      url: "/api/upload",
      fields: { public_id: "abc" },
      files: [
        { fieldName: "photos", file: mkFile("a.jpg", "image/jpeg") },
        { fieldName: "photos", file: mkFile("b.jpg", "image/jpeg") },
      ],
      label: "test upload",
      kind: "certificate_image_upload",
      isOnline: () => false,
    });
    expect(r.queued).toBe(true);
    expect(r.outboxId).toBe("out-1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.putOutboxBlob).toHaveBeenCalledTimes(2);

    const enqueueArgs = mocks.enqueueOutbox.mock.calls[0][0];
    expect(enqueueArgs.method).toBe("POST");
    expect(enqueueArgs.multipart.fields).toEqual([{ name: "public_id", value: "abc" }]);
    expect(enqueueArgs.multipart.files).toHaveLength(2);
    expect(enqueueArgs.multipart.files[0]).toMatchObject({
      name: "photos",
      fileName: "a.jpg",
      mimeType: "image/jpeg",
    });
    expect(enqueueArgs.multipart.files[0].blobRef).toMatch(/^ref-/);

    fetchSpy.mockRestore();
  });

  it("falls back to outbox when fetch throws mid-flight", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("net down"));
    mocks.putOutboxBlob.mockResolvedValueOnce("ref-1");
    mocks.enqueueOutbox.mockResolvedValueOnce({ id: "out-2" });

    const r = await enqueueOrFetchMultipart({
      url: "/api/upload",
      files: [{ fieldName: "photos", file: mkFile("a.jpg", "image/jpeg") }],
      label: "test",
      kind: "certificate_image_upload",
      isOnline: () => true,
    });
    expect(r.queued).toBe(true);
    expect(r.outboxId).toBe("out-2");
    expect(r.networkError).toBe("net down");

    fetchSpy.mockRestore();
  });

  it("passes through HTTP errors when online (not queued)", async () => {
    const errResp = mkResponse(413, false);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(errResp);

    const r = await enqueueOrFetchMultipart({
      url: "/api/upload",
      files: [{ fieldName: "photos", file: mkFile("a.jpg", "image/jpeg") }],
      label: "test",
      kind: "certificate_image_upload",
      isOnline: () => true,
    });
    expect(r.queued).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(413);
    expect(r.response).toBe(errResp);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
