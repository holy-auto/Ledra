/**
 * AI ルートの outcome を 1 行で記録するためのラッパヘルパ。
 *
 * 各ルートで:
 *   const usage = startAiRouteUsage("/api/admin/jobs/[id]/ai-suggest");
 *   ...
 *   usage.record({ tenantId, userId, outcome, confidence, ... });
 *
 * これで route ごとに同じ recordAiUsage 呼び出しを書かずに済む。
 * `record` は fire-and-forget (void Promise を返さない) ので await 不要。
 */
import { recordAiUsage, type AiUsageLog, type AiUsageOutcome } from "./usageLog";
import { recordAiBreadcrumb } from "./sentryAiBreadcrumb";
import { addMonthlyCostJpy, estimateCallCostJpy } from "./costCap";
import { beginAiUsageCapture, getCapturedUsage } from "./usageContext";
import { estimateCostJpy } from "./pricing";

export interface RouteUsageHandle {
  startedAt: number;
  endpoint: string;
  record(args: {
    tenantId?: string | null;
    insurerId?: string | null;
    userId?: string | null;
    outcome: AiUsageOutcome;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    confidence?: number | null;
    meta?: Record<string, unknown> | null;
  }): void;
}

export function startAiRouteUsage(endpoint: string): RouteUsageHandle {
  const startedAt = Date.now();
  // このリクエストの Anthropic 呼び出しの usage をこの非同期コンテキストに集計し始める。
  beginAiUsageCapture();
  return {
    startedAt,
    endpoint,
    record(args) {
      const latencyMs = Date.now() - startedAt;
      // 明示指定が無ければキャプチャした実トークン/モデルを使う。
      const cap = getCapturedUsage();
      const captured = cap && cap.calls > 0 ? cap : null;
      const inputTokens = args.inputTokens ?? captured?.inputTokens ?? null;
      const outputTokens = args.outputTokens ?? captured?.outputTokens ?? null;
      const model = args.model ?? captured?.model ?? null;

      const log: AiUsageLog = {
        tenantId: args.tenantId,
        insurerId: args.insurerId,
        userId: args.userId,
        endpoint,
        model,
        outcome: args.outcome,
        inputTokens,
        outputTokens,
        confidence: args.confidence,
        latencyMs,
        meta: args.meta,
      };
      void recordAiUsage(log);
      // 月次コストキャップ用カウンタを加算 (実際に AI を呼んだ ok のみ、best-effort)。
      // 実トークンが取れていればモデル別単価で精算、無ければ endpoint 代表単価で概算。
      if (args.outcome === "ok" && args.tenantId) {
        const costJpy = captured
          ? estimateCostJpy(model, {
              inputTokens: captured.inputTokens,
              outputTokens: captured.outputTokens,
              cacheReadTokens: captured.cacheReadTokens,
              cacheWriteTokens: captured.cacheWriteTokens,
            })
          : estimateCallCostJpy(endpoint);
        void addMonthlyCostJpy(args.tenantId, costJpy);
      }
      // Sentry breadcrumb: outcome を sentry の語彙にマップ
      const sentryOutcome =
        args.outcome === "ok"
          ? "ok"
          : args.outcome === "error"
            ? "error"
            : args.outcome === "ai_disabled"
              ? "ai_disabled"
              : "fallback";
      recordAiBreadcrumb({
        endpoint,
        model,
        outcome: sentryOutcome,
        confidence: args.confidence,
        latencyMs,
        meta: args.meta ?? undefined,
      });
    },
  };
}
