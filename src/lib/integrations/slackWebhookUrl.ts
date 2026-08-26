/**
 * Slack Incoming Webhook URL の判定。依存ゼロなので client / server 両方から使える。
 *
 * hooks.slack.com の /services/... 以外を許すと、予約のたびに顧客名・日時・備考を
 * 任意のサーバーへ POST する「保存型 SSRF / データ流出シンク」になり得るため、
 * 手入力 (設定フォーム) でも OAuth 応答でも同じこの関数で必ず絞る。
 */
export function isSlackIncomingWebhookUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}
