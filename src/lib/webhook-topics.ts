/**
 * Outbound webhook のトピックレジストリ。
 *
 * 顧客の自社システム (基幹ソフト) が Ledra の変更を webhook で受け取り、
 * 双方向同期する。tenant_webhooks.topics はこのレジストリ (+ ワイルドカード '*')
 * のみ購読可能。発火側は emitTenantEvent(admin, { topic, ... }) を使う。
 *
 * 命名規約: `<resource>.<action>` (例: customer.created)。
 */

export const WEBHOOK_TOPICS = [
  // 証明書
  "certificate.issued",
  // 顧客 (基幹連携 / 手動編集での変更通知)
  "customer.created",
  "customer.updated",
  // 車両
  "vehicle.created",
  "vehicle.updated",
  // 作業履歴
  "work_history.created",
  // 保険会社ケース (損保案件)
  "insurer_case.created",
  "insurer_case.status_changed",
] as const;

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

/** UI 表示用ラベル (日本語)。 */
export const WEBHOOK_TOPIC_LABELS: Record<WebhookTopic, string> = {
  "certificate.issued": "証明書 発行",
  "customer.created": "顧客 作成",
  "customer.updated": "顧客 更新",
  "vehicle.created": "車両 作成",
  "vehicle.updated": "車両 更新",
  "work_history.created": "作業履歴 追加",
  "insurer_case.created": "保険会社ケース 作成",
  "insurer_case.status_changed": "保険会社ケース ステータス変更",
};

const TOPIC_SET = new Set<string>(WEBHOOK_TOPICS);

/** 購読可能なトピックか。'*' (全件) は常に許可。 */
export function isValidWebhookTopic(topic: string): boolean {
  return topic === "*" || TOPIC_SET.has(topic);
}
