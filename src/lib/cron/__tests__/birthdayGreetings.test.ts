import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  birthDateKey,
  birthdayMatchKeys,
  birthdayNotifYear,
  processBirthdayGreetings,
  type BirthdaySetting,
} from "../birthdayGreetings";

// email / LINE 送信は mock (Resend / LINE に実際に飛ばさない)
const emailMock = vi.fn<(..._args: any[]) => Promise<boolean>>(async () => true);
const lineMock = vi.fn<(..._args: any[]) => Promise<boolean>>(async () => true);
vi.mock("@/lib/follow-up/email", () => ({
  sendBirthdayEmail: (...args: any[]) => emailMock(...args),
}));
vi.mock("@/lib/line/client", () => ({
  sendBirthdayLineMessage: (...args: any[]) => lineMock(...args),
}));

describe("birthDateKey", () => {
  it("extracts MM-DD from a YYYY-MM-DD date", () => {
    expect(birthDateKey("1990-02-15")).toBe("02-15");
    expect(birthDateKey("2001-12-31")).toBe("12-31");
  });
  it("returns null for empty / malformed input", () => {
    expect(birthDateKey(null)).toBeNull();
    expect(birthDateKey(undefined)).toBeNull();
    expect(birthDateKey("not-a-date")).toBeNull();
  });
});

describe("birthdayMatchKeys", () => {
  it("matches the same day when leadDays = 0", () => {
    expect(birthdayMatchKeys(new Date("2026-06-16T00:00:00Z"), 0)).toEqual(["06-16"]);
  });
  it("shifts forward by leadDays", () => {
    // 今日 6/16 に lead 3 → 6/19 が誕生日の顧客を対象にする
    expect(birthdayMatchKeys(new Date("2026-06-16T00:00:00Z"), 3)).toEqual(["06-19"]);
  });
  it("crosses the year boundary", () => {
    expect(birthdayMatchKeys(new Date("2026-12-30T00:00:00Z"), 3)).toEqual(["01-02"]);
  });
  it("celebrates Feb-29 birthdays on Feb-28 in a non-leap year", () => {
    expect(birthdayMatchKeys(new Date("2025-02-28T00:00:00Z"), 0)).toEqual(["02-28", "02-29"]);
  });
  it("uses Feb-29 itself in a leap year (no Feb-28 fallback)", () => {
    expect(birthdayMatchKeys(new Date("2024-02-29T00:00:00Z"), 0)).toEqual(["02-29"]);
  });
  it("clamps out-of-range leadDays to 0..60", () => {
    expect(birthdayMatchKeys(new Date("2026-06-16T00:00:00Z"), -5)).toEqual(["06-16"]);
  });
});

describe("birthdayNotifYear", () => {
  it("uses the send year (today + leadDays)", () => {
    expect(birthdayNotifYear(new Date("2026-06-16T00:00:00Z"), 0)).toBe(2026);
    expect(birthdayNotifYear(new Date("2026-12-30T00:00:00Z"), 3)).toBe(2027);
  });
});

// ── processBirthdayGreetings: 軽量な supabase mock で挙動を確認 ──
type Customer = {
  id: string;
  name: string | null;
  email: string | null;
  line_user_id: string | null;
  birth_date: string | null;
  followup_opt_out: boolean | null;
};

interface World {
  customers: Customer[];
  notificationLogs: Array<{ tenant_id?: string; target_id: string; type: string; status: string; channel?: string }>;
  insertCalls: Array<Record<string, unknown>>;
}

