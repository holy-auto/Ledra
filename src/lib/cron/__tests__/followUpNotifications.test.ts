import { describe, it, expect, vi, beforeEach } from "vitest";
import { todayJst } from "@/lib/gantt/board";
import { processSeasonalProposals, processRegularFollowUps, type FollowUpSetting, type TenantInfo } from "../followUp";

// email 送信は mock — 実際の Resend に飛ばさない
const followUpEmailMock = vi.fn<(..._args: any[]) => Promise<boolean>>(async () => true);
vi.mock("@/lib/follow-up/email", () => ({
  sendExpiryReminder: vi.fn(async () => true),
  sendFollowUpEmail: (...args: any[]) => followUpEmailMock(...args),
  sendMaintenanceReminder: vi.fn(async () => true),
}));

// LINE 送信は mock
const lineMock = vi.fn<(..._args: any[]) => Promise<boolean>>(async () => true);
vi.mock("@/lib/line/client", () => ({
  sendMaintenanceLineMessage: (...args: any[]) => lineMock(...args),
  getLineConfig: vi.fn(async () => null),
}));

// AI 呼び出しは mock — 固定文面を返す
vi.mock("@/lib/ai/followUpContent", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/followUpContent")>("@/lib/ai/followUpContent");
  return {
    ...actual,
    generateFollowUpContent: vi.fn(async () => ({
      emailSubject: "AI件名",
      emailBody: "<p>AI本文</p>",
      lineMessage: "AI LINE文面",
    })),
  };
});

interface World {
  customers: any[];
  certificates: any[];
  notificationLogs: any[];
  insertCalls: Array<Record<string, unknown>>;
}

// maintenance.test.ts の軽量 supabase mock に not/order/limit/gt を足したもの
function makeSupabaseMock(world: World): any {
  function chain(table: string) {
    const rows: any[] =
      table === "customers"
        ? world.customers
        : table === "certificates"
          ? world.certificates
          : table === "notification_logs"
            ? world.notificationLogs
            : [];
    const filters: Array<(r: any) => boolean> = [];
    let orderCol: string | null = null;
    let limitN: number | null = null;

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      neq: (col: string, val: any) => {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      gte: (col: string, val: any) => {
        filters.push((r) => String(r[col] ?? "") >= val);
        return builder;
      },
      lte: (col: string, val: any) => {
        filters.push((r) => String(r[col] ?? "") <= val);
        return builder;
      },
      gt: (col: string, val: any) => {
        filters.push((r) => String(r[col] ?? "") > String(val));
        return builder;
      },
      in: (col: string, values: any[]) => {
        filters.push((r) => values.includes(r[col]));
        return builder;
      },
      not: (col: string, op: string, val: any) => {
        if (op === "is" && val === null) filters.push((r) => r[col] != null);
        return builder;
      },
      order: (col: string) => {
        orderCol = col;
        return builder;
      },
      limit: (n: number) => {
        limitN = n;
        return builder;
      },
      insert: (payload: any) => {
        world.insertCalls.push({ table, ...payload });
        if (table === "notification_logs") world.notificationLogs.push(payload);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: any) => {
        let out = rows.filter((r) => filters.every((f) => f(r)));
        if (orderCol) out = [...out].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
        if (limitN != null) out = out.slice(0, limitN);
        return resolve({ data: out, error: null });
      },
    };
    return builder;
  }
  return { from: (t: string) => chain(t) };
}

const baseSetting = (over: Partial<FollowUpSetting> = {}): FollowUpSetting => ({
  tenant_id: "t1",
  enabled: true,
  reminder_days_before: null,
  follow_up_days_after: null,
  send_on_issue: null,
  first_reminder_days: null,
  warranty_end_days: null,
  inspection_pre_days: null,
  seasonal_enabled: null,
  maintenance_reminder_months: null,
  maintenance_schedule_by_service: null,
  birthday_enabled: null,
  birthday_lead_days: null,
  ...over,
});

const emptyWorld = (): World => ({ customers: [], certificates: [], notificationLogs: [], insertCalls: [] });

beforeEach(() => {
  vi.clearAllMocks();
  followUpEmailMock.mockResolvedValue(true);
  lineMock.mockResolvedValue(true);
});

