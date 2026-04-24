import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isResendFailure, sendResendEmail } from "@/lib/email/resendSend";

describe("sendResendEmail", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "noreply@example.test");
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns ok with id on first success", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })) as never;

    const res = await sendResendEmail({ to: "a@b.test", subject: "s", text: "t" });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.id).toBe("msg_1");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("forwards Idempotency-Key header when supplied", async () => {
    let capturedHeaders: Record<string, string> | null = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? null;
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as never;

    await sendResendEmail({ to: "a@b.test", subject: "s", text: "t", idempotencyKey: "evt_123" });

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!["Idempotency-Key"]).toBe("evt_123");
  });

  it("retries 5xx up to retries and eventually fails", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 502 }));
    globalThis.fetch = fetchMock as never;

    const res = await sendResendEmail({ to: "a@b.test", subject: "s", text: "t" }, { retries: 2, baseBackoffMs: 1 });

    expect(isResendFailure(res)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    if (isResendFailure(res)) {
      expect(res.status).toBe(502);
    }
  });

  it("does NOT retry permanent 4xx (except 429)", async () => {
    const fetchMock = vi.fn(async () => new Response("bad input", { status: 422 }));
    globalThis.fetch = fetchMock as never;

    const res = await sendResendEmail({ to: "a@b.test", subject: "s", text: "t" }, { retries: 5, baseBackoffMs: 1 });

    expect(isResendFailure(res)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (isResendFailure(res)) {
      expect(res.status).toBe(422);
    }
  });

  it("retries 429 rate-limits", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      return call < 3
        ? new Response("slow down", { status: 429 })
        : new Response(JSON.stringify({ id: "msg_ok" }), { status: 200 });
    }) as never;

    const res = await sendResendEmail({ to: "a@b.test", subject: "s", text: "t" }, { retries: 3, baseBackoffMs: 1 });

    expect(res.ok).toBe(true);
    expect(call).toBe(3);
  });

  it("retries on network errors", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      if (call < 2) throw new TypeError("network");
      return new Response(JSON.stringify({ id: "msg_ok" }), { status: 200 });
    }) as never;

    const res = await sendResendEmail({ to: "a@b.test", subject: "s", text: "t" }, { retries: 2, baseBackoffMs: 1 });

    expect(res.ok).toBe(true);
    expect(call).toBe(2);
  });

  it("fails immediately when RESEND_API_KEY is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as never;

    const res = await sendResendEmail({ to: "a@b.test", subject: "s", text: "t" });
    expect(isResendFailure(res)).toBe(true);
    if (isResendFailure(res)) expect(res.error).toMatch(/RESEND_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails immediately when RESEND_FROM is missing", async () => {
    vi.stubEnv("RESEND_FROM", "");
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as never;

    const res = await sendResendEmail({ to: "a@b.test", subject: "s", text: "t" });
    expect(isResendFailure(res)).toBe(true);
    if (isResendFailure(res)) expect(res.error).toMatch(/RESEND_FROM/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
