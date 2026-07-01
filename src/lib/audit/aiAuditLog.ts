/**
 * AI 関連イベントの監査ログ。
 *
 * 既存の `logAuditEvent` (vehicle_histories ベース) は vehicle / certificate
 * の文脈を前提にしているが、AI イベントはそれらに紐付かないものも多い
 * (settings 変更 / 提案生成 / 提案受諾)。
 *
 * このモジュールは「テナント単位 + ユーザー単位の 1 行記録」を fire-and-forget で
 * vehicle_histories に書き込む。vehicle_id は null、description に JSON を入れて
 * 詳細を保つ (operational dashboards で集計しやすい形)。
 *
 * 失敗は console に出すだけ。AI ルートのレスポンスを止めない。
 */
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

export type AiAuditAction =
  | "ai_settings_changed"
  | "ai_suggestion_generated"
  | "ai_suggestion_applied"
  | "ai_suggestion_rejected"
  | "ai_auto_action_executed";

const TITLE_MAP: Record<AiAuditAction, string> = {
  ai_settings_changed: "AI 自動入力の設定を変更",
  ai_suggestion_generated: "AI 提案を生成",
  ai_suggestion_applied: "AI 提案を反映",
  ai_suggestion_rejected: "AI 提案を却下",
  ai_auto_action_executed: "AI が自動実行",
};

export interface AiAuditEvent {
  tenantId: string;
  userId?: string | null;
  action: AiAuditAction;
  /** 関連エンティティ (job / invoice / inquiry / etc) と ID。デバッグ・集計用 */
  resource?: { kind: string; id?: string | null } | null;
  /** action ごとの構造化詳細。秘匿情報を入れない (logger と同じ秘匿基準)。 */
  detail?: Record<string, unknown>;
}

/**
 * AI 関連イベントを vehicle_histories へ非同期に記録する。
 *
 * vehicle_id / certificate_id は常に null で書き込み、description カラムに
 * `JSON.stringify({ action, resource, detail, user_id })` を入れる。
 *
 * 監査ページ (`/admin/audit`) は description の JSON を opportunistic にパースして
 * 表示すれば良い (既存の表示には影響しない、自由テキストとして読まれる)。
 */
export async function logAiAuditEvent(event: AiAuditEvent): Promise<void> {
  if (!event.tenantId) return;
  try {
    const { admin } = createTenantScopedAdmin(event.tenantId);
    const description = JSON.stringify({
      user_id: event.userId ?? null,
      resource: event.resource ?? null,
      detail: event.detail ?? null,
    });
    await admin.from("vehicle_histories").insert({
      tenant_id: event.tenantId,
      vehicle_id: null,
      certificate_id: null,
      type: event.action,
      title: TITLE_MAP[event.action],
      description,
      performed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[ai-audit] logAiAuditEvent failed:", e);
  }
}

/**
 * opt-in の自動アクションが「実際に実行され業務レコードを作成/変更した」ことを記録する。
 *
 * 人の確認を挟まず service-role で作成される予約/顧客/請求書などの副作用を、後から
 * 「いつ・どのアクションが・何を作ったか」で追跡できるようにするためのヘルパー。
 * userId は常に null (自動実行 = 人ではない)。actionKey には自動化の action key
 * (例: "inbound_message.auto_create_reservation") を入れて集計しやすくする。
 */
export async function logAutoActionExecuted(params: {
  tenantId: string;
  actionKey: string;
  resource?: { kind: string; id?: string | null } | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  return logAiAuditEvent({
    tenantId: params.tenantId,
    userId: null,
    action: "ai_auto_action_executed",
    resource: params.resource ?? null,
    detail: { action_key: params.actionKey, ...(params.detail ?? {}) },
  });
}
