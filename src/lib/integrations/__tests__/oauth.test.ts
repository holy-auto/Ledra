import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createTenantScopedAdmin: vi.fn(),
  buildSecretWrite: vi.fn(),
  tenantUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/crypto/tenantSecrets", () => ({
  buildSecretWrite: mocks.buildSecretWrite,
  readSecret: vi.fn(),
}));

import { buildAuthorizeUrl, buildRedirectUri, exchangeCodeForToken, OAuthExchangeError } from "../oauth";
import { createOAuthState, verifyOAuthState } from "../oauthState";
import { isSlackIncomingWebhookUrl } from "../slackWebhookUrl";
import { slackProvider } from "../providers/slack";
import type { OAuthProviderSpec } from "../types";

const SPEC: OAuthProviderSpec = {
  id: "demo",
  label: "Demo",
  summary: "テスト用",
  authorizeUrl: "https://example.test/oauth/authorize",
  tokenUrl: "https://example.test/oauth/token",
  scopes: ["read", "write"],
  clientIdEnv: "DEMO_CLIENT_ID",
  clientSecretEnv: "DEMO_CLIENT_SECRET",
  extraAuthParams: { access_type: "offline" },
  storeTokens: true,
  returnPath: "/admin/settings/connections",
};

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.createTenantScopedAdmin.mockReset();
  mocks.buildSecretWrite.mockReset();
  mocks.tenantUpdate.mockReset();

  // tenants.update(...).eq(...) を最小限で模す
  mocks.tenantUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mocks.createTenantScopedAdmin.mockReturnValue({
    admin: { from: () => ({ update: mocks.tenantUpdate }) },
    tenantId: "t1",
  });
  mocks.buildSecretWrite.mockImplementation(async (v: string | null) => ({
    ciphertext: v ? `enc(${v})` : null,
  }));

  // 32 文字以上（下の「短い鍵は拒否」テストの対になる正常値）
  process.env.INTEGRATION_OAUTH_STATE_SECRET = "test-state-secret-0123456789abcdef";
});

describe("buildRedirectUri / buildAuthorizeUrl", () => {
  it("redirect_uri は共通ルートを指し、末尾スラッシュを潰す", () => {
    expect(buildRedirectUri("https://app.test/", "slack")).toBe("https://app.test/api/admin/connect/slack/callback");
  });

  it("認可 URL に client_id / scope / state / extraAuthParams が載る", () => {
    const url = new URL(
      buildAuthorizeUrl(SPEC, {
        state: "st4te",
        clientId: "cid",
        redirectUri: "https://app.test/api/admin/connect/demo/callback",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://example.test/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(url.searchParams.get("state")).toBe("st4te");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/api/admin/connect/demo/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });
});

describe("exchangeCodeForToken", () => {
  it("form-encoded で POST し、JSON を返す", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ access_token: "at" }), { status: 200 }));

    const token = await exchangeCodeForToken(SPEC, {
      code: "c0de",
      redirectUri: "https://app.test/cb",
      clientId: "cid",
      clientSecret: "secret",
    });

    expect(token.access_token).toBe("at");
    const [, init] = fetchSpy.mock.calls[0];
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("c0de");
    expect(body.get("redirect_uri")).toBe("https://app.test/cb");
  });

  it("HTTP エラーは OAuthExchangeError になる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 400 }));
    await expect(
      exchangeCodeForToken(SPEC, { code: "c", redirectUri: "r", clientId: "i", clientSecret: "s" }),
    ).rejects.toBeInstanceOf(OAuthExchangeError);
  });
});

