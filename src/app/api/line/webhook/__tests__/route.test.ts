import { describe, it, expect, vi, beforeEach } from "vitest";

const { handleWebhookEventsMock, verifySignatureMock, afterMock } = vi.hoisted(() => ({
  handleWebhookEventsMock: vi.fn().mockResolvedValue(undefined),
  verifySignatureMock: vi.fn().mockResolvedValue(true),
  afterMock: vi.fn((cb: () => void | Promise<void>) => cb()),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { line_channel_secret_ciphertext: "enc-secret", line_enabled: true },
            }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/crypto/tenantSecrets", () => ({
  readSecret: vi.fn().mockResolvedValue("channel-secret"),
}));

vi.mock("@/lib/webhooks/idempotency", () => ({
  claimWebhookEvent: vi.fn().mockResolvedValue("claimed"),
}));

vi.mock("@/lib/line/client", () => ({
  verifySignature: verifySignatureMock,
  handleWebhookEvents: handleWebhookEventsMock,
}));

import { POST } from "@/app/api/line/webhook/route";

function lineReq(tenantId: string, body: unknown): Request {
  return new Request(`http://localhost/api/line/webhook?tenant_id=${tenantId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "sig" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/line/webhook", () => {
  beforeEach(() => {
    handleWebhookEventsMock.mockClear();
    verifySignatureMock.mockClear();
    afterMock.mockClear();
  });

  it("returns 200 immediately and defers event handling to after()", async () => {
    const events = [{ type: "message", webhookEventId: "evt-1", message: { type: "text", text: "hi" } }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(lineReq("tenant-1", { events }) as any);

    expect(res.status).toBe(200);
    // handleWebhookEvents must run inside after(), not as a bare fire-and-forget
    // promise — otherwise a serverless runtime can kill it once the response
    // is sent, and the customer never gets an auto-reply.
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(handleWebhookEventsMock).toHaveBeenCalledWith("tenant-1", events);
  });

  it("skips handleWebhookEvents when signature verification fails", async () => {
    verifySignatureMock.mockResolvedValueOnce(false);
    const events = [{ type: "message", webhookEventId: "evt-2" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(lineReq("tenant-1", { events }) as any);

    expect(res.status).toBe(401);
    expect(afterMock).not.toHaveBeenCalled();
    expect(handleWebhookEventsMock).not.toHaveBeenCalled();
  });
});
