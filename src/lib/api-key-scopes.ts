/**
 * テナント API キー (lk_live_) のスコープ定義。発行 UI と発行 API
 * (/api/admin/integrations/api-keys) で共有する単一の真実。
 *
 * スコープの enforcement は各 route が hasAnyScope() で行う。
 * '*' は全権 (全スコープ相当)。
 */

export const API_KEY_SCOPES = [
  "*",
  "certificates:read",
  "certificates:write",
  "customers:read",
  "customers:write",
  "vehicles:read",
  "vehicles:write",
  "work_history:read",
  "work_history:write",
  "reservations:read",
  "reservations:write",
  "webhooks:read",
  "webhooks:write",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** UI 表示用ラベル (日本語)。 */
export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  "*": "全権 (すべて)",
  "certificates:read": "証明書 読取",
  "certificates:write": "証明書 書込",
  "customers:read": "顧客 読取",
  "customers:write": "顧客 書込 (取込)",
  "vehicles:read": "車両 読取",
  "vehicles:write": "車両 書込 (取込)",
  "work_history:read": "作業履歴 読取",
  "work_history:write": "作業履歴 書込 (取込)",
  "reservations:read": "予約 読取",
  "reservations:write": "予約 書込",
  "webhooks:read": "Webhook 読取",
  "webhooks:write": "Webhook 書込",
};