describe("oauthState", () => {
  it("同じ provider なら tenantId を復元できる", () => {
    const state = createOAuthState({ tenantId: "t1", provider: "slack" });
    expect(verifyOAuthState({ state, provider: "slack" })).toEqual({ ok: true, tenantId: "t1" });
  });

  it("provider が違う state は拒否する（連携先をまたいだ使い回しを防ぐ）", () => {
    const state = createOAuthState({ tenantId: "t1", provider: "slack" });
    expect(verifyOAuthState({ state, provider: "freee" })).toEqual({ ok: false, reason: "provider_mismatch" });
  });

  it("payload を改竄した state は署名検証で落ちる", () => {
    const state = createOAuthState({ tenantId: "t1", provider: "slack" });
    const [, sig] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ tenantId: "attacker", provider: "slack", nonce: "n", exp: 9999999999 }),
      "utf8",
    ).toString("base64url");
    expect(verifyOAuthState({ state: `${forged}.${sig}`, provider: "slack" })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("期限切れの state は拒否する", () => {
    const state = createOAuthState({ tenantId: "t1", provider: "slack", ttlSeconds: -1 });
    expect(verifyOAuthState({ state, provider: "slack" })).toEqual({ ok: false, reason: "expired" });
  });

  it("署名鍵が短すぎる場合は発行も検証も通さない", () => {
    const valid = createOAuthState({ tenantId: "t1", provider: "slack" });
    process.env.INTEGRATION_OAUTH_STATE_SECRET = "short";
    expect(() => createOAuthState({ tenantId: "t1", provider: "slack" })).toThrow(/at least 32/);
    expect(verifyOAuthState({ state: valid, provider: "slack" })).toEqual({
      ok: false,
      reason: "misconfigured_secret",
    });
  });
});

describe("isSlackIncomingWebhookUrl", () => {
  it.each([
    ["https://hooks.slack.com/services/T/B/X", true],
    ["http://hooks.slack.com/services/T/B/X", false],
    ["https://hooks.slack.com.evil.test/services/T", false],
    ["https://hooks.slack.com/other/T", false],
    ["not-a-url", false],
  ])("%s → %s", (url, expected) => {
    expect(isSlackIncomingWebhookUrl(url)).toBe(expected);
  });
});

describe("slackProvider.onConnected", () => {
  const ok = {
    ok: true,
    team: { id: "T1", name: "HOLY" },
    incoming_webhook: { url: "https://hooks.slack.com/services/T/B/X", channel: "#booking" },
  };

  it("webhook URL を暗号化して tenants に保存し、表示用メタだけ返す", async () => {
    const info = await slackProvider.onConnected!({ tenantId: "t1", token: ok });

    expect(mocks.buildSecretWrite).toHaveBeenCalledWith("https://hooks.slack.com/services/T/B/X");
    expect(mocks.tenantUpdate).toHaveBeenCalledWith({
      booking_notify_slack_webhook_ciphertext: "enc(https://hooks.slack.com/services/T/B/X)",
    });
    expect(info.externalAccountId).toBe("T1");
    expect(info.externalAccountName).toBe("HOLY");
    expect(info.metadata).toEqual({ channel: "#booking" });
    // 秘密情報 (webhook URL) を metadata に載せていないこと
    expect(JSON.stringify(info.metadata)).not.toContain("hooks.slack.com");
  });

  it("Slack が ok:false を返したら保存せずに落とす（HTTP 200 でもエラー）", async () => {
    await expect(
      slackProvider.onConnected!({ tenantId: "t1", token: { ok: false, error: "invalid_code" } }),
    ).rejects.toThrow(/invalid_code/);
    expect(mocks.tenantUpdate).not.toHaveBeenCalled();
  });

  it("hooks.slack.com 以外の URL を返されたら保存しない（データ流出シンク対策）", async () => {
    await expect(
      slackProvider.onConnected!({
        tenantId: "t1",
        token: { ...ok, incoming_webhook: { url: "https://evil.test/collect" } },
      }),
    ).rejects.toThrow();
    expect(mocks.tenantUpdate).not.toHaveBeenCalled();
  });

  it("連携解除で webhook 列を null にする（通知が飛び続けない）", async () => {
    await slackProvider.onDisconnect!({ tenantId: "t1" });
    expect(mocks.tenantUpdate).toHaveBeenCalledWith({ booking_notify_slack_webhook_ciphertext: null });
  });
});
