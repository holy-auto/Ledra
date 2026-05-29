/**
 * AI コールごとに Sentry breadcrumb を残し、本番でエラーが起きたときに
 * 「直前に何の AI を叩いていたか」を Sentry の Issue 詳細に表示する。
 *
 * - 既存の `withRetry("anthropic", ...)` の周辺で呼ぶ想定
 * - `import("@sentry/nextjs")` は遅延ロード (test runner / edge では no-op)
 * - 失敗は完全に握り潰す (本処理を止めない)
 *
 * 追加で「AI 関連の例外を Sentry に Tag 付きで投げる」用途には
 * `recordAiBreadcrumb({ outcome: "error", ... })` を呼ぶだけ。
 */

export interface AiBreadcrumbInput {
  /** route / 機能エンドポイント名 */
  endpoint: string;
  /** モデル名 ("claude-sonnet-4-6" / "claude-haiku-4-5" 等) */
  model?: string | null;
  outcome: "started" | "ok" | "error" | "ai_disabled" | "fallback";
  /** AI 自己評価値 (0..1) があれば */
  confidence?: number | null;
  /** レイテンシ (ms) があれば */
  latencyMs?: number | null;
  /** policy / source / intent 等の付随情報 (秘匿情報は入れない) */
  meta?: Record<string, unknown>;
}

export function recordAiBreadcrumb(input: AiBreadcrumbInput): void {
  // Sentry を遅延ロード。test 環境 (vi.mock) ではこのモジュール自体を mock 可。
  import("@sentry/nextjs")
    .then((Sentry) => {
      try {
        Sentry.addBreadcrumb({
          category: "ai",
          type: input.outcome === "error" ? "error" : "info",
          level: input.outcome === "error" ? "error" : "info",
          message: `${input.endpoint} (${input.outcome})`,
          data: {
            endpoint: input.endpoint,
            outcome: input.outcome,
            ...(input.model ? { model: input.model } : {}),
            ...(typeof input.confidence === "number" ? { confidence: input.confidence } : {}),
            ...(typeof input.latencyMs === "number" ? { latency_ms: input.latencyMs } : {}),
            ...(input.meta ?? {}),
          },
        });
      } catch {
        /* noop */
      }
    })
    .catch(() => {
      /* Sentry 未ロード環境 → 何もしない */
    });
}

/**
 * `recordAiBreadcrumb` の AsyncContext 版。任意の AI 処理を包んで:
 *   - 開始 breadcrumb
 *   - 失敗時に error breadcrumb + 例外を rethrow
 *   - 成功時に ok breadcrumb
 * を一括で出す。
 *
 * 戻り値は元関数のもの。例外は元のまま投げ直す (吸収しない)。
 */
export async function withAiBreadcrumb<T>(
  endpoint: string,
  fn: () => Promise<T>,
  options: { model?: string; meta?: Record<string, unknown> } = {},
): Promise<T> {
  const startedAt = Date.now();
  recordAiBreadcrumb({ endpoint, model: options.model, outcome: "started", meta: options.meta });
  try {
    const result = await fn();
    recordAiBreadcrumb({
      endpoint,
      model: options.model,
      outcome: "ok",
      latencyMs: Date.now() - startedAt,
      meta: options.meta,
    });
    return result;
  } catch (err) {
    recordAiBreadcrumb({
      endpoint,
      model: options.model,
      outcome: "error",
      latencyMs: Date.now() - startedAt,
      meta: { ...(options.meta ?? {}), error: err instanceof Error ? err.message : "unknown" },
    });
    throw err;
  }
}
