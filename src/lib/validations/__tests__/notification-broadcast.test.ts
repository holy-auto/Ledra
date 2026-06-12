import { describe, it, expect } from "vitest";
import {
  notificationBroadcastCreateSchema,
  notificationBroadcastUpdateSchema,
  CHANNEL_MESSAGE_MAX,
  MESSAGE_ABSOLUTE_MAX,
} from "../notification-broadcast";

// Zod v4 enforces RFC-9562: a real v4 UUID.
const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("notificationBroadcastCreateSchema", () => {
  it("accepts a minimal LINE broadcast and defaults segment to all", () => {
    const r = notificationBroadcastCreateSchema.safeParse({
      name: "6月キャンペーン",
      channel: "line",
      message_text: "こんにちは",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.segment_json).toEqual({ segment_type: "all" });
      expect(r.data.subject).toBeNull();
      expect(r.data.scheduled_at).toBeNull();
    }
  });

  it("rejects empty name and empty message", () => {
    expect(notificationBroadcastCreateSchema.safeParse({ name: "", channel: "sms", message_text: "x" }).success).toBe(
      false,
    );
    expect(
      notificationBroadcastCreateSchema.safeParse({ name: "X", channel: "sms", message_text: "   " }).success,
    ).toBe(false);
  });

  it("rejects an unknown channel", () => {
    const r = notificationBroadcastCreateSchema.safeParse({ name: "X", channel: "fax", message_text: "hi" });
    expect(r.success).toBe(false);
  });

  it("requires subject for email channel", () => {
    const noSubject = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "email",
      message_text: "本文",
    });
    expect(noSubject.success).toBe(false);

    const withSubject = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "email",
      subject: "件名",
      message_text: "本文",
    });
    expect(withSubject.success).toBe(true);
  });

  it("does not require subject for sms/line", () => {
    expect(notificationBroadcastCreateSchema.safeParse({ name: "X", channel: "sms", message_text: "hi" }).success).toBe(
      true,
    );
    expect(
      notificationBroadcastCreateSchema.safeParse({ name: "X", channel: "line", message_text: "hi" }).success,
    ).toBe(true);
  });

  it("enforces the per-channel SMS message limit (160)", () => {
    const overSms = "a".repeat(CHANNEL_MESSAGE_MAX.sms + 1);
    const r = notificationBroadcastCreateSchema.safeParse({ name: "X", channel: "sms", message_text: overSms });
    expect(r.success).toBe(false);

    const atLimit = "a".repeat(CHANNEL_MESSAGE_MAX.sms);
    expect(
      notificationBroadcastCreateSchema.safeParse({ name: "X", channel: "sms", message_text: atLimit }).success,
    ).toBe(true);
  });

  it("enforces the per-channel LINE message limit (500)", () => {
    const overLine = "a".repeat(CHANNEL_MESSAGE_MAX.line + 1);
    const r = notificationBroadcastCreateSchema.safeParse({ name: "X", channel: "line", message_text: overLine });
    expect(r.success).toBe(false);
  });

  it("allows email up to the absolute max (2000)", () => {
    const longEmail = "a".repeat(MESSAGE_ABSOLUTE_MAX);
    const r = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "email",
      subject: "件名",
      message_text: longEmail,
    });
    expect(r.success).toBe(true);
    expect(CHANNEL_MESSAGE_MAX.email).toBe(MESSAGE_ABSOLUTE_MAX);
  });

  it("rejects message over the absolute DB max even for email", () => {
    const tooLong = "a".repeat(MESSAGE_ABSOLUTE_MAX + 1);
    const r = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "email",
      subject: "件名",
      message_text: tooLong,
    });
    expect(r.success).toBe(false);
  });

  it("validates vehicle_type segment requires a maker", () => {
    const bad = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "sms",
      message_text: "hi",
      segment_json: { segment_type: "vehicle_type", filters: { maker: "" } },
    });
    expect(bad.success).toBe(false);

    const good = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "sms",
      message_text: "hi",
      segment_json: { segment_type: "vehicle_type", filters: { maker: "トヨタ" } },
    });
    expect(good.success).toBe(true);
  });

  it("validates no_visit_days segment requires days >= 1", () => {
    const bad = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "sms",
      message_text: "hi",
      segment_json: { segment_type: "no_visit_days", filters: { days: 0 } },
    });
    expect(bad.success).toBe(false);

    const good = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "sms",
      message_text: "hi",
      segment_json: { segment_type: "no_visit_days", filters: { days: 90 } },
    });
    expect(good.success).toBe(true);
  });

  it("normalizes whitespace subject and null scheduled_at to null", () => {
    const r = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "sms",
      subject: "   ",
      message_text: "hi",
      scheduled_at: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.subject).toBeNull();
      expect(r.data.scheduled_at).toBeNull();
    }
  });

  it("accepts an ISO scheduled_at and keeps it", () => {
    const iso = "2026-06-20T09:00:00.000Z";
    const r = notificationBroadcastCreateSchema.safeParse({
      name: "X",
      channel: "sms",
      message_text: "hi",
      scheduled_at: iso,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.scheduled_at).toBe(iso);
  });
});

describe("notificationBroadcastUpdateSchema", () => {
  it("requires a valid UUID id", () => {
    expect(notificationBroadcastUpdateSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(notificationBroadcastUpdateSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  it("accepts a status transition payload", () => {
    const r = notificationBroadcastUpdateSchema.safeParse({ id: VALID_UUID, status: "cancelled" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const r = notificationBroadcastUpdateSchema.safeParse({ id: VALID_UUID, status: "exploded" });
    expect(r.success).toBe(false);
  });

  it("accepts partial field updates without channel (channel is immutable)", () => {
    const r = notificationBroadcastUpdateSchema.safeParse({ id: VALID_UUID, name: "改名", message_text: "更新" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("channel" in r.data).toBe(false);
    }
  });
});
