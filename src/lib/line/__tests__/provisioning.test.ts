import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  issueChannelAccessToken,
  isLineTokenExpiringSoon,
  provisionLineChannel,
  verifyWithExistingToken,
  LineApiError,
} from "../provisioning";

const WEBHOOK_URL = "https://app.test/api/line/webhook?tenant_id=t1";

/**
 * fetch スタブ。キーは path、または "GET /path" のようにメソッド付きで書ける。
 * webhook endpoint は GET と PUT で同じ path を使うため、メソッド指定が要る。
 */
function stubFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const key =
      Object.keys(routes).find(
        (k) => k.includes(" ") && k === `${method} ${k.split(" ")[1]}` && url.includes(k.split(" ")[1]),
      ) ?? Object.keys(routes).find((k) => !k.includes(" ") && url.includes(k));
    if (!key) throw new Error(`unexpected fetch: ${method} ${url}`);
    const { status = 200, body = {} } = routes[key];
    return new Response(JSON.stringify(body), { status });
  });
}

const OK_ROUTES = {
  "/v2/oauth/accessToken": { body: { access_token: "tok", expires_in: 2592000 } },
  "/v2/bot/info": { body: { basicId: "@abc", displayName: "テスト店", chatMode: "bot" } },
  "/v2/bot/channel/webhook/endpoint": { body: { endpoint: WEBHOOK_URL, active: true } },
  "/v2/bot/channel/webhook/test": { body: { success: true, statusCode: 200 } },
};

beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-08-16T00:00:00Z")));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("issueChannelAccessToken", () => {
  it("Channel ID / Secret を client_credentials で送り、失効時刻を計算して返す", async () => {
    const f = stubFetch(OK_ROUTES);
    const token = await issueChannelAccessToken("1234567890", "sec");

    expect(token.accessToken).toBe("tok");
    // 2592000 秒 = 30 日後
    expect(token.expiresAt).toBe("2026-09-15T00:00:00.000Z");

    const [, init] = f.mock.calls[0];
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("1234567890");
    expect(body.get("client_secret")).toBe("sec");
  });

  it("expires_in が壊れていても失効扱いにせず 30 日として保存する", async () => {
    stubFetch({ "/v2/oauth/accessToken": { body: { access_token: "tok" } } });
    const token = await issueChannelAccessToken("1", "s");
    expect(token.expiresAt).toBe("2026-09-15T00:00:00.000Z");
  });

  it("401 は「ID/Secret が違う」と分かる日本語で返す", async () => {
    stubFetch({ "/v2/oauth/accessToken": { status: 401, body: {} } });
    await expect(issueChannelAccessToken("1", "s")).rejects.toThrow(/Channel ID または Channel Secret/);
  });
});

describe("provisionLineChannel", () => {
  it("トークン発行 → 疎通確認 → Webhook設定 → 配送テストまで行い、手作業ゼロなら manualSteps は空", async () => {
    const f = stubFetch(OK_ROUTES);
    const r = await provisionLineChannel({ channelId: "1", channelSecret: "s", webhookUrl: WEBHOOK_URL });

    expect(r.bot.displayName).toBe("テスト店");
    expect(r.webhook.active).toBe(true);
    expect(r.test.success).toBe(true);
    expect(r.manualSteps).toEqual([]);

    // Webhook URL を PUT で実際に設定していること（加盟店の貼り戻しを消す肝）
    const put = f.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put).toBeDefined();
    expect(JSON.parse(put![1]!.body as string)).toEqual({ endpoint: WEBHOOK_URL });
  });

  it("Webhookの利用がOFFなら、ONにする案内だけを出す（URLの貼り付けは案内しない）", async () => {
    stubFetch({
      ...OK_ROUTES,
      "/v2/bot/channel/webhook/endpoint": { body: { endpoint: WEBHOOK_URL, active: false } },
    });
    const r = await provisionLineChannel({ channelId: "1", channelSecret: "s", webhookUrl: WEBHOOK_URL });
    expect(r.manualSteps).toHaveLength(1);
    expect(r.manualSteps[0]).toMatch(/Webhookの利用」をON/);
    expect(r.manualSteps[0]).toMatch(/URLはLedraが設定済み/);
  });

  it("応答モードが chat なら Bot への切替を案内する", async () => {
    stubFetch({
      ...OK_ROUTES,
      "/v2/bot/info": { body: { basicId: "@abc", displayName: "店", chatMode: "chat" } },
    });
    const r = await provisionLineChannel({ channelId: "1", channelSecret: "s", webhookUrl: WEBHOOK_URL });
    expect(r.manualSteps.some((s) => s.includes("応答モード"))).toBe(true);
  });

  it("Webhookが有効なのに配送テストが失敗したら、その事実を案内に出す", async () => {
    stubFetch({
      ...OK_ROUTES,
      "/v2/bot/channel/webhook/test": { body: { success: false, statusCode: 500 } },
    });
    const r = await provisionLineChannel({ channelId: "1", channelSecret: "s", webhookUrl: WEBHOOK_URL });
    expect(r.manualSteps.some((s) => s.includes("配送テストが失敗") && s.includes("500"))).toBe(true);
  });

  it("設定直後の GET が 404 でも例外にせず「未設定」として扱う", async () => {
    stubFetch({
      ...OK_ROUTES,
      // PUT は成功、GET だけ 404（LINE は webhook 未設定時に 404 を返す）
      "GET /v2/bot/channel/webhook/endpoint": { status: 404, body: {} },
    });
    const r = await provisionLineChannel({ channelId: "1", channelSecret: "s", webhookUrl: WEBHOOK_URL });
    expect(r.webhook).toEqual({ endpoint: null, active: false });
  });

  it("トークンが LINE に拒否されたら LineApiError（保存に進ませない）", async () => {
    stubFetch({ ...OK_ROUTES, "/v2/bot/info": { status: 401, body: {} } });
    await expect(
      provisionLineChannel({ channelId: "1", channelSecret: "s", webhookUrl: WEBHOOK_URL }),
    ).rejects.toBeInstanceOf(LineApiError);
  });
});

describe("verifyWithExistingToken", () => {
  it("手入力の長期トークンは発行し直さず expiresAt=null（＝自動再発行の対象外）", async () => {
    const f = stubFetch(OK_ROUTES);
    const r = await verifyWithExistingToken("manual-token", WEBHOOK_URL);

    expect(r.token).toEqual({ accessToken: "manual-token", expiresAt: null });
    expect(f.mock.calls.some(([url]) => String(url).includes("/v2/oauth/accessToken"))).toBe(false);
  });
});

describe("isLineTokenExpiringSoon", () => {
  const now = new Date("2026-08-16T00:00:00Z");

  it.each([
    ["null（手入力の長期トークン）", null, false],
    ["undefined", undefined, false],
    ["パースできない値", "not-a-date", false],
    ["30日後", "2026-09-15T00:00:00Z", false],
    ["4日後", "2026-08-20T00:00:00Z", false],
    ["2日後", "2026-08-18T00:00:00Z", true],
    ["既に失効", "2026-08-01T00:00:00Z", true],
  ])("%s → %s", (_label, value, expected) => {
    expect(isLineTokenExpiringSoon(value as string | null | undefined, now)).toBe(expected);
  });
});
