import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail } from "../email";

describe("notifications/email sendEmail", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.NOTIFICATION_FROM_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_FROM;
    delete process.env.SENDGRID_FROM;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns { ok:false, error:'Email not configured' } when no ESP is set", async () => {
    const res = await sendEmail("a@b.test", "件名", "本文");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Email not configured");
  });

  it("sends via Resend and uses NOTIFICATION_FROM_EMAIL as the from address", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("NOTIFICATION_FROM_EMAIL", "shop@example.test");

    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as never;

    const res = await sendEmail("a@b.test", "件名", "本文");
    expect(res.ok).toBe(true);
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.from).toBe("shop@example.test");
    expect(capturedBody!.to).toBe("a@b.test");
    expect(capturedBody!.subject).toBe("件名");
  });

  it("rejects empty subject/body without sending", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("NOTIFICATION_FROM_EMAIL", "shop@example.test");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as never;

    const res = await sendEmail("a@b.test", "  ", "  ");
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to RESEND_FROM when NOTIFICATION_FROM_EMAIL is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM", "fallback@example.test");

    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as never;

    const res = await sendEmail("a@b.test", "件名", "本文");
    expect(res.ok).toBe(true);
    expect(capturedBody!.from).toBe("fallback@example.test");
  });
});
