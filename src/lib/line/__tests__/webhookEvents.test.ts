/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  recordInboundLineMessage: vi.fn(),
  recordOutboundLineMessage: vi.fn(),
  maybeNotifyInboundMessage: vi.fn(),
  maybeAutoProcessInboundMessage: vi.fn(),
  tryConsumeLineLinkCode: vi.fn(),
  buildLineLinkPrompt: vi.fn(),
  fetchAndStoreLineMedia: vi.fn(),
  fetchAndStoreLineSticker: vi.fn(),
  handleVehiclePhotoMessage: vi.fn(),
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
vi.mock("@/lib/line/media", () => ({
  fetchAndStoreLineMedia: mocks.fetchAndStoreLineMedia,
  fetchAndStoreLineSticker: mocks.fetchAndStoreLineSticker,
  LINE_MEDIA_BUCKET: "line-media",
}));
vi.mock("@/lib/ai/automation/vehicleCaptureAuto", () => ({
  handleVehiclePhotoMessage: mocks.handleVehiclePhotoMessage,
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { handleWebhookEvents, sendCustomerLineImage } from "@/lib/line/client";

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

  it("stores inbound images and records the attachment path", async () => {
    mocks.fetchAndStoreLineMedia.mockResolvedValue({ path: `${TENANT}/img1.jpg`, contentType: "image/jpeg" });

    await handleWebhookEvents(TENANT, [
      { type: "message", source: { userId: USER, type: "user" }, message: { type: "image", id: "img1" } },
    ]);

    expect(mocks.fetchAndStoreLineMedia).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, messageId: "img1" }),
    );
    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "[画像]",
        attachmentPath: `${TENANT}/img1.jpg`,
        attachmentContentType: "image/jpeg",
      }),
    );
  });

  it("routes image bytes to the vehicle-photo flow handler and skips the normal inbound record when handled", async () => {
    const buf = new Uint8Array([1, 2, 3]);
    mocks.fetchAndStoreLineMedia.mockResolvedValue({ path: `${TENANT}/img1.jpg`, contentType: "image/jpeg", buf });
    mocks.handleVehiclePhotoMessage.mockResolvedValue(true);

    await handleWebhookEvents(TENANT, [
      { type: "message", source: { userId: USER, type: "user" }, message: { type: "image", id: "img1" } },
    ]);

    expect(mocks.fetchAndStoreLineMedia).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, messageId: "img1", returnBuffer: true }),
    );
    expect(mocks.handleVehiclePhotoMessage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, lineUserId: USER }),
    );
    const passedBuffer = mocks.handleVehiclePhotoMessage.mock.calls[0][0].imageBuffer;
    expect(Buffer.isBuffer(passedBuffer)).toBe(true);
    expect(mocks.recordInboundLineMessage).not.toHaveBeenCalled();
    expect(mocks.maybeNotifyInboundMessage).not.toHaveBeenCalled();
  });

  it("falls back to the normal inbound record when there is no active vehicle-photo flow", async () => {
    mocks.fetchAndStoreLineMedia.mockResolvedValue({
      path: `${TENANT}/img1.jpg`,
      contentType: "image/jpeg",
      buf: new Uint8Array([1]),
    });
    mocks.handleVehiclePhotoMessage.mockResolvedValue(false);

    await handleWebhookEvents(TENANT, [
      { type: "message", source: { userId: USER, type: "user" }, message: { type: "image", id: "img1" } },
    ]);

    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: "[画像]", attachmentPath: `${TENANT}/img1.jpg` }),
    );
  });

  it("still records a placeholder when image download fails", async () => {
    mocks.fetchAndStoreLineMedia.mockResolvedValue(null);

    await handleWebhookEvents(TENANT, [
      { type: "message", source: { userId: USER, type: "user" }, message: { type: "image", id: "img2" } },
    ]);

    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: "[画像]", attachmentPath: null }),
    );
  });

  it("stores inbound videos/files via the content API", async () => {
    mocks.fetchAndStoreLineMedia.mockResolvedValue({ path: `${TENANT}/v1.mp4`, contentType: "video/mp4" });

    await handleWebhookEvents(TENANT, [
      { type: "message", source: { userId: USER, type: "user" }, message: { type: "video", id: "v1" } },
      {
        type: "message",
        source: { userId: USER, type: "user" },
        message: { type: "file", id: "f1", fileName: "見積.pdf" },
      },
    ]);

    expect(mocks.fetchAndStoreLineMedia).toHaveBeenCalledTimes(2);
    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: "[ファイル] 見積.pdf" }),
    );
  });

  it("stores sticker images from the public CDN", async () => {
    mocks.fetchAndStoreLineSticker.mockResolvedValue({
      path: `${TENANT}/sticker-52002734.png`,
      contentType: "image/png",
    });

    await handleWebhookEvents(TENANT, [
      {
        type: "message",
        source: { userId: USER, type: "user" },
        message: { type: "sticker", id: "s1", stickerId: "52002734" },
      },
    ]);

    expect(mocks.fetchAndStoreLineSticker).toHaveBeenCalledWith({ tenantId: TENANT, stickerId: "52002734" });
    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentPath: `${TENANT}/sticker-52002734.png` }),
    );
  });

  it("expands location messages into address + map link", async () => {
    await handleWebhookEvents(TENANT, [
      {
        type: "message",
        source: { userId: USER, type: "user" },
        message: { type: "location", id: "l1", address: "東京都千代田区1-1", latitude: 35.68, longitude: 139.76 },
      },
    ]);

    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "[位置情報] 東京都千代田区1-1\nhttps://www.google.com/maps?q=35.68,139.76",
      }),
    );
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

describe("sendCustomerLineImage", () => {
  it("pushes an image message and records outbound with the attachment", async () => {
    const ok = await sendCustomerLineImage({
      tenantId: TENANT,
      lineUserId: USER,
      imageUrl: "https://example.com/x.jpg",
      attachmentPath: `${TENANT}/outbound/x.jpg`,
      attachmentContentType: "image/jpeg",
    });

    expect(ok).toBe(true);
    const pushCall = (globalThis.fetch as any).mock.calls.find((c: any[]) =>
      String(c[0]).includes("/v2/bot/message/push"),
    );
    expect(pushCall).toBeTruthy();
    expect(JSON.parse(pushCall[1].body).messages[0]).toMatchObject({
      type: "image",
      originalContentUrl: "https://example.com/x.jpg",
    });
    expect(mocks.recordOutboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: "[画像]", attachmentPath: `${TENANT}/outbound/x.jpg`, delivered: true }),
    );
  });
});
