/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * dispatchNotification（IMP-029 中央 dispatch）の宛先解決・チャネル分岐・LINE 無効スキップ。
 * 実 DB は使わず fakeSupabaseAdmin で検証する（issueHooksPartsAndLine.test.ts と同方針）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  admin: null as any,
  sendEmail: vi.fn(),
  notifySlack: vi.fn(),
  sendLine: vi.fn(),
  sendSms: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: () => ({ admin: m.admin, tenantId: "t1" }) }));
vi.mock("@/lib/email/sendEmail", () => ({ sendEmail: (...a: any[]) => m.sendEmail(...a) }));
vi.mock("@/lib/slack", () => ({ notifySlack: (...a: any[]) => m.notifySlack(...a) }));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: (...a: any[]) => m.sendLine(...a) }));
vi.mock("@/lib/sms/client", () => ({ sendNotificationSms: (...a: any[]) => m.sendSms(...a) }));
vi.mock("@/lib/crypto/tenantSecrets", () => ({ readSecret: async (c: string | null) => c }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: (...a: any[]) => m.warn(...a), error: vi.fn() },
  maskEmail: (e: string) => e,
}));

import { dispatchNotification } from "../dispatch";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const T = "t1";
const EMAILS: Record<string, string> = { u1: "owner@example.com", u2: "admin@example.com", u9: "staff@example.com" };

function setup(tables: FakeStore["tables"]): FakeStore {
  const store = emptyStore(tables);
  m.admin = {
    ...makeFakeAdmin(store),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: EMAILS[id] } } }) } },
  };
  return store;
}

const notificationRows = (store: FakeStore) =>
  store.inserts.filter((i) => i.table === "notifications").flatMap((i) => i.payload as any[]);

const ADMINS = [
  { tenant_id: T, user_id: "u1", role: "owner" },
  { tenant_id: T, user_id: "u2", role: "admin" },
];

describe("dispatchNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.sendEmail.mockResolvedValue({ ok: true });
    m.sendLine.mockResolvedValue(true);
    m.sendSms.mockResolvedValue({ ok: true });
  });

  it("targetRole=admin: 管理者ごとに in_app を作り、テナントの Slack Webhook に送る", async () => {
    const store = setup({
      tenant_memberships: ADMINS,
      tenants: [{ id: T, booking_notify_slack_webhook_ciphertext: "https://hooks.slack.com/x" }],
    });
    await dispatchNotification({ tenantId: T, type: "customer_concern_raised", title: "懸念", body: "本文" });

    const rows = notificationRows(store);
    expect(rows.map((r) => r.user_id).sort()).toEqual(["u1", "u2"]);
    expect(rows[0]).toMatchObject({ tenant_id: T, notification_type: "customer_concern_raised", title: "懸念" });
    expect(m.notifySlack).toHaveBeenCalledWith("https://hooks.slack.com/x", expect.objectContaining({ text: "懸念" }));
    expect(m.sendEmail).not.toHaveBeenCalled(); // カタログに email は無い
  });

  it("targetRole 未指定・userIds なし: テナント全員宛（user_id=NULL）の in_app 1行", async () => {
    const store = setup({});
    await dispatchNotification({ tenantId: T, type: "order_created", title: "発注", body: "b", jobOrderId: "o1" });

    const rows = notificationRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: null, job_order_id: "o1", notification_type: "order_created" });
  });

  it("disabledChannels で落としたチャネルは送らない（bookingNotify の共存用）", async () => {
    const store = setup({
      tenant_memberships: ADMINS,
      tenants: [{ id: T, booking_notify_slack_webhook_ciphertext: "https://hooks.slack.com/x" }],
    });
    await dispatchNotification({
      tenantId: T,
      type: "booking_created",
      title: "予約",
      body: "b",
      overrides: { disabledChannels: ["email", "slack"] },
    });
    expect(notificationRows(store)).toHaveLength(2);
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.notifySlack).not.toHaveBeenCalled();
  });

  it("targetRole=assigned: userIds があればその人にだけ in_app + email", async () => {
    const store = setup({ tenant_memberships: ADMINS });
    await dispatchNotification({ tenantId: T, type: "sla_overdue", title: "超過", body: "b", userIds: ["u9"] });

    expect(notificationRows(store).map((r) => r.user_id)).toEqual(["u9"]);
    expect(m.sendEmail).toHaveBeenCalledOnce();
    expect(m.sendEmail.mock.calls[0][0].to).toBe("staff@example.com");
  });

  it("targetRole=assigned: userIds が空なら管理者にフォールバック", async () => {
    const store = setup({ tenant_memberships: ADMINS });
    await dispatchNotification({ tenantId: T, type: "sla_overdue", title: "超過", body: "b" });

    expect(
      notificationRows(store)
        .map((r) => r.user_id)
        .sort(),
    ).toEqual(["u1", "u2"]);
    expect(m.sendEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(["admin@example.com", "owner@example.com"]);
  });

  it("targetRole=customer: in_app は作らず（顧客の受信箱は無い）、LINE 有効テナントなら LINE を送る", async () => {
    const store = setup({
      tenants: [{ id: T, line_enabled: true }],
      customers: [{ id: "c1", tenant_id: T, email: "c@example.com", phone: "090", line_user_id: "Uline" }],
    });
    await dispatchNotification({
      tenantId: T,
      type: "certificate_issued",
      title: "発行",
      body: "b",
      linkPath: "/c/p1",
      customerId: "c1",
    });

    expect(notificationRows(store)).toHaveLength(0);
    expect(m.sendLine).toHaveBeenCalledOnce();
    expect(m.sendLine.mock.calls[0][0]).toMatchObject({ tenantId: T, customerId: "c1", lineUserId: "Uline" });
    expect(m.sendLine.mock.calls[0][0].body).toContain("/c/p1");
  });

  it("LINE 無効テナントでは line チャネルを自動スキップ（additionalChannels で足しても送らない）", async () => {
    setup({
      tenants: [{ id: T, line_enabled: false }],
      customers: [{ id: "c1", tenant_id: T, email: "c@example.com", phone: "090", line_user_id: "Uline" }],
    });
    await dispatchNotification({
      tenantId: T,
      type: "follow_up_reminder",
      title: "f",
      body: "b",
      customerId: "c1",
      overrides: { additionalChannels: ["line"] },
    });

    expect(m.sendLine).not.toHaveBeenCalled();
    expect(m.sendEmail).toHaveBeenCalledOnce(); // email は LINE 無効に関係なく届く
    expect(m.sendEmail.mock.calls[0][0].to).toBe("c@example.com");
  });

  it("チャネル送信の失敗は warn のみで throw しない", async () => {
    setup({ tenant_memberships: ADMINS });
    m.sendEmail.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      dispatchNotification({ tenantId: T, type: "sla_overdue", title: "超過", body: "b", userIds: ["u1"] }),
    ).resolves.toBeUndefined();
    expect(m.warn).toHaveBeenCalledWith("[notify] channel send failed", expect.objectContaining({ channel: "email" }));
  });
});