function makeSupabaseMock(world: World): any {
  function chain(table: string) {
    let rows: any[] = [];
    let mode: "insert" | "select" = "select";
    if (table === "customers") rows = world.customers;
    else if (table === "notification_logs") rows = world.notificationLogs;

    const filters: Array<(r: any) => boolean> = [];
    const builder: any = {
      select: () => {
        mode = "select";
        return builder;
      },
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in: (col: string, values: any[]) => {
        filters.push((r) => values.includes(r[col]));
        return builder;
      },
      not: (col: string, op: string, val: any) => {
        // 実装は .not("birth_date", "is", null) のみ使う
        if (op === "is" && val === null) filters.push((r) => r[col] != null);
        return builder;
      },
      insert: (payload: any) => {
        mode = "insert";
        world.insertCalls.push({ table, ...payload });
        if (table === "notification_logs") {
          world.notificationLogs.push({
            target_id: payload.target_id,
            type: payload.type,
            status: payload.status,
            channel: payload.channel,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: any) => {
        if (mode !== "select") return resolve({ data: null, error: null });
        const out = rows.filter((r) => filters.every((f) => f(r)));
        return resolve({ data: out, error: null });
      },
    };
    return builder;
  }
  return { from: (t: string) => chain(t) };
}

const customer = (over: Partial<Customer> = {}): Customer & { tenant_id: string } => ({
  id: "u-" + Math.random().toString(36).slice(2, 6),
  tenant_id: "t1",
  name: "山田",
  email: "yamada@example.com",
  line_user_id: null,
  birth_date: "1990-06-16",
  followup_opt_out: false,
  ...over,
});

const setting = (over: Partial<BirthdaySetting> = {}): BirthdaySetting => ({
  tenant_id: "t1",
  birthday_enabled: true,
  birthday_lead_days: 0,
  ...over,
});

const TODAY = new Date("2026-06-16T00:00:00Z");

describe("processBirthdayGreetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailMock.mockResolvedValue(true);
    lineMock.mockResolvedValue(true);
  });

  it("does nothing when birthday_enabled is false", async () => {
    const world: World = { customers: [customer()], notificationLogs: [], insertCalls: [] };
    const n = await processBirthdayGreetings(
      makeSupabaseMock(world),
      setting({ birthday_enabled: false }),
      "Shop",
      TODAY,
    );
    expect(n).toBe(0);
    expect(emailMock).not.toHaveBeenCalled();
    expect(lineMock).not.toHaveBeenCalled();
  });

  it("sends via LINE when line_user_id is present (LINE-first)", async () => {
    const world: World = {
      customers: [customer({ id: "u1", line_user_id: "L1" })],
      notificationLogs: [],
      insertCalls: [],
    };
    const n = await processBirthdayGreetings(makeSupabaseMock(world), setting(), "Shop", TODAY);
    expect(n).toBe(1);
    expect(lineMock).toHaveBeenCalledTimes(1);
    expect(emailMock).not.toHaveBeenCalled();
    expect(world.notificationLogs[0]).toMatchObject({ type: "birthday_2026", status: "sent", channel: "line" });
  });

  it("falls back to email when no line_user_id", async () => {
    const world: World = {
      customers: [customer({ id: "u1", line_user_id: null })],
      notificationLogs: [],
      insertCalls: [],
    };
    const n = await processBirthdayGreetings(makeSupabaseMock(world), setting(), "Shop", TODAY);
    expect(n).toBe(1);
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(world.notificationLogs[0]).toMatchObject({ channel: "email", status: "sent" });
  });

  it("skips customers whose birthday is not today", async () => {
    const world: World = {
      customers: [customer({ id: "u1", birth_date: "1990-01-01" })],
      notificationLogs: [],
      insertCalls: [],
    };
    const n = await processBirthdayGreetings(makeSupabaseMock(world), setting(), "Shop", TODAY);
    expect(n).toBe(0);
  });

  it("skips opted-out customers", async () => {
    const world: World = {
      customers: [customer({ id: "u1", followup_opt_out: true })],
      notificationLogs: [],
      insertCalls: [],
    };
    const n = await processBirthdayGreetings(makeSupabaseMock(world), setting(), "Shop", TODAY);
    expect(n).toBe(0);
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("skips customers already greeted this year (idempotent)", async () => {
    const world: World = {
      customers: [customer({ id: "u1" })],
      notificationLogs: [{ tenant_id: "t1", target_id: "u1", type: "birthday_2026", status: "sent" }],
      insertCalls: [],
    };
    const n = await processBirthdayGreetings(makeSupabaseMock(world), setting(), "Shop", TODAY);
    expect(n).toBe(0);
  });

  it("respects birthday_lead_days when matching", async () => {
    const world: World = {
      // 今日 6/16、lead 3 → 6/19 生まれが対象
      customers: [customer({ id: "u1", birth_date: "1988-06-19", line_user_id: "L1" })],
      notificationLogs: [],
      insertCalls: [],
    };
    const n = await processBirthdayGreetings(
      makeSupabaseMock(world),
      setting({ birthday_lead_days: 3 }),
      "Shop",
      TODAY,
    );
    expect(n).toBe(1);
  });
});
