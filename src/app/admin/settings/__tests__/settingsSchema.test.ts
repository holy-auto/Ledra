import { describe, expect, it } from "vitest";
import { settingsSchema } from "../settingsSchema";

describe("settingsSchema (テナント設定フォームの入力検証)", () => {
  it("店舗名は必須（空・空白のみは弾く）", () => {
    expect(settingsSchema.safeParse({ name: "" }).success).toBe(false);
    expect(settingsSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(settingsSchema.safeParse({ name: "ホーリー整備" }).success).toBe(true);
  });

  it("未送信の任意項目は undefined のまま素通しする（列存在フェイルセーフ）", () => {
    const r = settingsSchema.safeParse({ name: "店" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contact_email).toBeUndefined();
  });

  it("空文字の任意項目は許容する（クリア入力）", () => {
    const r = settingsSchema.safeParse({ name: "店", contact_email: "", website_url: "" });
    expect(r.success).toBe(true);
  });

  it("不正なメール / URL は弾く", () => {
    expect(settingsSchema.safeParse({ name: "店", contact_email: "not-an-email" }).success).toBe(false);
    expect(settingsSchema.safeParse({ name: "店", website_url: "javascript:alert(1)" }).success).toBe(false);
    expect(settingsSchema.safeParse({ name: "店", contact_email: "a@b.jp" }).success).toBe(true);
    expect(settingsSchema.safeParse({ name: "店", website_url: "https://ledra.co.jp" }).success).toBe(true);
  });

  it("長さ上限を超える入力は弾く（過大ペイロード防止）", () => {
    expect(settingsSchema.safeParse({ name: "あ".repeat(121) }).success).toBe(false);
    expect(settingsSchema.safeParse({ name: "店", address: "あ".repeat(301) }).success).toBe(false);
    expect(settingsSchema.safeParse({ name: "店", registration_number: "1".repeat(101) }).success).toBe(false);
  });

  it("予約通知のSlack Webhook URLはhttps以外・不正なURLを弾く", () => {
    expect(settingsSchema.safeParse({ name: "店", booking_notify_slack_webhook_url: "" }).success).toBe(true);
    expect(
      settingsSchema.safeParse({ name: "店", booking_notify_slack_webhook_url: "https://hooks.slack.com/services/x" })
        .success,
    ).toBe(true);
    expect(
      settingsSchema.safeParse({ name: "店", booking_notify_slack_webhook_url: "http://hooks.slack.com/services/x" })
        .success,
    ).toBe(false);
    expect(settingsSchema.safeParse({ name: "店", booking_notify_slack_webhook_url: "not-a-url" }).success).toBe(false);
  });

  it("前後の空白はトリムして正規化する", () => {
    const r = settingsSchema.safeParse({ name: "  店  ", contact_phone: "  0701234  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("店");
      expect(r.data.contact_phone).toBe("0701234");
    }
  });
});
