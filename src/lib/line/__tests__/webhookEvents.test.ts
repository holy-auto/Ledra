/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  recordInboundLineMessage: vi.fn(),
  recordOutboundLineMessage: vi.fn(),
  maybeNotifyInboundMessage: vi.fn(),
  maybeAutoProcessInboundMessage: vi.fn(),
  tryConsumeLineLinkCode: vi.fn(),
  buildLineLinkPrompt: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                line_channel_id: "123",
                line_channel_secret_ciphertext: "enc:s",
                line_channel_access_token_ciphertext: "enc:t",
                line_liff_id: "liff-1",
                line_enabled: true,
              },
            }),
          }),
        }),
      }),
    },
  }),
}));
vi.mock("@/lib/crypto/tenantSecrets", () => ({
  readSecret: async (c: string | null) => (c ? c.replace(/^enc:/, "plain-") : null),
}));
vi.mock("@/lib/line/messageStore", () => ({
  recordInboundLineMessage: mocks.recordInboundLineMessage,
  recordOutboundLineMessage: mocks.recordOutboundLineMessage,
}));
vi.mock("@/lib/line/inboundNotify", () => ({ maybeNotifyInboundMessage: mocks.maybeNotifyInboundMessage }));
vi.mock("@/lib/ai/automation/inboundAuto", () => ({
  maybeAutoProcessInboundMessage: mocks.maybeAutoProcessInboundMessage,
}));
vi.mock("@/lib/line/linkCode", () => ({ tryConsumeLineLinkCode: mocks.tryConsumeLineLinkCode }));
vi.mock("@/lib/line/linkPrompt", () => ({ buildLineLinkPrompt: mocks.buildLineLinkPrompt }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { handleWebhookEvents } from "@/lib/line/client";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "Uabcdef";
const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordInboundLineMessage.mockResolvedValue({ ok: true, id: "m1", customerId: null });
  mocks.recordOutboundLineMessage.mockResolvedValue({ ok: true, id: "m2" });
  mocks.tryConsumeLineLinkCode.mockResolvedValue({ linked: false });
  mocks.buildLineLinkPrompt.mockResolvedValue(null);
  globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })) as any;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("handleWebhookEvents", () => {
  it("records rich-menu postback events as inbound and notifies staff", async () => {
    await handleWebhookEvents(TENANT, [
      { type: "postback", source: { userId: USER, type: "user" }, postback: { data: "action=reserve" }, timestamp: 1 },
    ]);

    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, lineUserId: USER, body: "[メニュー操作] action=reserve" }),
    );
    expect(mocks.maybeNotifyInboundMessage).toHaveBeenCalled();
  });

  it("records non-text messages (sticker) with a placeholder body", async () => {
    await handleWebhookEvents(TENANT, [
      { type: "message", source: { userId: USER, type: "user" }, message: { type: "sticker", id: "s1" } },
    ]);

    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(expect.objectContaining({ body: "[スタンプ]" }));
  });

  it("replies to 来店予約 and records the auto-reply as outbound", async () => {
    await handleWebhookEvents(TENANT, [
      {
        type: "message",
        replyToken: "rt",
        source: { userId: USER, type: "user" },
        message: { type: "text", id: "m1", text: "来店予約" },
      },
    ]);

    const replyCall = (globalThis.fetch as any).mock.calls.find((c: any[]) =>
      String(c[0]).includes("/v2/bot/message/reply"),
    );
    expect(replyCall).toBeTruthy();
    expect(mocks.recordOutboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("liff.line.me/liff-1"), delivered: true }),
    );
  });

  it("records the welcome reply on follow events as outbound", async () => {
    await handleWebhookEvents(TENANT, [{ type: "follow", replyToken: "rt", source: { userId: USER, type: "user" } }]);

    expect(mocks.recordOutboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("友だち追加ありがとうございます"), delivered: true }),
    );
  });
});