describe("processSeasonalProposals — JST 暦日", () => {
  it("route と同じ導出 (todayJst → UTC 0 時固定) で JST 深夜も正しい日に発火する", async () => {
    // UTC 2026-05-31 15:30 = JST 2026-06-01 00:30 (毎月 1 日ゲートを通るべき)
    const utcNow = new Date("2026-05-31T15:30:00Z");
    const anchored = new Date(`${todayJst(utcNow)}T00:00:00Z`);
    expect(anchored.toISOString().slice(0, 10)).toBe("2026-06-01");

    const world = emptyWorld();
    world.customers = [{ id: "u1", tenant_id: "t1", name: "山田", email: "u1@example.com" }];
    const sent = await processSeasonalProposals(
      makeSupabaseMock(world),
      baseSetting({ seasonal_enabled: true }),
      "Shop A",
      anchored,
    );
    expect(sent).toBe(1);

    // 対して素の UTC now (5/31) をそのまま渡すと 1 日ゲートで送られない — これが直した不整合
    const sentUtc = await processSeasonalProposals(
      makeSupabaseMock(world),
      baseSetting({ seasonal_enabled: true }),
      "Shop A",
      utcNow,
    );
    expect(sentUtc).toBe(0);
  });
});

describe("processSeasonalProposals — keyset ページネーション", () => {
  it("100 件超の顧客にも全員送る (旧実装は 100 件で黙って打ち切り)", async () => {
    const world = emptyWorld();
    world.customers = Array.from({ length: 150 }, (_, i) => ({
      id: `cust-${String(i + 1).padStart(3, "0")}`,
      tenant_id: "t1",
      name: `顧客${i + 1}`,
      email: `c${i + 1}@example.com`,
    }));
    const sent = await processSeasonalProposals(
      makeSupabaseMock(world),
      baseSetting({ seasonal_enabled: true }),
      "Shop A",
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(sent).toBe(150);
    expect(followUpEmailMock).toHaveBeenCalledTimes(150);
    // AI 生成文面が捨てられずメールに載っている
    expect(followUpEmailMock.mock.calls[0][0]).toMatchObject({
      subject: "AI件名",
      bodyHtml: "<p>AI本文</p>",
    });
  });
});

describe("sendNotification (processRegularFollowUps 経由) — AI 文面の利用", () => {
  const tenant: TenantInfo = { id: "t1", name: "Shop A", phone: null, plan_tier: "pro" };
  const TODAY = new Date("2026-07-02T00:00:00Z"); // 90 日前 = 2026-04-03

  const cert = (id: string, customerId: string) => ({
    id,
    tenant_id: "t1",
    status: "active",
    customer_id: customerId,
    customer_name: "山田",
    service_name: "PPF",
    created_at: "2026-04-03T10:00:00Z",
    warranty_period: null,
    vehicle_maker: null,
    vehicle_model: null,
    vehicle_color: null,
  });

  it("LINE ユーザーには AI の lineMessage を LINE 優先で送る", async () => {
    const world = emptyWorld();
    world.certificates = [cert("c1", "u1")];
    world.customers = [{ id: "u1", name: "山田", email: "u1@example.com", line_user_id: "U-1" }];
    const sent = await processRegularFollowUps(
      makeSupabaseMock(world),
      baseSetting({ follow_up_days_after: [90] }),
      tenant,
      "Shop A",
      "pro",
      TODAY,
    );
    expect(sent).toBe(1);
    expect(lineMock).toHaveBeenCalledWith(expect.objectContaining({ lineMessage: "AI LINE文面" }));
    expect(followUpEmailMock).not.toHaveBeenCalled();
    const log = world.insertCalls.find((c) => c.table === "notification_logs");
    expect(log?.channel).toBe("line");
    expect(log?.recipient_line_user_id).toBe("U-1");
  });

  it("LINE の無い顧客には AI の件名・本文でメールを送る", async () => {
    const world = emptyWorld();
    world.certificates = [cert("c1", "u1")];
    world.customers = [{ id: "u1", name: "山田", email: "u1@example.com", line_user_id: null }];
    const sent = await processRegularFollowUps(
      makeSupabaseMock(world),
      baseSetting({ follow_up_days_after: [90] }),
      tenant,
      "Shop A",
      "pro",
      TODAY,
    );
    expect(sent).toBe(1);
    expect(lineMock).not.toHaveBeenCalled();
    expect(followUpEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "AI件名", bodyHtml: "<p>AI本文</p>" }),
    );
    const log = world.insertCalls.find((c) => c.table === "notification_logs");
    expect(log?.channel).toBe("email");
    expect(log?.recipient_email).toBe("u1@example.com");
  });
});
