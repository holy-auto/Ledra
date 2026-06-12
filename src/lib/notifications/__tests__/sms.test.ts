import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSms } from "../sms";

describe("notifications/sms sendSms", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.unstubAllEnvs();
    // 既存クライアントが参照する送信元と、本モジュールが補完する送信元を分離して検証するため
    // ここではあえて TWILIO_PHONE_NUMBER を空にし、FROM_NUMBER 側のフォールバックも個別に試す。
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns { ok:false, error:'SMS not configured' } when env is missing", async () => {
    const res = await sendSms("09012345678", "test");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("SMS not configured");
  });

  it("recognizes TWILIO_FROM_NUMBER as a valid sender (config present)", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok_test");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15555550100");

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ sid: "SM_1" }), { status: 201 })) as never;

    const res = await sendSms("09012345678", "本文");
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns ok on a successful Twilio send", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok_test");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15555550100");

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ sid: "SM_1" }), { status: 201 })) as never;

    const res = await sendSms("09012345678", "本文");
    expect(res.ok).toBe(true);
  });

  it("returns { ok:false } with an error on a permanent 4xx Twilio failure", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok_test");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15555550100");

    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ code: 21211, message: "invalid number" }), { status: 400 }),
    ) as never;

    const res = await sendSms("000", "本文");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.error).not.toBe("SMS not configured");
  });

  it("rejects empty destination or body without calling the network", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok_test");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15555550100");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as never;

    const res = await sendSms("  ", "   ");
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
