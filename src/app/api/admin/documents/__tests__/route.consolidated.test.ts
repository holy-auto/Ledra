/* eslint-disable @typescript-eslint/no-explicit-any */
// 合算請求書: 下書き編集で合算元ID（＝送付 PDF の合算内訳）が消えないこと、
// 送付後の合算請求書は削除できるが、入金記録あり・オーダー締め・管理者未満は消さないことを確かめる。
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userClient: null as any,
  admin: null as any,
  role: "admin",
}));

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => mocks.userClient) }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: vi.fn(async () => ({ userId: "u1", tenantId: "t1", role: mocks.role, planTier: "pro" })),
  requireMinRole: (caller: { role: string }, min: string) => {
    const rank: Record<string, number> = { owner: 4, admin: 3, staff: 2, viewer: 1 };
    return (rank[caller.role] ?? 0) >= (rank[min] ?? 0);
  },
  requirePermission: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: () => ({ admin: mocks.admin }) }));
vi.mock("@/lib/audit/tenantLog", () => ({ logTenantAuditEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { PUT, DELETE } from "@/app/api/admin/documents/route";

const DOC_ID = "11111111-1111-4111-8111-111111111111";

/** 終端（maybeSingle / single / await）で rows を返す素朴なビルダ。呼ばれた update/delete を記録する。 */
function client(tables: Record<string, unknown>, calls: { update?: any; deleted?: unknown[] } = {}) {
  return {
    calls,
    from(table: string) {
      const rows = tables[table];
      const b: any = {
        select: () => b,
        eq: () => b,
        in: (_c: string, vals: unknown[]) => {
          b._in = vals;
          return b;
        },
        update: (patch: unknown) => {
          calls.update = patch;
          return b;
        },
        delete: () => {
          b._delete = true;
          return b;
        },
        maybeSingle: async () => ({ data: rows, error: null }),
        single: async () => ({
          data: { id: DOC_ID, doc_type: "consolidated_invoice", ...(calls.update ?? {}) },
          error: null,
        }),
        then: (res: any) => {
          if (b._delete) calls.deleted = b._in;
          return Promise.resolve({ data: rows, error: null }).then(res);
        },
      };
      return b;
    },
  };
}

function req(method: string, body: unknown) {
  return new Request("http://localhost/api/admin/documents", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  mocks.userClient = null;
  mocks.admin = null;
  mocks.role = "admin";
});

describe("PUT /api/admin/documents（合算請求書の下書き編集）", () => {
  it("編集フォームが meta_json を送らなくても合算元ID・内訳表示設定を残す", async () => {
    const existing = {
      doc_type: "consolidated_invoice",
      status: "draft",
      meta_json: { source_document_ids: ["a", "b"], show_consolidated_breakdown: false, is_tax_inclusive: true },
    };
    mocks.userClient = client({ documents: existing });
    mocks.admin = client({});

    const res = await PUT(
      req("PUT", { id: DOC_ID, items: [{ description: "x", quantity: 1, unit_price: 1000 }], is_tax_inclusive: false }),
    );

    expect(res.status).toBe(200);
    expect(mocks.admin.calls.update.meta_json).toEqual({
      source_document_ids: ["a", "b"],
      show_consolidated_breakdown: false,
      is_tax_inclusive: false,
    });
  });
});

describe("DELETE /api/admin/documents（合算請求書）", () => {
  it("送付済みでも入金記録が無ければ削除する", async () => {
    mocks.userClient = client({ documents: [{ id: DOC_ID, status: "sent", doc_type: "consolidated_invoice" }] });
    mocks.admin = client({ payment_entries: [], documents: null });

    const res = await DELETE(req("DELETE", { id: DOC_ID }));

    expect(res.status).toBe(200);
    expect(mocks.admin.calls.deleted).toEqual([DOC_ID]);
  });

  it("入金記録がある合算請求書は（入金履歴ごと消えるので）削除しない", async () => {
    mocks.userClient = client({ documents: [{ id: DOC_ID, status: "sent", doc_type: "consolidated_invoice" }] });
    mocks.admin = client({ payment_entries: [{ document_id: DOC_ID }], documents: null });

    const res = await DELETE(req("DELETE", { id: DOC_ID }));

    expect(res.status).toBe(400);
    expect(mocks.admin.calls.deleted).toBeUndefined();
  });

  it("オーダー締めの合算請求書は（job_orders が請求済みのまま残るので）送付後は削除しない", async () => {
    mocks.userClient = client({
      documents: [
        { id: DOC_ID, status: "sent", doc_type: "consolidated_invoice", meta_json: { source: "job_order_cycle" } },
      ],
    });
    mocks.admin = client({ payment_entries: [], documents: null });

    const res = await DELETE(req("DELETE", { id: DOC_ID }));

    expect(res.status).toBe(400);
    expect(mocks.admin.calls.deleted).toBeUndefined();
  });

  it("送付済みの合算請求書は管理者未満（staff）には削除させない。下書きは従来どおり staff も削除できる", async () => {
    mocks.role = "staff";
    mocks.userClient = client({ documents: [{ id: DOC_ID, status: "sent", doc_type: "consolidated_invoice" }] });
    mocks.admin = client({ payment_entries: [], documents: null });
    expect((await DELETE(req("DELETE", { id: DOC_ID }))).status).toBe(400);
    expect(mocks.admin.calls.deleted).toBeUndefined();

    mocks.userClient = client({ documents: [{ id: DOC_ID, status: "draft", doc_type: "consolidated_invoice" }] });
    mocks.admin = client({ documents: null });
    expect((await DELETE(req("DELETE", { id: DOC_ID }))).status).toBe(200);
    expect(mocks.admin.calls.deleted).toEqual([DOC_ID]);
  });
});
