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

    const result = await sendDocumentEmail({
      to: "customer@example.com",
      docType: "請求書",
      docNumber: "INV-001",
      totalAmount: 10000,
      recipientName: "山田太郎",
      senderName: "株式会社テスト",
    });

    expect(result.ok).toBe(true);
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

    const result = await sendDocumentEmail({
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

    expect(result.ok).toBe(true);
    expect(body!.subject).toBe("[株式会社テスト] 請求書 INV-001 他2件のご送付");
    expect(body!.html).toContain("<table");
    expect(body!.html).toContain("INV-001");
    expect(body!.html).toContain("EST-002");
    expect(body!.html).toContain("DLV-003");
  });

  // 回帰テスト: プロバイダ側の失敗理由が result.error に残ること
  // (以前は真偽値だけ返し、失敗理由が document_share_log にも API 応答にも
  // 一切残らず "送信に失敗しました" だけになっていた。本番でこの状態が起きて
  // 実際の原因を追えなかった不具合の再発防止)。
  it("Resend が失敗した場合、result.ok=false かつ result.error に実際の理由が残る", async () => {
    globalThis.fetch = vi.fn(async () => new Response("Invalid API key", { status: 401 })) as never;

    const result = await sendDocumentEmail({
      to: "customer@example.com",
      docType: "請求書",
      docNumber: "INV-001",
      totalAmount: 10000,
      recipientName: "山田太郎",
      senderName: "株式会社テスト",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("resend");
    expect(result.error).toContain("Invalid API key");
  });

  // 回帰テスト: Resend/SendGrid 両方失敗した場合、sendEmail() が既に
  // "resend:... | sendgrid:..." の形でプロバイダ名をタグ済みの理由を返す。
  // ここでさらに provider を前置すると "sendgrid:resend:... | sendgrid:..." と
  // 二重表示になっていた不具合の再発防止。
  it("Resend/SendGrid 両方失敗した場合、理由が二重にタグ付けされない", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "sg_test_key");
    globalThis.fetch = vi.fn(async (url: unknown) => {
      if (String(url).includes("sendgrid.com")) {
        return new Response("SendGrid down", { status: 503 });
      }
      return new Response("Resend down", { status: 503 });
    }) as never;

    const result = await sendDocumentEmail({
      to: "customer@example.com",
      docType: "請求書",
      docNumber: "INV-001",
      totalAmount: 10000,
      recipientName: "山田太郎",
      senderName: "株式会社テスト",
    });

    expect(result.ok).toBe(false);
    expect(result.error).not.toMatch(/^sendgrid:resend:/);
    expect(result.error).toContain("resend:");
    expect(result.error).toContain("sendgrid:");
  });

  it("RESEND_API_KEY/RESEND_FROM が未設定の場合も理由付きで失敗を返す", async () => {
    vi.unstubAllEnvs();

    const result = await sendDocumentEmail({
      to: "customer@example.com",
      docType: "請求書",
      docNumber: "INV-001",
      totalAmount: 10000,
      recipientName: "山田太郎",
      senderName: "株式会社テスト",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/RESEND_API_KEY|RESEND_FROM/);
  });
});
