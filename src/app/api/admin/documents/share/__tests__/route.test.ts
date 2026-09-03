/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/documents/share の追加帳票同封（additional_document_ids）を検証する。
 *
 * 主眼: 追加帳票は主帳票と同じ顧客のものだけに絞られること
 * （他顧客の帳票詳細がメールに混ざったり、無関係に draft→sent されたりしない）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;

function makeQueryBuilder(getRows: () => Row[]) {
  let filtered = getRows();
  let pendingUpdate: Row | null = null;
  const applyAndGet = () => {
    if (pendingUpdate) filtered.forEach((r) => Object.assign(r, pendingUpdate));
    return filtered;
  };
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      filtered = filtered.filter((r) => vals.includes(r[col]));
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      const dir = opts?.ascending === false ? -1 : 1;
      filtered = [...filtered].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * dir);
      return builder;
    },
    limit: (n: number) => {
      filtered = filtered.slice(0, n);
      return builder;
    },
    update: (patch: Row) => {
      pendingUpdate = patch;
      return builder;
    },
    insert: async () => ({ data: null, error: null }),
    single: async () => {
      const rows = applyAndGet();
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows" } };
    },
    maybeSingle: async () => {
      const rows = applyAndGet();
      return { data: rows[0] ?? null, error: null };
    },
    then: (resolve: any, reject: any) => Promise.resolve({ data: applyAndGet(), error: null }).then(resolve, reject),
  };
  return builder;
}

function makeSupabase(tables: Record<string, Row[]>) {
  return { from: (table: string) => makeQueryBuilder(() => tables[table] ?? []) };
}

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  sendDocumentEmail: vi.fn(),
  sendDocumentLink: vi.fn(),
  sendSMS: vi.fn(),
  renderAndStoreDocumentPdf: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createSupabaseServerClient }));
// モジュールごと差し替えると requireMinRole が undefined になり、ルートのガードが
// TypeError → 500 になる。実物は残して解決だけ差し替える。
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCaller,
}));
vi.mock("@/lib/documents/share-email", () => ({ sendDocumentEmail: mocks.sendDocumentEmail }));
vi.mock("@/lib/line/client", () => ({ sendDocumentLink: mocks.sendDocumentLink }));
vi.mock("@/lib/sms/client", () => ({ sendSMS: mocks.sendSMS }));
// PDF レンダリング/保存は実行時に @react-pdf/renderer + Storage を叩くのでモックする。
vi.mock("@/lib/documents/pdfShare", () => ({ renderAndStoreDocumentPdf: mocks.renderAndStoreDocumentPdf }));

let tables: Record<string, Row[]>;
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: (tenantId: string) => ({ admin: makeSupabase(tables), tenantId }),
}));

import { GET, POST } from "@/app/api/admin/documents/share/route";

function req(body: unknown) {
  return new Request("http://localhost/api/admin/documents/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440000";
const DOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // 主帳票 (顧客1)
const DOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // 同一顧客の帳票
const DOC_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // 別顧客の帳票

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.resolveCaller.mockResolvedValue({ userId: "user-1", tenantId: TENANT_ID, role: "admin" });
  mocks.sendDocumentEmail.mockResolvedValue(true);
  mocks.renderAndStoreDocumentPdf.mockResolvedValue("https://signed.example/doc.pdf");

  tables = {
    documents: [
      {
        id: DOC_A,
        tenant_id: TENANT_ID,
        customer_id: "cust-1",
        recipient_name: null,
        doc_type: "invoice",
        doc_number: "INV-001",
        status: "draft",
        total: 10000,
      },
      {
        id: DOC_B,
        tenant_id: TENANT_ID,
        customer_id: "cust-1",
        recipient_name: null,
        doc_type: "estimate",
        doc_number: "EST-002",
        status: "draft",
        total: 5000,
      },
      {
        id: DOC_C,
        tenant_id: TENANT_ID,
        customer_id: "cust-2",
        recipient_name: null,
        doc_type: "invoice",
        doc_number: "INV-999",
        status: "draft",
        total: 99999,
      },
    ],
    tenants: [{ id: TENANT_ID, name: "Test Tenant" }],
    customers: [
      { id: "cust-1", name: "Customer One" },
      { id: "cust-2", name: "Customer Two" },
    ],
  };
  mocks.createSupabaseServerClient.mockResolvedValue(makeSupabase(tables));
});

