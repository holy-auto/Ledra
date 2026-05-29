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
  return {
    startedAt,
    endpoint,
    record(args) {
      const latencyMs = Date.now() - startedAt;
      const log: AiUsageLog = {
        tenantId: args.tenantId,
        insurerId: args.insurerId,
        userId: args.userId,
        endpoint,
        model: args.model,
        outcome: args.outcome,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        confidence: args.confidence,
        latencyMs,
        meta: args.meta,
      };
      void recordAiUsage(log);
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
        model: args.model,
        outcome: sentryOutcome,
        confidence: args.confidence,
        latencyMs,
        meta: args.meta ?? undefined,
      });
    },
  };
}
