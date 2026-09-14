/**
 * Slack 連携（予約通知の投稿先）。
 *
 * これまで加盟店は Slack 管理画面で Incoming Webhook を自分で作り、URL をコピーして
 * 設定フォームに貼る必要があった。Slack OAuth (`incoming-webhook` スコープ) にすると
 * 「Slackで連携」→ 投稿先チャンネルを選ぶ、の 2 クリックで終わり、加盟店側の
 * 発行作業がゼロになる。Ledra 側は Slack アプリを 1 度だけ登録すればよい。
 *
 * ponytail: webhook URL の保存先は既存の tenants.booking_notify_slack_webhook_ciphertext
 * のまま（＝単一の真実）。送信側 (lib/notifications/bookingNotify.ts) と手入力フォームを
 * 一切触らずに済み、既に手入力で設定済みのテナントもそのまま動く。
 * 上限: この provider だけ保存先が tenant_integrations の外にある。将来 Slack で
 * webhook 以外（メッセージ更新・スレッド返信など bot token が要る機能）を使うなら、
 * storeTokens を true にして token を tenant_integrations に寄せる。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { buildSecretWrite } from "@/lib/crypto/tenantSecrets";
import { isSlackIncomingWebhookUrl } from "../slackWebhookUrl";
import type { OAuthProviderSpec } from "../types";

/** Slack は失敗時も HTTP 200 + `{ok:false, error:"..."}` を返すので中身で判定する。 */
type SlackOAuthResponse = {
  ok?: boolean;
  error?: string;
  team?: { id?: string; name?: string };
  incoming_webhook?: { url?: string; channel?: string; channel_id?: string };
};

async function writeWebhookUrl(tenantId: string, url: string | null): Promise<void> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { ciphertext } = await buildSecretWrite(url);
  const { error } = await admin
    .from("tenants")
    .update({ booking_notify_slack_webhook_ciphertext: ciphertext })
    .eq("id", tenantId);
  if (error) throw new Error(`Slack webhook URL の保存に失敗しました: ${error.message}`);
}

export const slackProvider: OAuthProviderSpec = {
  id: "slack",
  label: "Slack",
  summary: "新しい予約が入ったときに、選んだチャンネルへ自動投稿します。",

  authorizeUrl: "https://slack.com/oauth/v2/authorize",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  // incoming-webhook だけ。bot token での読み取り権限は要求しない（最小権限）。
  scopes: ["incoming-webhook"],

  clientIdEnv: "SLACK_CLIENT_ID",
  clientSecretEnv: "SLACK_CLIENT_SECRET",

  storeTokens: false,
  returnPath: "/admin/settings/connections",

  async onConnected({ tenantId, token }) {
    const res = token as SlackOAuthResponse;
    if (!res.ok) throw new Error(`Slack が連携を拒否しました (${res.error ?? "unknown_error"})`);

    const url = res.incoming_webhook?.url;
    if (!url) {
      throw new Error(
        "Slack から Incoming Webhook URL が返りませんでした。投稿先チャンネルを選んで再試行してください。",
      );
    }
    // Slack から返った値でも必ず絞る（手入力フォームと同じ判定）。
    if (!isSlackIncomingWebhookUrl(url)) {
      throw new Error("Slack から想定外の Webhook URL が返りました。連携を中止しました。");
    }

    await writeWebhookUrl(tenantId, url);

    return {
      externalAccountId: res.team?.id ?? null,
      externalAccountName: res.team?.name ?? null,
      // 非機密のみ。URL 自体は暗号化列にしか置かない。
      metadata: { channel: res.incoming_webhook?.channel ?? null },
    };
  },

  async onDisconnect({ tenantId }) {
    await writeWebhookUrl(tenantId, null);
  },
};
