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
import { afterOrInline } from "@/lib/http/afterOrInline";
import { recordAiUsage, type AiUsageLog, type AiUsageOutcome } from "./usageLog";
import { recordAiBreadcrumb } from "./sentryAiBreadcrumb";
import { addMonthlyCostJpy } from "./costCap";
import { beginAiUsageCapture, getCapturedUsage } from "./usageContext";

/**
 * レスポンス後も確実に実行されるよう Next の after() に委譲する。
 * fire-and-forget だと serverless で応答後にプロミスが落とされ、ログや
 * コストキャップ計上を取りこぼす恐れがあるため。リクエストスコープ外
 * (テスト等) では after() が throw するので即時実行にフォールバックする。
 */
function persistAfterResponse(fn: () => Promise<unknown>): void {
  afterOrInline(fn);
}

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

      // 実際に Anthropic を呼んだ場合のみ実コスト、それ以外 (キャッシュヒット/非AI
      // フォールバック) は 0。ダッシュボードはこの cost_jpy を集計するのでキャップ計上値と一致する。
      const costJpy = captured ? captured.costJpy : 0;
      const log: AiUsageLog = {
        tenantId: args.tenantId,
        insurerId: args.insurerId,
        userId: args.userId,
        endpoint,
        model,
        outcome: args.outcome,
        inputTokens,
        outputTokens,
        costJpy,
        confidence: args.confidence,
        latencyMs,
        meta: args.meta,
      };

      // ログ挿入とコストキャップ加算は after() で応答後に確実に実行する。
      // キャップ課金は「実際に Anthropic を呼んだ (captured)」ことを条件にする (outcome 非依存):
      // - キャッシュヒット/非AIフォールバックは calls=0 → captured=null → 課金しない。
      // - 応答後に schema_error / error で終わってもプロバイダ課金は発生しているので
      //   captured.costJpy で計上する (over-cap 検知の取りこぼしを防ぐ)。
      persistAfterResponse(async () => {
        await recordAiUsage(log);
        if (args.tenantId && captured) {
          await addMonthlyCostJpy(args.tenantId, captured.costJpy);
        }
      });
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
