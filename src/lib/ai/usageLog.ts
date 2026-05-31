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

export type AiUsageOutcome = "ok" | "ai_disabled" | "plan_limit" | "rate_limit" | "schema_error" | "error";

export interface AiUsageLog {
  tenantId?: string | null;
  insurerId?: string | null;
  userId?: string | null;
  endpoint: string;
  model?: string | null;
  outcome: AiUsageOutcome;
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** 呼び出しの概算コスト (円, cache 込み・モデル別)。usageContext が算出。 */
  costJpy?: number | null;
  confidence?: number | null;
  latencyMs?: number | null;
  meta?: Record<string, unknown> | null;
}

function isMissingColumnError(err: { code?: string } | null | undefined): boolean {
  return err?.code === "42703" || err?.code === "PGRST204";
}

export async function recordAiUsage(log: AiUsageLog): Promise<void> {
  if (!log.tenantId && !log.insurerId) return;
  try {
    const admin = log.tenantId
      ? createTenantScopedAdmin(log.tenantId).admin
      : createInsurerScopedAdmin(log.insurerId!).admin;
    const row = {
      tenant_id: log.tenantId ?? null,
      insurer_id: log.insurerId ?? null,
      user_id: log.userId ?? null,
      endpoint: log.endpoint,
      model: log.model ?? null,
      outcome: log.outcome,
      input_tokens: log.inputTokens ?? null,
      output_tokens: log.outputTokens ?? null,
      cost_jpy: log.costJpy ?? null,
      confidence: log.confidence ?? null,
      latency_ms: log.latencyMs ?? null,
      meta: log.meta ?? null,
    };
    const { error } = await admin.from("ai_usage_logs").insert(row);
    // cost_jpy 列が未作成 (部分マイグレーション) の場合は列を外して再挿入し、
    // 移行ウィンドウ中もログ自体は失わないようにする。
    if (error && isMissingColumnError(error)) {
      const { cost_jpy: _omit, ...rest } = row;
      void _omit;
      await admin.from("ai_usage_logs").insert(rest);
    }
  } catch (e) {
    // テーブル未マイグレーション (42P01) や RLS 拒否 (PGRST301) はサイレント
    console.error("[ai-usage] insert failed:", e);
  }
}
