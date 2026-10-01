import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dispatchNotification = vi.fn<(p: unknown) => Promise<void>>();
const notifySlack = vi.fn<(url: unknown, p: unknown) => Promise<void>>();
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: (p: unknown) => dispatchNotification(p) }));
vi.mock("@/lib/slack", () => ({ notifySlack: (u: unknown, p: unknown) => notifySlack(u, p) }));

import { sendDocumentEmail } from "@/lib/documents/share-email";
import { describeEmailError } from "@/lib/documents/emailError";

describe("sendDocumentEmail", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "noreply@example.test");
    dispatchNotification.mockClear();
    notifySlack.mockClear();
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
      tenantId: "t1",
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
      tenantId: "t1",
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
      tenantId: "t1",
      to: "customer@example.com",
      docType: "請求書",
      docNumber: "INV-001",
      totalAmount: 10000,
      recipientName: "山田太郎",
      senderName: "株式会社テスト",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("resend");
    expect(result.error).toContain("401"); // Codex 指摘: HTTPステータスも失われず残ること
    expect(result.error).toContain("Invalid API key");
  });

  // 回帰テスト: Resend/SendGrid 両方失敗した場合、sendEmail() が既に
  // "resend:... | sendgrid:..." の形でプロバイダ名をタグ済みの理由を返す。
  // ここでさらに provider を前置すると "sendgrid:resend:... | sendgrid:..." と
  // 二重表示になっていた不具合の再発防止。
  it("Resend/SendGrid 両方失敗した場合、理由が二重にタグ付けされない", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "sg_test_key");
    globalThis.fetch = vi.fn(async (url: unknown) => {
      // CodeQL: ホスト名の完全一致で判定する（部分文字列一致は他ホストで誤爆しうる）。
      if (new URL(String(url)).hostname === "api.sendgrid.com") {
        return new Response("SendGrid down", { status: 503 });
      }
      return new Response("Resend down", { status: 503 });
    }) as never;

    const result = await sendDocumentEmail({
      tenantId: "t1",
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
    // Codex 指摘: 両プロバイダ失敗時も、分かっている最終ステータス (sendgrid の503) が失われないこと
    expect(result.error).toContain("503");
  });

  it("RESEND_API_KEY/RESEND_FROM が未設定の場合も理由付きで失敗を返す", async () => {
    // Codex 指摘: unstubAllEnvs() はスタブ前の値（実行環境に本物の資格情報が
    // 入っていればその値）に戻すだけで「未設定」にはならない。空文字を明示的に
    // stub して確実に未設定を再現する（実際の Resend への通信を避ける）。
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM", "");

    const result = await sendDocumentEmail({
      tenantId: "t1",
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

  // 2026-09-13 本番で送付が失敗し続けたのに、送付履歴を開くまで誰も気づけなかった。
  // 失敗したら店の管理者（ベル）と運営（Slack）の両方へ知らせる。成功時は何も出さない。
  it("失敗時は店の管理者と運営に通知し、成功時は通知しない", async () => {
    vi.stubEnv("SLACK_OPS_ALERT_WEBHOOK_URL", "https://hooks.slack.test/ops");
    const domainError = JSON.stringify({
      statusCode: 403,
      message:
        "The ledra.co.jp domain is not verified. Please, add and verify your domain on https://resend.com/domains",
      name: "validation_error",
    });
    globalThis.fetch = vi.fn(async () => new Response(domainError, { status: 403 })) as never;

    const params = {
      tenantId: "t1",
      documentId: "doc1",
      to: "customer@example.com",
      docType: "請求書",
      docNumber: "INV-001",
      totalAmount: 10000,
      recipientName: "山田太郎",
      senderName: "株式会社テスト",
    };
    const failed = await sendDocumentEmail(params);

    expect(failed.ok).toBe(false);
    expect(dispatchNotification).toHaveBeenCalledTimes(1);
    expect(dispatchNotification.mock.calls[0][0]).toMatchObject({
      tenantId: "t1",
      type: "document_email_failed",
      linkPath: "/admin/documents/doc1",
    });
    expect((dispatchNotification.mock.calls[0][0] as { body: string }).body).toContain("未認証");
    expect(notifySlack).toHaveBeenCalledTimes(1);
    expect(notifySlack.mock.calls[0][0]).toBe("https://hooks.slack.test/ops");
    // 運営 Slack には宛先をマスクして載せ、生の理由を残す
    const slack = JSON.stringify(notifySlack.mock.calls[0][1]);
    expect(slack).not.toContain("customer@example.com");
    expect(slack).toContain("domain is not verified");

    dispatchNotification.mockClear();
    notifySlack.mockClear();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "m" }), { status: 200 })) as never;
    expect((await sendDocumentEmail(params)).ok).toBe(true);
    expect(dispatchNotification).not.toHaveBeenCalled();
    expect(notifySlack).not.toHaveBeenCalled();
  });
});

describe("describeEmailError", () => {
  it("本番で出た理由を日本語にし、未知の理由は汎用文言に落とす", () => {
    expect(
      describeEmailError('resend(403):{"statusCode":403,"message":"The ledra.co.jp domain is not verified."}'),
    ).toContain("送信元ドメイン");
    expect(describeEmailError("RESEND_API_KEY/RESEND_FROM が未設定です。")).toContain("設定が未完了");
    expect(describeEmailError("resend(401):Invalid API key")).toContain("認証に失敗");
    expect(describeEmailError("送信に失敗しました")).toBe("メールを送信できませんでした");
    expect(describeEmailError(null)).toBe("メールを送信できませんでした");
  });
});