describe("POST /api/admin/documents/share — additional_document_ids", () => {
  it("同一顧客の追加帳票だけを同封し、他顧客の帳票は除外する", async () => {
    const res = (await POST(
      req({
        document_id: DOC_A,
        channel: "email",
        recipient: "customer@example.com",
        additional_document_ids: [DOC_B, DOC_C],
      }),
    )) as Response;

    expect(res.status).toBe(200);
    const json = await res.json();

    // 他顧客 (DOC_C) は同封されない
    expect(json.shared_document_ids).toEqual(expect.arrayContaining([DOC_A, DOC_B]));
    expect(json.shared_document_ids).not.toContain(DOC_C);

    const emailArgs = mocks.sendDocumentEmail.mock.calls[0][0];
    expect(emailArgs.additionalDocuments).toEqual([{ docType: "見積書", docNumber: "EST-002", totalAmount: 5000 }]);
  });

  it("除外された他顧客の帳票の draft ステータスは変更されない", async () => {
    await POST(
      req({
        document_id: DOC_A,
        channel: "email",
        recipient: "customer@example.com",
        additional_document_ids: [DOC_B, DOC_C],
      }),
    );

    const docC = tables.documents.find((d) => d.id === DOC_C)!;
    const docA = tables.documents.find((d) => d.id === DOC_A)!;
    const docB = tables.documents.find((d) => d.id === DOC_B)!;

    expect(docC.status).toBe("draft"); // 無関係な帳票は変更されない
    expect(docA.status).toBe("sent");
    expect(docB.status).toBe("sent");
  });

  it("LINE/SMS チャンネルでは additional_document_ids を無視する", async () => {
    mocks.sendDocumentLink.mockResolvedValue(true);
    const res = (await POST(
      req({
        document_id: DOC_A,
        channel: "line",
        recipient: "U1234567890",
        additional_document_ids: [DOC_B],
      }),
    )) as Response;

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shared_document_ids).toEqual([DOC_A]);
  });

  it("LINE 送付時に PDF 署名 URL を sendDocumentLink へ渡す", async () => {
    mocks.sendDocumentLink.mockResolvedValue(true);
    const res = (await POST(req({ document_id: DOC_A, channel: "line", recipient: "U1234567890" }))) as Response;

    expect(res.status).toBe(200);
    const lineArgs = mocks.sendDocumentLink.mock.calls[0][0];
    expect(lineArgs.pdfUrl).toBe("https://signed.example/doc.pdf");
  });

  it("PDF 生成に失敗 (null) しても本文だけで送信は成功する", async () => {
    mocks.renderAndStoreDocumentPdf.mockResolvedValue(null);
    mocks.sendDocumentLink.mockResolvedValue(true);
    const res = (await POST(req({ document_id: DOC_A, channel: "line", recipient: "U1234567890" }))) as Response;

    expect(res.status).toBe(200);
    const lineArgs = mocks.sendDocumentLink.mock.calls[0][0];
    expect(lineArgs.pdfUrl).toBeUndefined();
  });
});

describe("GET /api/admin/documents/share — 送付履歴", () => {
  function getReq(qs: string) {
    return new Request(`http://localhost/api/admin/documents/share?${qs}`) as any;
  }

  it("指定帳票の送付ログを新しい順で返す（テナント・帳票で絞り込み）", async () => {
    tables.document_share_log = [
      {
        id: "old",
        document_id: DOC_A,
        tenant_id: TENANT_ID,
        channel: "email",
        recipient: "a@example.com",
        status: "sent",
        sent_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "new",
        document_id: DOC_A,
        tenant_id: TENANT_ID,
        channel: "sms",
        recipient: "090",
        status: "failed",
        sent_at: "2026-08-05T00:00:00Z",
      },
      {
        id: "other-doc",
        document_id: DOC_B,
        tenant_id: TENANT_ID,
        channel: "line",
        recipient: "U999",
        status: "sent",
        sent_at: "2026-08-09T00:00:00Z",
      },
    ];

    const res = (await GET(getReq(`document_id=${DOC_A}`))) as Response;
    expect(res.status).toBe(200);
    const json = await res.json();
    // DOC_A のログのみ、新しい順（new → old）。他帳票 (other-doc) は含まない。
    expect(json.shares.map((s: { id: string }) => s.id)).toEqual(["new", "old"]);
  });

  it("document_id が UUID でなければ 400", async () => {
    const res = (await GET(getReq("document_id=not-a-uuid"))) as Response;
    expect(res.status).toBe(400);
  });
});
