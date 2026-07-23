import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock, notifySlackMock, createServiceRoleAdminMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  notifySlackMock: vi.fn(),
  createServiceRoleAdminMock: vi.fn(),
}));

vi.mock("@/lib/email/sendEmail", () => ({ sendEmail: (...args: unknown[]) => sendEmailMock(...args) }));
vi.mock("@/lib/slack", () => ({ notifySlack: (...args: unknown[]) => notifySlackMock(...args) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  maskEmail: (e: string) => e,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: (...args: unknown[]) => createServiceRoleAdminMock(...args),
}));
// 暗号化/復号自体は tenantSecrets 側の既存テストで担保済み。ここでは
// bookingNotify の分岐ロジックだけを見たいので pass-through にする。
vi.mock("@/lib/crypto/tenantSecrets", () => ({
  readSecret: async (ciphertext: string | null) => ciphertext,
}));

import { notifyNewBooking } from "@/lib/notifications/bookingNotify";

type FakeState = {
  members: { user_id: string; role: string }[] | null;
  userEmail: string | null;
  slackWebhookUrl: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: any) {
  const obj: any = {
    select: () => obj,
    eq: () => obj,
    in: () => obj,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return obj;
}

function makeFakeSupabase(state: FakeState) {
  return {
    from: (table: string) => {
      if (table === "tenant_memberships") return chain({ data: state.members });
      if (table === "tenants")
        return chain({ data: { booking_notify_slack_webhook_ciphertext: state.slackWebhookUrl } });
      throw new Error(`unexpected table: ${table}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: state.userEmail ? { email: state.userEmail } : null } }),
      },
    },
  };
}

const reservation = {
  id: "r-1",
  title: "コーティング",
  scheduled_date: "2026-08-01",
  start_time: "10:00:00",
  end_time: "12:00:00",
  note: null,
  tenant_name: "テスト整備",
};

describe("notifyNewBooking", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    notifySlackMock.mockReset();
    createServiceRoleAdminMock.mockReset();
    sendEmailMock.mockResolvedValue({ ok: true, id: "msg_1" });
    notifySlackMock.mockResolvedValue(undefined);
  });

  it("owner/adminが見つからない場合はメール・Slackどちらも送信しない", async () => {
    createServiceRoleAdminMock.mockReturnValue(
      makeFakeSupabase({ members: null, userEmail: null, slackWebhookUrl: null }),
    );

    await notifyNewBooking("t-1", reservation, "山田太郎");

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(notifySlackMock).not.toHaveBeenCalled();
  });

  it("Slack Webhook未設定ならメールのみ送信する", async () => {
    createServiceRoleAdminMock.mockReturnValue(
      makeFakeSupabase({
        members: [{ user_id: "u1", role: "owner" }],
        userEmail: "owner@example.com",
        slackWebhookUrl: null,
      }),
    );

    await notifyNewBooking("t-1", reservation, "山田太郎");

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock.mock.calls[0][0].to).toBe("owner@example.com");
    expect(sendEmailMock.mock.calls[0][0].subject).toContain("山田太郎");
    expect(notifySlackMock).not.toHaveBeenCalled();
  });

  it("Slack Webhook設定済みならメールとSlack両方に通知する（終日予約は「終日」と表示）", async () => {
    createServiceRoleAdminMock.mockReturnValue(
      makeFakeSupabase({
        members: [{ user_id: "u1", role: "owner" }],
        userEmail: "owner@example.com",
        slackWebhookUrl: "https://hooks.slack.com/services/xxx",
      }),
    );

    await notifyNewBooking("t-1", { ...reservation, all_day: true, start_time: null, end_time: null }, "山田太郎");

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(notifySlackMock).toHaveBeenCalledOnce();
    const [webhookUrl, payload] = notifySlackMock.mock.calls[0];
    expect(webhookUrl).toBe("https://hooks.slack.com/services/xxx");
    expect(payload.text).toContain("テスト整備");
    const dateField = payload.fields.find((f: { title: string }) => f.title === "日時");
    expect(dateField.value).toContain("終日");
  });
});
