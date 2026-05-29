/**
 * AI ルートからのコール毎にログを書く軽量ヘルパー。
 *
 * 設計方針:
 *   - 必ず fire-and-forget。await しても良いが、AI ルートのレスポンスを
 *     ブロックしないよう `void recordAiUsage(...)` で呼ぶ
 *   - エラー (テーブル未マイグレーション / RLS / Supabase 障害) は静かに飲み込み、
 *     console.error にだけ流す
 *   - tenant_id か insurer_id のどちらかは必須。両方無しの場合は記録せず即 return
 *   - 入力 token / 出力 token / latency / confidence は分かる場合のみ
 *
 * outcome:
 *   - "ok": AI が正常に動いた
 *   - "ai_disabled": テナント設定で OFF
 *   - "plan_limit": プラン制限で 403 を返した
 *   - "rate_limit": 429 を返した
 *   - "schema_error": 400 (zod 失敗)
 *   - "error": 500 系 / 例外
 */
import { createTenantScopedAdmin, createInsurerScopedAdmin } from "@/lib/supabase/admin";

export type AiUsageOutcome =
  | "ok"
  | "ai_disabled"
  | "plan_limit"
  | "rate_limit"
  | "schema_error"
  | "error";

export interface AiUsageLog {
  tenantId?: string | null;
  insurerId?: string | null;
  userId?: string | null;
  endpoint: string;
  model?: string | null;
  outcome: AiUsageOutcome;
  inputTokens?: number | null;
  outputTokens?: number | null;
  confidence?: number | null;
  latencyMs?: number | null;
  meta?: Record<string, unknown> | null;
}

export async function recordAiUsage(log: AiUsageLog): Promise<void> {
  if (!log.tenantId && !log.insurerId) return;
  try {
    const admin = log.tenantId
      ? createTenantScopedAdmin(log.tenantId).admin
      : createInsurerScopedAdmin(log.insurerId!).admin;
    await admin.from("ai_usage_logs").insert({
      tenant_id: log.tenantId ?? null,
      insurer_id: log.insurerId ?? null,
      user_id: log.userId ?? null,
      endpoint: log.endpoint,
      model: log.model ?? null,
      outcome: log.outcome,
      input_tokens: log.inputTokens ?? null,
      output_tokens: log.outputTokens ?? null,
      confidence: log.confidence ?? null,
      latency_ms: log.latencyMs ?? null,
      meta: log.meta ?? null,
    });
  } catch (e) {
    // テーブル未マイグレーション (42P01) や RLS 拒否 (PGRST301) はサイレント
    console.error("[ai-usage] insert failed:", e);
  }
}
