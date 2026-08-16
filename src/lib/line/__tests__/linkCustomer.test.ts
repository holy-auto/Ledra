/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// LINE 連携完了時の「マイページ URL 案内」を検証する。
// 検証の要点は 3 つ:
//   1. 案内本文に単回使用トークン付きのログイン URL が入る (email 不要で入れること)
//   2. 送れない条件 (APP_URL 未設定 / tenant 不明) では壊れたリンクを送らず見送る
//   3. 連携コード経路 (無料の応答メッセージへ同梱) では有料プッシュを二重に送らない

const mocks = vi.hoisted(() => ({
  createServiceRoleAdmin: vi.fn(),
  enqueueLineHistoryImport: vi.fn(),
  sendCustomerLineText: vi.fn(),
  issuePortalLoginToken: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: mocks.createServiceRoleAdmin }));
vi.mock("@/lib/qstash/publish", () => ({ enqueueLineHistoryImport: mocks.enqueueLineHistoryImport }));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: mocks.sendCustomerLineText }));
vi.mock("@/lib/customerPortalLineLogin", () => ({ issuePortalLoginToken: mocks.issuePortalLoginToken }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { buildPortalWelcomeText, linkLineUserToCustomer } from "@/lib/line/linkCustomer";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-2222-2222-222222222222";
const LINE_USER = "Uabcdef0123456789abcdef0123456789";

/**
 * 最小の fluent モック。
 *  - tenants.maybeSingle()   → { name }（name: null で「tenant が引けない」ケース）
 *  - customers.maybeSingle() → { line_user_id }（既存の紐づけ = 再連携ケース）
 *  - update 系チェーン (await) → { error: null, count: 0 }
 */
function adminMock(opts: { shopName?: string | null; lineUserId?: string | null; linkedAfter?: string | null } = {}) {
  return {
    from(table: string) {
      let cols = "";
      const b: any = {
        select: (c?: string) => {
          cols = c ?? "";
          return b;
        },
        update: () => b,
        eq: () => b,
        is: () => b,
        maybeSingle: async () => {
          if (table === "tenants") {
            return { data: opts.shopName === null ? null : { name: opts.shopName ?? "デモ整備" }, error: null };
          }
          // 案内の組み立て (email も一緒に読む) は連携が済んだ後の状態を返す。
          // 連携前の確認 (line_user_id だけ) とは別物なので select の列で見分ける。
          if (cols.includes("email")) {
            return {
              data: { email: null, line_user_id: opts.linkedAfter === undefined ? LINE_USER : opts.linkedAfter },
              error: null,
            };
          }
          return { data: { line_user_id: opts.lineUserId ?? null }, error: null };
        },
        then: (resolve: (v: any) => void) => resolve({ error: null, count: 0 }),
      };
      return b;
    },
  };
}

const TOKEN = "a".repeat(64);

const URL_ENV_KEYS = ["NEXT_PUBLIC_APP_URL", "APP_URL", "NEXT_PUBLIC_BASE_URL"] as const;
const ORIGINAL_URL_ENV = Object.fromEntries(URL_ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of URL_ENV_KEYS) delete process.env[k];
  process.env.NEXT_PUBLIC_APP_URL = "https://app.ledra.co.jp";
  mocks.createServiceRoleAdmin.mockReturnValue(adminMock());
  mocks.enqueueLineHistoryImport.mockResolvedValue(undefined);
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.issuePortalLoginToken.mockResolvedValue(TOKEN);
});

afterEach(() => {
  for (const k of URL_ENV_KEYS) {
    const original = ORIGINAL_URL_ENV[k];
    if (original === undefined) delete process.env[k];
    else process.env[k] = original;
  }
});

describe("buildPortalWelcomeText", () => {
  it("単回使用トークン付きのログイン URL と店舗名を含む案内を返す", async () => {
    const text = await buildPortalWelcomeText(TENANT, CUSTOMER);

    expect(text).toContain(`https://app.ledra.co.jp/my/line?t=${TOKEN}`);
    expect(text).toContain("デモ整備");
    expect(mocks.issuePortalLoginToken).toHaveBeenCalledWith(TENANT, CUSTOMER);
  });

  it("email を要求しない (email 無しの顧客もこのリンクから入れる)", async () => {
    // customers から email を読まない = email の有無で分岐しないことの担保。
    const text = await buildPortalWelcomeText(TENANT, CUSTOMER);
    expect(text).toContain("/my/line?t=");
  });

  it("APP_URL 末尾のスラッシュを重複させない", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.ledra.co.jp/";
    const text = await buildPortalWelcomeText(TENANT, CUSTOMER);
    expect(text).toContain(`https://app.ledra.co.jp/my/line?t=${TOKEN}`);
  });

  it("NEXT_PUBLIC_APP_URL が無くても APP_URL にフォールバックする", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.APP_URL = "https://app.ledra.co.jp";
    const text = await buildPortalWelcomeText(TENANT, CUSTOMER);
    expect(text).toContain(`https://app.ledra.co.jp/my/line?t=${TOKEN}`);
  });

  it("base URL がどれも未設定なら null (壊れた相対リンクを送らない)", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    expect(await buildPortalWelcomeText(TENANT, CUSTOMER)).toBeNull();
    // 送らないと決めた時点でトークンを無駄に発行しない。
    expect(mocks.issuePortalLoginToken).not.toHaveBeenCalled();
  });

  it("tenant が引けなければ null", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ shopName: null }));
    expect(await buildPortalWelcomeText(TENANT, CUSTOMER)).toBeNull();
    expect(mocks.issuePortalLoginToken).not.toHaveBeenCalled();
  });

  it("宛先が現在の連携相手でなければトークンを作らず null (敗者にログインURLを渡さない)", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ linkedAfter: "Uother0000000000000000000000000000" }));

    expect(await buildPortalWelcomeText(TENANT, CUSTOMER, LINE_USER)).toBeNull();
    expect(mocks.issuePortalLoginToken).not.toHaveBeenCalled();
  });

  it("宛先が現在の連携相手なら発行する", async () => {
    const text = await buildPortalWelcomeText(TENANT, CUSTOMER, LINE_USER);
    expect(text).toContain(`/my/line?t=${TOKEN}`);
  });
});

describe("linkLineUserToCustomer", () => {
  it("連携成立時にマイページ案内を LINE で送る", async () => {
    const res = await linkLineUserToCustomer({ tenantId: TENANT, customerId: CUSTOMER, lineUserId: LINE_USER });

    expect(res.ok).toBe(true);
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain(`/my/line?t=${TOKEN}`);
  });

  it("suppressPortalMessage=true ならプッシュを送らない (応答メッセージ側で同梱するため)", async () => {
    await linkLineUserToCustomer({
      tenantId: TENANT,
      customerId: CUSTOMER,
      lineUserId: LINE_USER,
      suppressPortalMessage: true,
    });

    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("既に同じ LINE ユーザーで連携済みなら送らない (再連携での二重送信・二重課金を防ぐ)", async () => {
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ lineUserId: LINE_USER }));

    const res = await linkLineUserToCustomer({ tenantId: TENANT, customerId: CUSTOMER, lineUserId: LINE_USER });

    expect(res.ok).toBe(true);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("案内が届かなくても連携自体は成功として返す", async () => {
    // 実際の sendCustomerLineText は内部で例外を捕まえて false を返す (throw しない)。
    mocks.sendCustomerLineText.mockResolvedValue(false);

    const res = await linkLineUserToCustomer({ tenantId: TENANT, customerId: CUSTOMER, lineUserId: LINE_USER });

    expect(res.ok).toBe(true);
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
  });
});
