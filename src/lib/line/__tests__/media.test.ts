/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    storage: { from: () => ({ upload: mocks.upload }) },
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { fetchAndStoreLineMedia } from "@/lib/line/media";

const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({ error: null });
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } }),
    ) as any;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchAndStoreLineMedia", () => {
  it("rejects malformed messageIds without any network request (SSRF/path traversal guard)", async () => {
    const out = await fetchAndStoreLineMedia({
      tenantId: "t1",
      accessToken: "tok",
      messageId: "../../../etc/passwd",
    });
    expect(out).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("stores well-formed messageIds under the tenant prefix", async () => {
    const out = await fetchAndStoreLineMedia({ tenantId: "t1", accessToken: "tok", messageId: "12345" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api-data.line.me/v2/bot/message/12345/content",
      expect.anything(),
    );
    expect(out).toEqual({ path: "t1/12345.jpg", contentType: "image/jpeg" });
  });
});
