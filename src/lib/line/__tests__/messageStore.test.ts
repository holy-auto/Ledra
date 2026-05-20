/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleAdmin: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: mocks.createServiceRoleAdmin,
  createTenantScopedAdmin: mocks.createTenantScopedAdmin,
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { recordInboundLineMessage, recordOutboundLineMessage } from "@/lib/line/messageStore";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const LINE_USER = "Uabcdef0123456789abcdef0123456789";

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

/** Build a one-shot supabase mock that returns a fluent query builder. */
function fluentMock(behavior: {
  selectResolve?: { data: unknown; error: unknown };
  insertResolve?: { data: unknown; error: unknown };
}) {
  const calls: { table: string; op: string; args: unknown }[] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const b: any = {
        select() {
          return b;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return b;
        },
        limit() {
          return b;
        },
        async maybeSingle() {
          calls.push({ table, op: "select", args: { ...filters } });
          const r = behavior.selectResolve ?? { data: null, error: null };
          return r;
        },
        async single() {
          calls.push({ table, op: "insert.single", args: { ...filters } });
          return behavior.insertResolve ?? { data: { id: "new-id" }, error: null };
        },
        insert(row: unknown) {
          calls.push({ table, op: "insert", args: row });
          return {
            select: () => ({
              single: async () => behavior.insertResolve ?? { data: { id: "new-id" }, error: null },
            }),
          };
        },
      };
      return b;
    },
  };
  return { client, calls };
}

describe("recordInboundLineMessage", () => {
  it("links to existing customer by line_user_id when matched", async () => {
    const inserted: unknown[] = [];
    // tenant-scoped client returns existing customer
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: fluentMock({ selectResolve: { data: { id: "cust-1" }, error: null } }).client,
    });
    // service-role client records insertion
    mocks.createServiceRoleAdmin.mockReturnValueOnce({
      from(table: string) {
        const b: any = {
          insert(row: unknown) {
            inserted.push({ table, row });
            return {
              select: () => ({ single: async () => ({ data: { id: "msg-1" }, error: null }) }),
            };
          },
        };
        return b;
      },
    } as any);

    const out = await recordInboundLineMessage({
      tenantId: TENANT_A,
      lineUserId: LINE_USER,
      body: "こんにちは",
      lineMessageId: "lmid-1",
      lineTimestampMs: 1000,
    });
    expect(out.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    const row = (inserted[0] as { row: any }).row;
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.customer_id).toBe("cust-1");
    expect(row.line_user_id).toBe(LINE_USER);
    expect(row.direction).toBe("inbound");
    expect(row.body).toBe("こんにちは");
    expect(row.line_message_id).toBe("lmid-1");
  });

  it("stores with customer_id=null when no customer is linked yet", async () => {
    const inserted: unknown[] = [];
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: fluentMock({ selectResolve: { data: null, error: null } }).client,
    });
    mocks.createServiceRoleAdmin.mockReturnValueOnce({
      from() {
        return {
          insert(row: unknown) {
            inserted.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "msg-1" }, error: null }) }) };
          },
        } as any;
      },
    } as any);

    const out = await recordInboundLineMessage({
      tenantId: TENANT_A,
      lineUserId: LINE_USER,
      body: "unmatched",
    });
    expect(out.ok).toBe(true);
    expect((inserted[0] as any).customer_id).toBeNull();
    expect((inserted[0] as any).line_user_id).toBe(LINE_USER);
  });

  it("returns ok=false on insert error and does not throw", async () => {
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: fluentMock({ selectResolve: { data: null, error: null } }).client,
    });
    mocks.createServiceRoleAdmin.mockReturnValueOnce({
      from() {
        return {
          insert() {
            return {
              select: () => ({
                single: async () => ({ data: null, error: { message: "db down" } }),
              }),
            };
          },
        } as any;
      },
    } as any);

    const out = await recordInboundLineMessage({
      tenantId: TENANT_A,
      lineUserId: LINE_USER,
      body: "hi",
    });
    expect(out.ok).toBe(false);
  });
});

describe("recordOutboundLineMessage", () => {
  it("marks delivered_at when delivered=true (or omitted)", async () => {
    const inserted: unknown[] = [];
    mocks.createServiceRoleAdmin.mockReturnValueOnce({
      from() {
        return {
          insert(row: unknown) {
            inserted.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "msg-1" }, error: null }) }) };
          },
        } as any;
      },
    } as any);

    const out = await recordOutboundLineMessage({
      tenantId: TENANT_A,
      lineUserId: LINE_USER,
      body: "thanks",
      customerId: "cust-1",
      sentByUserId: "u1",
    });
    expect(out.ok).toBe(true);
    const row = inserted[0] as any;
    expect(row.direction).toBe("outbound");
    expect(row.delivered_at).not.toBeNull();
    expect(row.failed_at).toBeNull();
    expect(row.sent_by).toBe("u1");
    expect(row.customer_id).toBe("cust-1");
  });

  it("marks failed_at + reason when delivered=false", async () => {
    const inserted: unknown[] = [];
    mocks.createServiceRoleAdmin.mockReturnValueOnce({
      from() {
        return {
          insert(row: unknown) {
            inserted.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "msg-1" }, error: null }) }) };
          },
        } as any;
      },
    } as any);

    const out = await recordOutboundLineMessage({
      tenantId: TENANT_A,
      lineUserId: LINE_USER,
      body: "x",
      delivered: false,
      failureReason: "LINE 401",
    });
    expect(out.ok).toBe(true);
    const row = inserted[0] as any;
    expect(row.delivered_at).toBeNull();
    expect(row.failed_at).not.toBeNull();
    expect(row.failure_reason).toBe("LINE 401");
  });
});
