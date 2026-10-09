/* eslint-disable @typescript-eslint/no-explicit-any */
// 合算請求書: 下書き編集で合算元ID（＝送付 PDF の合算内訳）が消えないこと、
// 送付後の合算請求書は削除できるが、入金記録・按分あり・オーダー締め・管理者未満は消さないことを確かめる。
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userClient: null as any,
  admin: null as any,
  role: "admin",
  sync: vi.fn(),
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
// 元請求書の取消扱い・戻しの中身は consolidatedSupersede.test.ts で見る。ここでは呼ぶ契機だけ見る
vi.mock("@/lib/documents/consolidatedSupersede", async (orig) => ({
  ...(await orig<typeof import("@/lib/documents/consolidatedSupersede")>()),
  syncConsolidatedSources: mocks.sync,
}));
// 採番は DB を見るので、固定番号で insert を1回だけ呼ぶ
vi.mock("@/lib/invoice/invoiceNumber", () => ({
  insertDocWithRetry: (_a: unknown, _t: unknown, _d: unknown, _p: unknown, insert: (n: string) => unknown) =>
    insert("CINV-TEST"),
}));

import { GET, POST, PUT, DELETE } from "@/app/api/admin/documents/route";

const DOC_ID = "11111111-1111-4111-8111-111111111111";

/** 終端（maybeSingle / single / await）で rows を返す素朴なビルダ。呼ばれた update/delete を記録する。 */
function client(
  tables: Record<string, unknown>,
  calls: {
    update?: any;
    insert?: any;
    deleted?: unknown[];
    deleteOr?: string;
    deleteReturnsNothing?: boolean;
  } = {},
) {
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
        insert: (row: unknown) => {
          calls.insert = row;
          return b;
        },
        delete: () => {
          b._delete = true;
          return b;
        },
        order: () => b,
        range: () => b,
        limit: () => b,
        // キーセットの2ページ目以降は空（1ページで読み切れる量のテスト）
        gt: () => {
          b._nextPage = true;
          return b;
        },
        or: (expr: string) => {
          if (b._delete) calls.deleteOr = expr;
          return b;
        },
        maybeSingle: async () => ({ data: rows, error: null }),
        single: async () => ({
          data: calls.insert ?? { id: DOC_ID, doc_type: "consolidated_invoice", ...(calls.update ?? {}) },
          error: null,
        }),
        then: (res: any) => {
          if (b._delete) {
            calls.deleted = b._in;
            const gone = calls.deleteReturnsNothing ? [] : b._in.map((id: string) => ({ id }));
            return Promise.resolve({ data: gone, error: null }).then(res);
          }
          if ((rows as { __error?: string } | undefined)?.__error) {
            return Promise.resolve({ data: null, error: { message: (rows as { __error: string }).__error } }).then(res);
          }
          return Promise.resolve({ data: b._nextPage ? [] : rows, error: null }).then(res);
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
  mocks.sync.mockReset();
});

