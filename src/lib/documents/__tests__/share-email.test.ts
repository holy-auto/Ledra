import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendDocumentEmail } from "@/lib/documents/share-email";

describe("sendDocumentEmail", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "noreply@example.test");
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("単一帳票の場合は従来どおり単一ブロックのレイアウト・件名になる", async () => {
    let body: { subject: string; html: string } | null = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as never;

    const ok = await sendDocumentEmail({
      to: "customer@example.com",
      docType: "請求書",
      docNumber: "INV-001",
      totalAmount: 10000,
      recipientName: "山田太郎",
      senderName: "株式会社テスト",
    });

    expect(ok).toBe(true);
    expect(body!.subject).toBe("[株式会社テスト] 請求書 INV-001 のご送付");
    expect(body!.html).toContain("書類番号: <strong>INV-001</strong>");
    expect(body!.html).not.toContain("<table");
  });

  it("追加帳票がある場合はテーブル表示・件数入り件名になり、全帳票番号を含む", async () => {
    let body: { subject: string; html: string } | null = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ id: "msg_2" }), { status: 200 });
    }) as never;

    const ok = await sendDocumentEmail({
      to: "customer@example.com",
      docType: "請求書",
      docNumber: "INV-001",
      totalAmount: 10000,
      recipientName: "山田太郎",
      senderName: "株式会社テスト",
      additionalDocuments: [
        { docType: "見積書", docNumber: "EST-002", totalAmount: 5000 },
        { docType: "納品書", docNumber: "DLV-003", totalAmount: 3000 },
      ],
    });

    expect(ok).toBe(true);
    expect(body!.subject).toBe("[株式会社テスト] 請求書 INV-001 他2件のご送付");
    expect(body!.html).toContain("<table");
    expect(body!.html).toContain("INV-001");
    expect(body!.html).toContain("EST-002");
    expect(body!.html).toContain("DLV-003");
  });
});
