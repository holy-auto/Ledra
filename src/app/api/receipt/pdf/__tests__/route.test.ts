/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/receipt/pdf — **doc_type='receipt' 以外を絶対に出さない**ことの回帰テスト。
 *
 * なぜこのテストが要るか: `documents` は領収書だけの表ではない。請求書・見積書・
 * 発注書が同じ表に doc_type で同居している。このルートは**認証なし**で
 * public_id だけを鍵に PDF を返すので、`.eq("doc_type", "receipt")` が1行消えた
 * 瞬間に、public_id が付いた請求書が誰でも取れるようになる。
 * 型でもコンパイルでも lint でも捕まらない種類の穴なので、ここで止める。
 *
 * ガード自体は findPublicReceipt()（src/lib/receipts/publicReceipt.ts）に1箇所だけ
 * 置いてあり、公開ページ /receipt/[public_id] も同じ関数を通る。このテストは
 * その共有関数をルート越しに叩いている（＝両経路のガードを1本で守っている）。
 *
 * モックの `documents` は**フィルタを実際に適用する**。canned な行を返すだけの
 * モックにすると、ガードを外しても緑のままになりテストの意味が無い。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  renderDocumentPdf: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: () => "203.0.113.1",
}));
vi.mock("@/lib/pdfDocument", () => ({ renderDocumentPdf: mocks.renderDocumentPdf }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const TENANT = "tenant-1";

/** doc_type 違いの3行。public_id はすべて付いている（バックフィル後の本番と同じ形） */
const DOCUMENTS = [
  { id: "d-receipt", tenant_id: TENANT, doc_type: "receipt", doc_number: "RCP-202609-001", public_id: "tok-receipt", customer_id: null },
  { id: "d-invoice", tenant_id: TENANT, doc_type: "invoice", doc_number: "INV-202609-001", public_id: "tok-invoice", customer_id: null },
  { id: "d-estimate", tenant_id: TENANT, doc_type: "estimate", doc_number: "EST-202609-001", public_id: "tok-estimate", customer_id: null },
];

const TABLES: Record<string, any[]> = {
  documents: DOCUMENTS,
  tenants: [{ id: TENANT, name: "テスト整備", address: null, contact_email: null, contact_phone: null, registration_number: null, logo_asset_path: null, company_seal_path: null, bank_info: null }],
  customers: [],
};

/** `.eq()` を実際に積んで絞り込む最小の supabase-js もどき */
function query(rows: any[]) {
  const filters: [string, unknown][] = [];
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    },
    get rows() {
      return rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    },
    maybeSingle: () => Promise.resolve({ data: chain.rows[0] ?? null, error: null }),
    single: () =>
      Promise.resolve(
        chain.rows.length === 1
          ? { data: chain.rows[0], error: null }
          : { data: null, error: { message: "no rows" } },
      ),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({ from: (t: string) => query(TABLES[t] ?? []) }),
}));

import { GET } from "../route";

const call = (rid: string) =>
  GET(new Request(`http://localhost/api/receipt/pdf?rid=${encodeURIComponent(rid)}`) as any);

beforeEach(() => {
  mocks.checkRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 });
  mocks.renderDocumentPdf.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4 test"));
});

describe("GET /api/receipt/pdf", () => {
  it("領収書は PDF を返す", async () => {
    const res = await call("tok-receipt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("RCP-202609-001.pdf");
    // 検索エンジンに載せない
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("**請求書は 404。**public_id が正しくても doc_type が違えば出さない", async () => {
    const res = await call("tok-invoice");
    expect(res.status).toBe(404);
    expect(mocks.renderDocumentPdf).not.toHaveBeenCalled();
  });

  it("**見積書も 404。**", async () => {
    const res = await call("tok-estimate");
    expect(res.status).toBe(404);
    expect(mocks.renderDocumentPdf).not.toHaveBeenCalled();
  });

  it("存在しない public_id も 404（『領収書ではない』と区別しない）", async () => {
    expect((await call("tok-nope")).status).toBe(404);
  });

  it("rid が無ければ DB を引く前に 404", async () => {
    const res = await GET(new Request("http://localhost/api/receipt/pdf") as any);
    expect(res.status).toBe(404);
  });

  it("レート制限に掛かったら 429 と Retry-After", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 42 });
    const res = await call("tok-receipt");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(mocks.renderDocumentPdf).not.toHaveBeenCalled();
  });

  it("PDF 生成が落ちても 500 で止める（例外を外に投げない）", async () => {
    mocks.renderDocumentPdf.mockRejectedValue(new Error("boom"));
    expect((await call("tok-receipt")).status).toBe(500);
  });
});