describe("合算請求書と元の請求書の二重計上を防ぐ（元請求書の取消扱い・戻しを呼ぶ契機）", () => {
  it("合算請求書を取消にしたら、元の請求書を戻すために同期を呼ぶ", async () => {
    mocks.userClient = client({ documents: { doc_type: "consolidated_invoice", status: "sent", meta_json: {} } });
    mocks.admin = client({});

    const res = await PUT(req("PUT", { id: DOC_ID, status: "cancelled" }));

    expect(res.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(
      mocks.admin,
      "t1",
      expect.objectContaining({ id: DOC_ID, doc_type: "consolidated_invoice", status: "cancelled" }),
    );
  });

  it("ステータスを変えない編集では同期を呼ばない", async () => {
    mocks.userClient = client({ documents: { doc_type: "consolidated_invoice", status: "draft", meta_json: {} } });
    mocks.admin = client({});

    await PUT(req("PUT", { id: DOC_ID, note: "x" }));

    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("合算請求書にまとめて取消扱いになった請求書は、ここから戻させない（戻すと両方が未入金に乗る）", async () => {
    mocks.userClient = client({
      documents: { doc_type: "invoice", status: "cancelled", meta_json: { consolidated_into: "cinv-1" } },
    });
    mocks.admin = client({});

    const res = await PUT(req("PUT", { id: DOC_ID, status: "sent" }));

    expect(res.status).toBe(400);
    expect(mocks.admin.calls.update).toBeUndefined();
  });

  it("取消した合算請求書は戻させない（取消の間に元の請求書が別の合算へまとめ直されうる）", async () => {
    mocks.userClient = client({ documents: { doc_type: "consolidated_invoice", status: "cancelled", meta_json: {} } });
    mocks.admin = client({});

    const res = await PUT(req("PUT", { id: DOC_ID, status: "sent" }));

    expect(res.status).toBe(400);
    expect(mocks.admin.calls.update).toBeUndefined();
  });

  it("meta_json を丸ごと送る更新でも、まとめ先（戻すための印）を消さない", async () => {
    const meta = { consolidated_into: "cinv-1", status_before_consolidation: "sent" };
    mocks.userClient = client({ documents: { doc_type: "invoice", status: "cancelled", meta_json: meta } });
    mocks.admin = client({});

    await PUT(req("PUT", { id: DOC_ID, meta_json: { consolidated_into: null } }));

    expect(mocks.admin.calls.update.meta_json).toEqual(meta);
  });

  it("合算請求書を削除したら、実際に消えたものについて元の請求書を戻す", async () => {
    const doc = { id: DOC_ID, status: "sent", doc_type: "consolidated_invoice", meta_json: {} };
    mocks.userClient = client({ documents: [doc] });
    mocks.admin = client({ payment_entries: [], billing_splits: [], documents: null });

    expect((await DELETE(req("DELETE", { id: DOC_ID }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(mocks.admin, "t1", doc, { deleted: true });
  });

  it("消えなかった（入金済へ変わった）合算請求書の元請求書は戻さない", async () => {
    mocks.userClient = client({ documents: [{ id: DOC_ID, status: "sent", doc_type: "consolidated_invoice" }] });
    mocks.admin = client({ payment_entries: [], billing_splits: [], documents: null }, { deleteReturnsNothing: true });

    expect((await DELETE(req("DELETE", { id: DOC_ID }))).status).toBe(409);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
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
    mocks.admin = client({ payment_entries: [], billing_splits: [], documents: null });

    const res = await DELETE(req("DELETE", { id: DOC_ID }));

    expect(res.status).toBe(200);
    expect(mocks.admin.calls.deleted).toEqual([DOC_ID]);
    // 確認から DELETE までの間に入金済になった合算請求書を消さないよう、DELETE 文にも条件を入れる
    expect(mocks.admin.calls.deleteOr).toBe("doc_type.neq.consolidated_invoice,status.neq.paid");
    expect(await res.json()).toMatchObject({ deleted: 1, skipped: 0 });
  });

  it("確認後に入金済へ変わって1件も消えなかったら、成功ではなく 409 を返す", async () => {
    mocks.userClient = client({ documents: [{ id: DOC_ID, status: "sent", doc_type: "consolidated_invoice" }] });
    mocks.admin = client({ payment_entries: [], billing_splits: [], documents: null }, { deleteReturnsNothing: true });

    const res = await DELETE(req("DELETE", { id: DOC_ID }));

    expect(res.status).toBe(409);
  });

  it("支払者按分（billing_splits）がある合算請求書は（按分ごと消えるので）削除しない", async () => {
    mocks.userClient = client({ documents: [{ id: DOC_ID, status: "sent", doc_type: "consolidated_invoice" }] });
    mocks.admin = client({ payment_entries: [], billing_splits: [{ id: "p1", document_id: DOC_ID }], documents: null });

    const res = await DELETE(req("DELETE", { id: DOC_ID }));

    expect(res.status).toBe(400);
    expect(mocks.admin.calls.deleted).toBeUndefined();
  });

  it("入金記録がある合算請求書は（入金履歴ごと消えるので）削除しない", async () => {
    mocks.userClient = client({ documents: [{ id: DOC_ID, status: "sent", doc_type: "consolidated_invoice" }] });
    mocks.admin = client({ payment_entries: [{ id: "p1", document_id: DOC_ID }], documents: null });

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

describe("GET /api/admin/documents（一覧の削除可否）", () => {
  const SENT = { id: "doc-sent", doc_type: "consolidated_invoice", status: "sent", customer_id: null, total: 0 };
  const PAID_LINKED = { ...SENT, id: "doc-with-payment" };
  const CYCLE = { ...SENT, id: "doc-cycle", counterparty_tenant_id: "tenant-from" };
  const DRAFT = { ...SENT, id: "doc-draft", status: "draft" };
  const list = (opts: { query?: string; paymentsError?: boolean } = {}) => {
    mocks.admin = client({
      documents: [SENT, PAID_LINKED, CYCLE, DRAFT],
      payment_entries: opts.paymentsError ? { __error: "timeout" } : [{ id: "p1", document_id: "doc-with-payment" }],
      billing_splits: [],
    });
    return GET(new Request(`http://localhost/api/admin/documents${opts.query ?? "?with_deletable=1"}`) as any);
  };
  const deletableOf = async (res: Response) =>
    Object.fromEntries(((await res.json()).documents as any[]).map((d) => [d.id, d.deletable]));

  it("管理者には、DELETE API が通すものだけ deletable を立てる（入金あり・オーダー締めは false）", async () => {
    expect(await deletableOf(await list())).toEqual({
      "doc-sent": true,
      "doc-with-payment": false,
      "doc-cycle": false,
      "doc-draft": true,
    });
  });

  it("staff には送付済み合算請求書の削除を出さない（下書きは出す）", async () => {
    mocks.role = "staff";
    expect(await deletableOf(await list())).toMatchObject({ "doc-sent": false, "doc-draft": true });
  });

  it("判定の取得に失敗しても一覧は返し、送付済み合算請求書には削除を出さない", async () => {
    const res = await list({ paymentsError: true });
    expect(res.status).toBe(200);
    expect(await deletableOf(res)).toEqual({
      "doc-sent": false,
      "doc-with-payment": false,
      "doc-cycle": false,
      "doc-draft": true,
    });
  });

  it("with_deletable を付けない呼び出し元には判定せず、counterparty_tenant_id も返さない", async () => {
    const docs = (await (await list({ query: "" })).json()).documents as any[];
    expect(docs.every((d) => !("deletable" in d) && !("counterparty_tenant_id" in d))).toBe(true);
  });
});

describe("POST /api/admin/documents（合算請求書の明細を元帳票の明細で組む）", () => {
  const item = (description: string, unit_price: number) => ({
    item_type: "item",
    description,
    quantity: 1,
    unit: "式",
    unit_price,
    amount: unit_price,
  });
  const SOURCES = [
    {
      id: "a",
      doc_type: "invoice",
      doc_number: "INV-202610-002",
      subject: "U632",
      vehicle_info_json: { model: "95プラド" },
      items_json: [item("内装張替え工賃", 50000), item("内装生地（L-6217）", 20592)],
      subtotal: 70592,
      total: 77651,
      tax_rate: 10,
      meta_json: { is_tax_inclusive: false },
      customer_id: "22222222-2222-4222-8222-222222222222",
      status: "sent",
    },
    {
      id: "b",
      doc_type: "invoice",
      doc_number: "INV-202610-003",
      vehicle_info_json: {},
      items_json: [item("ボディコーティング", 30000)],
      subtotal: 30000,
      total: 33000,
      tax_rate: 10,
      meta_json: { is_tax_inclusive: false },
      customer_id: "22222222-2222-4222-8222-222222222222",
      status: "sent",
    },
  ];
  // 一覧画面が送るのと同じ「1帳票=1行（税込合計）」の要約行
  const body = {
    doc_type: "consolidated_invoice",
    customer_id: "22222222-2222-4222-8222-222222222222",
    items: [
      { item_type: "item", description: "請求書 INV-202610-002", quantity: 1, unit_price: 77651 },
      { item_type: "item", description: "請求書 INV-202610-003", quantity: 1, unit_price: 33000 },
    ],
    tax_rate: 10,
    is_tax_inclusive: true,
    status: "draft",
    meta_json: { source_document_ids: ["a", "b"], show_consolidated_breakdown: true, consolidated_items: "inline" },
  };

  it("内訳を1枚目に入れる指定なら、元帳票を読み直して『見出し → 明細 → 小計』で組み、税は合算後に計算する", async () => {
    mocks.admin = client({ tenants: { registration_number: null }, documents: SOURCES });

    const res = await POST(req("POST", body));

    expect(res.status).toBe(200);
    const row = mocks.admin.calls.insert;
    expect(row.items_json.map((r: any) => [r.item_type, r.description, r.amount])).toEqual([
      ["heading", "U632 95プラド", 0],
      ["item", "内装張替え工賃", 50000],
      ["item", "内装生地（L-6217）", 20592],
      ["subtotal", "小計", 70592],
      ["heading", "請求書 INV-202610-003", 0],
      ["item", "ボディコーティング", 30000],
      ["subtotal", "小計", 30000],
    ]);
    expect([row.subtotal, row.tax, row.total]).toEqual([100592, 10059, 110651]);
    expect(row.meta_json).toMatchObject({ consolidated_items: "inline", is_tax_inclusive: false });
    // 作成したら元の請求書を取消扱いにする（二重計上を防ぐ）
    expect(mocks.sync).toHaveBeenCalledWith(
      mocks.admin,
      "t1",
      expect.objectContaining({
        doc_type: "consolidated_invoice",
        meta_json: expect.objectContaining({ source_document_ids: ["a", "b"] }),
      }),
    );
  });

  it("税込/税抜が混在してまとめられないときは要約行のまま作り、inline の印を外す（別紙の内訳に回す）", async () => {
    const mixed = [SOURCES[0], { ...SOURCES[1], total: 30000, meta_json: { is_tax_inclusive: true } }];
    mocks.admin = client({ tenants: { registration_number: null }, documents: mixed });

    await POST(req("POST", body));

    const row = mocks.admin.calls.insert;
    expect(row.items_json.map((r: any) => r.description)).toEqual(["請求書 INV-202610-002", "請求書 INV-202610-003"]);
    expect(row.meta_json.consolidated_items).toBeUndefined();
    expect(row.meta_json.is_tax_inclusive).toBe(true);
  });

  it("別顧客の帳票・外注請求書など合算できない元帳票が混じっていたら、作成を拒否する（サーバでも確かめる）", async () => {
    for (const bad of [
      { ...SOURCES[1], customer_id: "33333333-3333-4333-8333-333333333333" },
      { ...SOURCES[1], doc_type: "staff_invoice" },
      { ...SOURCES[1], status: "cancelled" },
    ]) {
      mocks.admin = client({ tenants: { registration_number: null }, documents: [SOURCES[0], bad] });
      const res = await POST(req("POST", body));
      expect(res.status).toBe(400);
      expect(mocks.admin.calls.insert).toBeUndefined();
      expect(mocks.sync).not.toHaveBeenCalled();
    }
    // 見つからない元帳票（他テナント・削除済み）が混じっていても拒否する
    mocks.admin = client({ tenants: { registration_number: null }, documents: [SOURCES[0]] });
    expect((await POST(req("POST", body))).status).toBe(400);
  });
});
